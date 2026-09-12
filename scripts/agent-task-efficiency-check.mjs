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
  const result = spawnSync(process.execPath, [
    join(root, '..', 'bin', 'ak-docs.js'),
    'search',
    term,
    '--agent',
    ...extraArgs,
    '--config',
    config,
  ], { encoding: 'utf8' })

  if (result.status !== 0) {
    return { term, correct: false, error: result.stderr.trim() || `exit ${result.status}` }
  }

  try {
    const payload = JSON.parse(result.stdout)
    return {
      term,
      correct: payload.bestMatch?.id,
      responseBytes: payload.telemetry?.contextBytes ?? null,
      estimatedTokens: payload.telemetry?.estimatedTokens ?? null,
      truncated: payload.telemetry?.truncated ?? false,
    }
  } catch (error) {
    return { term, correct: false, error: error instanceof Error ? error.message : String(error) }
  }
}

const baseline = tasks.map(([term, expectedId]) => ({ ...run(term), expectedId }))
const optimized = tasks.map(([term, expectedId]) => ({ ...run(term, ['--mode=discovery', '--context-budget=32']), expectedId }))
const observations = baseline.map((observation, index) => ({
  term: observation.term,
  expectedId: observation.expectedId,
  correct: observation.correct === observation.expectedId && optimized[index]?.correct === observation.expectedId,
  baselineEstimatedTokens: observation.estimatedTokens,
  optimizedEstimatedTokens: optimized[index]?.estimatedTokens ?? null,
  baselineResponseBytes: observation.responseBytes,
  optimizedResponseBytes: optimized[index]?.responseBytes ?? null,
  truncated: optimized[index]?.truncated ?? false,
}))

const correct = observations.filter((observation) => observation.correct)
const baselineTokens = observations.flatMap((observation) => observation.baselineEstimatedTokens === null ? [] : [observation.baselineEstimatedTokens])
const optimizedTokens = observations.flatMap((observation) => observation.optimizedEstimatedTokens === null ? [] : [observation.optimizedEstimatedTokens])
const baselineBytes = observations.flatMap((observation) => observation.baselineResponseBytes === null ? [] : [observation.baselineResponseBytes])
const optimizedBytes = observations.flatMap((observation) => observation.optimizedResponseBytes === null ? [] : [observation.optimizedResponseBytes])
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
  truncatedCount: observations.filter((observation) => observation.truncated).length,
  observations,
}

process.stdout.write(`${JSON.stringify(report)}\n`)
if (report.status !== 'passed') process.exitCode = 1
