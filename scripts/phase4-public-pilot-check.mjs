import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const root = resolve(import.meta.dirname, '..')
const read = (file) => JSON.parse(readFileSync(resolve(root, file), 'utf8'))
const sortValue = (value) => Array.isArray(value)
  ? value.map(sortValue)
  : value && typeof value === 'object'
    ? Object.fromEntries(Object.keys(value).sort().map((key) => [key, sortValue(value[key])]))
    : value
const hashFor = (artifact) => {
  const { contentHash: _contentHash, ...payload } = artifact
  return createHash('sha256').update(JSON.stringify(sortValue(payload)), 'utf8').digest('hex')
}
const suite = read('docs/study/phase4-public-pilot-task-suite-v1.json')
const plan = read('docs/study/phase4-public-pilot-run-plan-v1.json')
const ledger = read('docs/study/phase4-public-pilot-ledger-v1.json')
const result = read('docs/study/phase4-public-pilot-result-v1.json')
const failures = []

if (hashFor(suite) !== suite.contentHash) failures.push('pilot task-suite content hash is stale')
if (hashFor(plan) !== plan.contentHash) failures.push('pilot run-plan content hash is stale')
if (hashFor(ledger) !== ledger.contentHash) failures.push('pilot ledger content hash is stale')
if (hashFor(result) !== result.contentHash) failures.push('pilot result content hash is stale')
if (plan.taskSuiteHash !== suite.contentHash) failures.push('pilot run-plan is not bound to the pilot task suite')
if (suite.population.length !== 1 || suite.tasks.length !== 4) failures.push('pilot scope is not exactly one population and four tasks')
if (plan.sampling.sampleSize !== 16 || result.execution.observations !== 16 || result.execution.completed !== 16) failures.push('pilot does not record the declared 16 completed observations')
if (ledger.contentHash !== result.run.ledgerHash || ledger.observations.length !== result.execution.observations) failures.push('pilot result is not bound to the published ledger')
if (result.execution.failed !== 0 || result.execution.budgetExceeded !== 0) failures.push('final pilot contains failed observations')
if (result.pairedMetrics.pairs !== 8) failures.push('pilot pair count is not eight')
const acceptanceInstrumentation = ledger.observations.filter((observation) => {
  const measurements = observation.measurements ?? {}
  return Number.isInteger(measurements.acceptanceChecksPassed)
    && Number.isInteger(measurements.acceptanceChecksTotal)
    && Number.isInteger(measurements.acceptanceChecksExecuted)
    && measurements.acceptanceChecksTotal > 0
    && measurements.acceptanceChecksExecuted <= measurements.acceptanceChecksTotal
    && measurements.acceptanceChecksPassed <= measurements.acceptanceChecksExecuted
}).length
if (acceptanceInstrumentation !== ledger.observations.length) failures.push('pilot acceptance instrumentation is incomplete')
const baseline = result.pairedMetrics.repositoryOnly.providerTokenEquivalentUnits
const docBridge = result.pairedMetrics.deterministicDocBridge.providerTokenEquivalentUnits
const expectedTokenReduction = (1 - docBridge / baseline) * 100
if (Math.abs(expectedTokenReduction - result.pairedMetrics.providerTokenEquivalentReductionPct) > 0.001) failures.push('provider-token reduction arithmetic is inconsistent')
const baselineP95 = result.pairedMetrics.repositoryOnly.durationP95Ms
const docBridgeP95 = result.pairedMetrics.deterministicDocBridge.durationP95Ms
const expectedLatencyReduction = (1 - docBridgeP95 / baselineP95) * 100
if (Math.abs(expectedLatencyReduction - result.pairedMetrics.durationP95ReductionPct) > 0.001) failures.push('latency reduction arithmetic is inconsistent')

console.log(JSON.stringify({
  status: failures.length === 0 ? 'passed' : 'failed',
  criteria: ['token-efficiency-phase4-pilot'],
  runId: result.run.runId,
  planned: plan.sampling.sampleSize,
  completed: result.execution.completed,
  acceptanceInstrumentation: { complete: acceptanceInstrumentation, observations: ledger.observations.length },
  failures,
}))
if (failures.length > 0) process.exitCode = 1
