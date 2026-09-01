#!/usr/bin/env node

import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const modelIndex = process.argv.indexOf('--model')
const model = modelIndex >= 0 ? process.argv[modelIndex + 1] : undefined
if (!model || !/^[a-z0-9][a-z0-9._:/-]{0,255}$/.test(model)) {
  process.stderr.write('A valid adjudicator model is required.\n')
  process.exit(2)
}

const child = spawn('codex', [
  'exec', '--ephemeral', '--ignore-user-config', '--sandbox', 'read-only', '--model', model,
  '--output-schema', fileURLToPath(new URL('./study-adjudicator-output.schema.json', import.meta.url)), '--json', '-',
], { cwd: process.cwd(), shell: false, env: process.env, stdio: ['pipe', 'pipe', 'pipe'] })

let stdout = ''
child.stderr.on('data', (chunk) => process.stderr.write(chunk))
child.stdout.on('data', (chunk) => { stdout += chunk.toString('utf8') })
child.once('error', () => { process.exitCode = 1 })
child.once('close', (code) => {
  if (code !== 0) { process.exitCode = 1; return }
  const events = stdout.trim().split('\n').filter(Boolean).flatMap((line) => { try { return [JSON.parse(line)] } catch { return [] } })
  const usage = events.find((event) => event.type === 'turn.completed')?.usage
  const message = [...events].reverse().find((event) => event.type === 'item.completed' && event.item?.type === 'agent_message')?.item?.text
  let output
  try { output = JSON.parse(message) } catch { process.exitCode = 1; return }
  if (!output || typeof output !== 'object' || Array.isArray(output)) { process.exitCode = 1; return }
  const reasonCodes = Array.isArray(output.reasonCodes) ? output.reasonCodes.filter((value) => typeof value === 'string' && /^[a-z][a-z0-9-]{0,127}$/.test(value)) : []
  process.stdout.write(`${JSON.stringify({
    outcome: output.outcome,
    confidence: output.confidence,
    reasonCodes,
    ...(Number.isInteger(usage?.input_tokens) ? { inputTokens: usage.input_tokens } : {}),
    ...(Number.isInteger(usage?.output_tokens) ? { outputTokens: usage.output_tokens } : {}),
    ...(usage ? { tokenMethod: 'provider' } : {}),
    measurements: {
      ...(output.measurements && typeof output.measurements === 'object' && !Array.isArray(output.measurements) ? output.measurements : {}),
      ...(Number.isInteger(usage?.cached_input_tokens) ? { cachedInputTokens: usage.cached_input_tokens } : {}),
    },
  })}\n`)
})

process.stdin.pipe(child.stdin)
