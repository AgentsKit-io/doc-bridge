import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const root = dirname(fileURLToPath(import.meta.url))
const config = join(root, '..', 'tests', 'fixtures', 'sample-project', 'doc-bridge.config.json')
const tasks = [
  ['schema', 'os-core'],
  ['start here', 'INDEX'],
  ['os-core', 'os-core'],
  ['routing', 'INDEX'],
]

const percentile95 = (values) => {
  const sorted = [...values].sort((a, b) => a - b)
  return sorted.length ? sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * 0.95) - 1)] : null
}

const run = (term, extraArgs = []) => {
  const startedAt = performance.now()
  const result = spawnSync(process.execPath, [
    join(root, '..', 'bin', 'ak-docs.js'),
    'search',
    term,
    '--agent',
    ...extraArgs,
    '--config',
    config,
  ], { encoding: 'utf8' })
  const latencyMs = Math.round(performance.now() - startedAt)

  if (result.status !== 0) {
    return { term, correct: false, latencyMs, error: result.stderr.trim() || `exit ${result.status}` }
  }

  try {
    const payload = JSON.parse(result.stdout)
    const compactWireBytes = Buffer.byteLength(JSON.stringify(payload), 'utf8')
    const formattedWireBytes = Buffer.byteLength(JSON.stringify(payload, null, 2), 'utf8')
    return {
      term,
      correct: payload.bestMatch?.id,
      latencyMs,
      responseBytes: payload.telemetry?.contextBytes ?? null,
      estimatedTokens: payload.telemetry?.estimatedTokens ?? null,
      wireBytes: Buffer.byteLength(result.stdout, 'utf8'),
      compactWireBytes,
      formattedWireBytes,
      truncated: payload.telemetry?.truncated ?? false,
    }
  } catch (error) {
    return { term, correct: false, latencyMs, error: error instanceof Error ? error.message : String(error) }
  }
}

const baseline = tasks.map(([term, expectedId]) => ({ ...run(term, ['--context-budget=256']), expectedId }))
const optimized = tasks.map(([term, expectedId]) => ({ ...run(term, ['--mode=discovery', '--context-budget=32']), expectedId }))
const observations = baseline.map((observation, index) => ({
  term: observation.term,
  expectedId: observation.expectedId,
  correct: observation.correct === observation.expectedId && optimized[index]?.correct === observation.expectedId,
  baselineEstimatedTokens: observation.estimatedTokens,
  optimizedEstimatedTokens: optimized[index]?.estimatedTokens ?? null,
  baselineResponseBytes: observation.responseBytes,
  optimizedResponseBytes: optimized[index]?.responseBytes ?? null,
  baselineWireBytes: observation.wireBytes,
  optimizedWireBytes: optimized[index]?.wireBytes ?? null,
  baselineLatencyMs: observation.latencyMs,
  optimizedLatencyMs: optimized[index]?.latencyMs ?? null,
  compactWireBytes: optimized[index]?.compactWireBytes ?? null,
  formattedWireBytes: optimized[index]?.formattedWireBytes ?? null,
  truncated: optimized[index]?.truncated ?? false,
}))

const correct = observations.filter((observation) => observation.correct)
const baselineTokens = observations.flatMap((observation) => observation.baselineEstimatedTokens === null ? [] : [observation.baselineEstimatedTokens])
const optimizedTokens = observations.flatMap((observation) => observation.optimizedEstimatedTokens === null ? [] : [observation.optimizedEstimatedTokens])
const baselineBytes = observations.flatMap((observation) => observation.baselineResponseBytes === null ? [] : [observation.baselineResponseBytes])
const optimizedBytes = observations.flatMap((observation) => observation.optimizedResponseBytes === null ? [] : [observation.optimizedResponseBytes])
const baselineWireBytes = observations.flatMap((observation) => observation.baselineWireBytes === null ? [] : [observation.baselineWireBytes])
const optimizedWireBytes = observations.flatMap((observation) => observation.optimizedWireBytes === null ? [] : [observation.optimizedWireBytes])
const compactWireBytes = observations.flatMap((observation) => observation.compactWireBytes === null ? [] : [observation.compactWireBytes])
const formattedWireBytes = observations.flatMap((observation) => observation.formattedWireBytes === null ? [] : [observation.formattedWireBytes])
const baselineLatencyMs = observations.flatMap((observation) => observation.baselineLatencyMs === undefined ? [] : [observation.baselineLatencyMs])
const optimizedLatencyMs = observations.flatMap((observation) => observation.optimizedLatencyMs === null ? [] : [observation.optimizedLatencyMs])
const baselineP95 = percentile95(baselineTokens)
const optimizedP95 = percentile95(optimizedTokens)
const report = {
  status: correct.length === tasks.length ? 'passed' : 'failed',
  criteria: ['retrieval-efficiency', 'token-efficiency-phase2'],
  benchmark: 'agent-task-efficiency-v1',
  fixture: 'tests/fixtures/sample-project',
  taskCount: tasks.length,
  correctTaskCount: correct.length,
  correctnessRate: correct.length / tasks.length,
  baselineEstimatedTokensP95: baselineP95,
  optimizedEstimatedTokensP95: optimizedP95,
  estimatedTokensP95: optimizedP95,
  contextReduction: baselineP95 && optimizedP95 !== null ? 1 - optimizedP95 / baselineP95 : null,
  tokensToCorrectAnswerP95: correct.length === tasks.length ? optimizedP95 : null,
  baselineResponseBytesP95: percentile95(baselineBytes),
  optimizedResponseBytesP95: percentile95(optimizedBytes),
  responseBytesP95: percentile95(optimizedBytes),
  baselineWireBytesP95: percentile95(baselineWireBytes),
  optimizedWireBytesP95: percentile95(optimizedWireBytes),
  baselineLatencyMsP95: percentile95(baselineLatencyMs),
  optimizedLatencyMsP95: percentile95(optimizedLatencyMs),
  latencyMeasurement: 'wall-clock per isolated CLI invocation; latency is reported separately from context reduction',
  compactWireBytesP95: percentile95(compactWireBytes),
  formattedWireBytesP95: percentile95(formattedWireBytes),
  agentJsonWhitespaceReduction: percentile95(formattedWireBytes) && percentile95(compactWireBytes) !== null
    ? 1 - percentile95(compactWireBytes) / percentile95(formattedWireBytes)
    : null,
  truncatedCount: observations.filter((observation) => observation.truncated).length,
  observations,
}

process.stdout.write(`${JSON.stringify(report)}\n`)
if (report.status !== 'passed') process.exitCode = 1
