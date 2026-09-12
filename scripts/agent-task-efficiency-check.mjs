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

const observations = tasks.map(([term, expectedId]) => {
  const result = spawnSync(process.execPath, [
    join(root, '..', 'bin', 'ak-docs.js'),
    'search',
    term,
    '--agent',
    '--config',
    config,
  ], { encoding: 'utf8' })

  if (result.status !== 0) {
    return { term, expectedId, correct: false, error: result.stderr.trim() || `exit ${result.status}` }
  }

  try {
    const payload = JSON.parse(result.stdout)
    return {
      term,
      expectedId,
      correct: payload.bestMatch?.id === expectedId,
      responseBytes: payload.telemetry?.contextBytes ?? null,
      estimatedTokens: payload.telemetry?.estimatedTokens ?? null,
    }
  } catch (error) {
    return { term, expectedId, correct: false, error: error instanceof Error ? error.message : String(error) }
  }
})

const correct = observations.filter((observation) => observation.correct)
const tokens = observations.flatMap((observation) => observation.estimatedTokens === null ? [] : [observation.estimatedTokens])
const bytes = observations.flatMap((observation) => observation.responseBytes === null ? [] : [observation.responseBytes])
const report = {
  status: correct.length === tasks.length ? 'passed' : 'failed',
  criteria: ['retrieval-efficiency'],
  benchmark: 'agent-task-efficiency-v1',
  fixture: 'tests/fixtures/sample-project',
  taskCount: tasks.length,
  correctTaskCount: correct.length,
  correctnessRate: correct.length / tasks.length,
  estimatedTokensP95: percentile95(tokens),
  tokensToCorrectAnswerP95: correct.length === tasks.length ? percentile95(tokens) : null,
  responseBytesP95: percentile95(bytes),
  observations,
}

process.stdout.write(`${JSON.stringify(report)}\n`)
if (report.status !== 'passed') process.exitCode = 1
