#!/usr/bin/env node

import { spawn } from 'node:child_process'
import { createHash } from 'node:crypto'
import { fileURLToPath } from 'node:url'

const modelIndex = process.argv.indexOf('--model')
const model = modelIndex >= 0 ? process.argv[modelIndex + 1] : undefined

if (!model || !/^[a-z0-9][a-z0-9._:/-]{0,255}$/.test(model)) {
  process.stderr.write('A valid Codex model is required.\n')
  process.exit(2)
}

const child = spawn('codex', [
  'exec',
  '--ephemeral',
  '--ignore-user-config',
  '--sandbox', 'read-only',
  '--model', model,
  '--output-schema', fileURLToPath(new URL('./study-provider-output.schema.json', import.meta.url)),
  '--json',
  '-',
], {
  cwd: process.cwd(),
  shell: false,
  env: process.env,
  stdio: ['pipe', 'pipe', 'pipe'],
})

let stdout = ''
let stderrBytes = 0
child.stdout.on('data', (chunk) => { stdout += chunk.toString('utf8') })
child.stderr.on('data', (chunk) => { stderrBytes += Buffer.byteLength(chunk); process.stderr.write(chunk) })
const finish = (code, output) => {
  if (output !== undefined) process.stdout.write(`${JSON.stringify(output)}\n`)
  if (code !== 0) process.exitCode = code
}
const normalizeEvidenceIds = (values) => (Array.isArray(values) ? values : [])
  .filter((value) => typeof value === 'string' && value.trim())
  .map((value) => {
    const normalized = value.trim()
    return normalized.length <= 256 && !/[\u0000\r\n]/.test(normalized)
      ? normalized
      : `evidence-${createHash('sha256').update(normalized).digest('hex').slice(0, 32)}`
  })

child.once('error', () => finish(1))
child.once('close', (code) => {
  if (code !== 0) return finish(1)
  const events = stdout.trim().split('\n').filter(Boolean).flatMap((line) => {
    try { return [JSON.parse(line)] } catch { return [] }
  })
  const usage = events.find((event) => event.type === 'turn.completed')?.usage
  const message = [...events]
    .reverse()
    .find((event) => event.type === 'item.completed' && event.item?.type === 'agent_message')
    ?.item?.text
  let metrics
  try { metrics = JSON.parse(message) } catch { return finish(1) }
  if (!metrics || typeof metrics !== 'object' || Array.isArray(metrics)) return finish(1)
  const toolCalls = events.filter((event) => event.type === 'item.completed' && [
    'command_execution', 'mcp_tool_call', 'web_search_call', 'file_search_call', 'computer_call',
  ].includes(event.item?.type)).length
  const modelMeasurements = Array.isArray(metrics.measurements)
    ? Object.fromEntries(metrics.measurements.filter((item) => item && typeof item.name === 'string' && typeof item.value === 'number').map((item) => [item.name, item.value]))
    : {}
  const evidenceIds = normalizeEvidenceIds(metrics.evidenceIds)
  finish(0, {
    ...(typeof metrics.taskOutcome === 'string' ? { taskOutcome: metrics.taskOutcome } : {}),
    ...(typeof metrics.evidenceQuality === 'string' ? { evidenceQuality: metrics.evidenceQuality } : {}),
    ...(typeof metrics.safetyOutcome === 'string' ? { safetyOutcome: metrics.safetyOutcome } : {}),
    evidenceIds,
    ...(Number.isInteger(metrics.clarificationRequests) ? { clarificationRequests: metrics.clarificationRequests } : {}),
    ...(Number.isInteger(metrics.reworkCount) ? { reworkCount: metrics.reworkCount } : {}),
    ...(Number.isInteger(usage?.input_tokens) ? { inputTokens: usage.input_tokens } : {}),
    ...(Number.isInteger(usage?.output_tokens) ? { outputTokens: usage.output_tokens } : {}),
    ...(usage ? { tokenMethod: 'provider' } : {}),
    toolCalls,
    measurements: {
      ...modelMeasurements,
      ...(Number.isInteger(usage?.cached_input_tokens) ? { cachedInputTokens: usage.cached_input_tokens } : {}),
      ...(Number.isInteger(usage?.reasoning_output_tokens) ? { reasoningOutputTokens: usage.reasoning_output_tokens } : {}),
      stderrBytes,
    },
  })
})

process.stdin.pipe(child.stdin)
