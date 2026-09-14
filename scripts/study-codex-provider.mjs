#!/usr/bin/env node

import { spawn, spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { resolve } from 'node:path'
import { measureProviderToolTelemetry } from '../dist/index.js'
import { resolveDocBridgeQueryId } from './study-doc-bridge-query.mjs'

const modelIndex = process.argv.indexOf('--model')
const model = modelIndex >= 0 ? process.argv[modelIndex + 1] : undefined
const docBridgeQueryIndex = process.argv.indexOf('--doc-bridge-query')
const docBridgeQuery = docBridgeQueryIndex >= 0
  ? process.argv.slice(docBridgeQueryIndex + 1, docBridgeQueryIndex + 3)
  : []

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
let inputBytes = 0
let docBridgeHandoffBytes = 0
const providerStartedAt = performance.now()
let firstToolEventLatencyMs
let pendingLine = ''
const isToolEvent = (event) => event?.type === 'item.completed' && [
  'command_execution', 'mcp_tool_call', 'web_search_call', 'file_search_call', 'computer_call',
].includes(event.item?.type)
child.stdout.on('data', (chunk) => { stdout += chunk.toString('utf8') })
child.stdout.on('data', (chunk) => {
  pendingLine += chunk.toString('utf8')
  const lines = pendingLine.split('\n')
  pendingLine = lines.pop() ?? ''
  for (const line of lines) {
    try {
      if (firstToolEventLatencyMs === undefined && isToolEvent(JSON.parse(line))) firstToolEventLatencyMs = Math.round(performance.now() - providerStartedAt)
    } catch {}
  }
})
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
  const toolTelemetry = measureProviderToolTelemetry(events)
  const evidenceIds = normalizeEvidenceIds(metrics.evidenceIds)
  finish(0, {
    ...(typeof metrics.taskOutcome === 'string' ? { taskOutcome: metrics.taskOutcome } : {}),
    ...(typeof metrics.evidenceQuality === 'string' ? { evidenceQuality: metrics.evidenceQuality } : {}),
    ...(typeof metrics.safetyOutcome === 'string' ? { safetyOutcome: metrics.safetyOutcome } : {}),
    evidenceIds,
    ...(Number.isInteger(metrics.clarificationRequests) ? { clarificationRequests: metrics.clarificationRequests } : {}),
    ...(Number.isInteger(metrics.reworkCount) ? { reworkCount: metrics.reworkCount } : {}),
    ...(Number.isInteger(metrics.firstEvidenceLatencyMs) ? { firstEvidenceLatencyMs: metrics.firstEvidenceLatencyMs } : {}),
    ...(Number.isInteger(usage?.input_tokens) ? { inputTokens: usage.input_tokens } : {}),
    ...(Number.isInteger(usage?.output_tokens) ? { outputTokens: usage.output_tokens } : {}),
    ...(usage ? { tokenMethod: 'provider' } : {}),
    toolCalls,
    measurements: {
      ...modelMeasurements,
      ...(Number.isInteger(usage?.cached_input_tokens) ? { cachedInputTokens: usage.cached_input_tokens } : {}),
      ...(Number.isInteger(usage?.reasoning_output_tokens) ? { reasoningOutputTokens: usage.reasoning_output_tokens } : {}),
      observedToolEventCount: toolTelemetry.observedToolEventCount,
      observedToolInputBytes: toolTelemetry.observedToolInputBytes,
      observedToolOutputBytes: toolTelemetry.observedToolOutputBytes,
      observedProviderInputBytes: inputBytes,
      observedAgentMessageBytes: Buffer.byteLength(message ?? '', 'utf8'),
      observedContextBytes: inputBytes + toolTelemetry.observedToolOutputBytes,
      observedProviderDurationMs: Math.round(performance.now() - providerStartedAt),
      ...(firstToolEventLatencyMs === undefined ? {} : { timeToFirstToolEventMs: firstToolEventLatencyMs }),
      ...(docBridgeQuery.length === 2 ? { docBridgeQueryCount: 1, docBridgeHandoffBytes } : {}),
      stderrBytes,
    },
  })
})

let requestInput = ''
process.stdin.on('data', (chunk) => { requestInput += chunk.toString('utf8') })
process.stdin.once('end', () => {
  let providerInput = requestInput
  if (docBridgeQuery.length === 2) {
    const queryType = docBridgeQuery[0]
    const queryId = resolveDocBridgeQueryId(JSON.parse(readFileSync(resolve(process.cwd(), '.doc-bridge/index.json'), 'utf8')), queryType, docBridgeQuery[1])
    if (typeof queryId !== 'string' || queryId.length === 0) {
      child.stdin.destroy()
      child.kill('SIGTERM')
      finish(1)
      return
    }
    const query = spawnSync(process.execPath, [
      fileURLToPath(new URL('../bin/ak-docs.js', import.meta.url)),
      'query', queryType, queryId, '--agent',
    ], {
      cwd: process.cwd(),
      encoding: 'utf8',
      maxBuffer: 64 * 1024,
      shell: false,
    })
    if (query.status !== 0 || query.error) {
      child.stdin.destroy()
      child.kill('SIGTERM')
      finish(1)
      return
    }
    try {
      const compactHandoff = JSON.stringify(JSON.parse(query.stdout))
      docBridgeHandoffBytes = Buffer.byteLength(compactHandoff, 'utf8')
      providerInput = JSON.stringify({
        ...JSON.parse(requestInput),
        deterministicDocBridgeInstruction: 'Use deterministicDocBridgeHandoff as the first evidence source. Follow its startHere and readBeforeEditing paths, then use repository tools only to verify gaps or acceptance checks.',
        deterministicDocBridgeHandoff: compactHandoff,
      })
    } catch {
      child.stdin.destroy()
      child.kill('SIGTERM')
      finish(1)
      return
    }
  }
  inputBytes = Buffer.byteLength(providerInput, 'utf8')
  child.stdin.end(providerInput)
})
