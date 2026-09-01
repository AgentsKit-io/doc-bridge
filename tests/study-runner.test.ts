import { readFileSync } from 'node:fs'

import { describe, expect, it } from 'vitest'

import {
  createControlledStudyLedger,
  createControlledStudyRunPlan,
  parseControlledStudyLedger,
  parseControlledStudyRunPlan,
  runControlledCommand,
  upsertControlledStudyObservation,
} from '../src/study/runner.js'

const fixture = () => JSON.parse(readFileSync(new URL('../docs/study/run-plan-v1.json', import.meta.url), 'utf8')) as Record<string, unknown>
const plan = () => parseControlledStudyRunPlan(fixture())
const rehash = (value: Record<string, unknown>) => {
  const { contentHash: _contentHash, contentHashAlgo: _contentHashAlgo, ...payload } = value
  return createControlledStudyRunPlan(payload)
}

describe('controlled study runner', () => {
  it('validates the pinned two-model, three-scenario run plan', () => {
    const value = plan()
    expect(value.models).toHaveLength(2)
    expect(value.scenarios).toHaveLength(3)
    expect(value.taskIds).toHaveLength(24)
  })

  it('accepts a pairwise sampling plan without weakening the three-scenario suite', () => {
    const value = rehash({ ...fixture(), sampling: { strategy: 'pairwise-task-strata', sampleSize: 96, scenarioIds: ['repository-only', 'deterministic-doc-bridge'] }, runId: 'pairwise-plan-test' })
    expect(value.sampling.strategy).toBe('pairwise-task-strata')
  })

  it('runs a real isolated CLI command and records bounded provenance without raw output', async () => {
    const value = plan()
    const execution = { taskId: value.taskIds[0]!, repositoryId: 'consumer-01', category: 'discovery' as const, scenarioId: 'repository-only' as const, modelId: 'low-cost-model', replicate: 0, variantId: 'variant-a' }
    const observation = await runControlledCommand({ plan: value, execution, command: process.execPath, args: ['-e', "process.stdout.write(JSON.stringify({inputTokens: 3, outputTokens: 5, tokenMethod: 'provider', toolCalls: 2, taskOutcome: 'success', evidenceQuality: 'high', evidenceIds: ['src/index.ts'], measurements: {searchHitRate: 1}}))"], cwd: process.cwd(), contextBytes: 128, maxOutputBytes: 256 })
    expect(observation.execution.status).toBe('completed')
    expect(observation.execution.inputTokens).toBe(3)
    expect(observation.execution.outputTokens).toBe(5)
    expect(observation.taskOutcome).toBe('success')
    expect(observation.evidenceQuality).toBe('high')
    expect(observation.evidenceIds).toEqual(['src/index.ts'])
    expect(observation.measurements).toEqual({ searchHitRate: 1, providerTokenCostUnits: 8 })
    expect(observation.execution.stdoutHash).toMatch(/^[a-f0-9]{64}$/)
    expect(observation).not.toHaveProperty('stdout')
  })

  it('fails closed for timeouts, unavailable commands, and token budgets', async () => {
    const base = fixture()
    const timeoutPlan = rehash({ ...base, budget: { ...(base.budget as Record<string, unknown>), maxRuntimeMs: 20, maxAttempts: 1 } })
    const execution = { taskId: timeoutPlan.taskIds[0]!, repositoryId: 'consumer-01', category: 'discovery' as const, scenarioId: 'repository-only' as const, modelId: 'low-cost-model', replicate: 0, variantId: 'variant-a' }
    const timedOut = await runControlledCommand({ plan: timeoutPlan, execution, command: process.execPath, args: ['-e', 'setTimeout(() => {}, 1000)'], cwd: process.cwd(), contextBytes: 0 })
    expect(timedOut.execution.status).toBe('timed-out')
    const unavailable = await runControlledCommand({ plan: timeoutPlan, execution, command: '/definitely/missing/study-agent', cwd: process.cwd(), contextBytes: 0 })
    expect(unavailable.execution.status).toBe('unavailable')
    const budgetPlan = rehash({ ...base, budget: { ...(base.budget as Record<string, unknown>), maxTokens: 10, maxAttempts: 1 } })
    const budgeted = await runControlledCommand({ plan: budgetPlan, execution, command: process.execPath, args: ['-e', "process.stdout.write(JSON.stringify({inputTokens: 9, outputTokens: 2, tokenMethod: 'provider'}))"], cwd: process.cwd(), contextBytes: 0 })
    expect(budgeted.execution.status).toBe('budget-exceeded')
    const invalidMetrics = await runControlledCommand({ plan: plan(), execution, command: process.execPath, args: ['-e', "process.stdout.write(JSON.stringify({inputTokens: 'unknown'}))"], cwd: process.cwd(), contextBytes: 0 })
    expect(invalidMetrics.execution.status).toBe('invalid-output')
    expect(invalidMetrics.execution.errorCode).toBe('invalid-metrics')
  })

  it('terminates a nested provider process when the wrapper times out', async () => {
    const value = rehash({ ...fixture(), budget: { ...(fixture().budget as Record<string, unknown>), maxRuntimeMs: 20, maxAttempts: 1 } })
    const execution = { taskId: value.taskIds[0]!, repositoryId: 'consumer-01', category: 'discovery' as const, scenarioId: 'repository-only' as const, modelId: 'low-cost-model', replicate: 0, variantId: 'variant-a' }
    const started = Date.now()
    const timedOut = await runControlledCommand({ plan: value, execution, command: process.execPath, args: ['-e', "const {spawn}=require('node:child_process');spawn(process.execPath,['-e','setTimeout(()=>{},10000)'],{stdio:'ignore'});setTimeout(()=>{},10000)"], cwd: process.cwd(), contextBytes: 0 })
    expect(timedOut.execution.status).toBe('timed-out')
    expect(Date.now() - started).toBeLessThan(2_000)
  })

  it('retries a failed attempt in a fresh session and records only the successful result', async () => {
    const value = rehash({ ...fixture(), budget: { ...(fixture().budget as Record<string, unknown>), maxAttempts: 2 } })
    const execution = { taskId: value.taskIds[0]!, repositoryId: 'consumer-01', category: 'discovery' as const, scenarioId: 'repository-only' as const, modelId: 'low-cost-model', replicate: 0, variantId: 'variant-a' }
    const retried = await runControlledCommand({ plan: value, execution, command: process.execPath, args: ['-e', "if (process.env.DOC_BRIDGE_STUDY_SESSION_ID.endsWith('-1')) process.exit(1); process.stdout.write('{}')"], cwd: process.cwd(), contextBytes: 0 })
    expect(retried.execution.status).toBe('completed')
  })

  it('replays observations idempotently and rejects tampered ledgers', async () => {
    const value = plan()
    const execution = { taskId: value.taskIds[0]!, repositoryId: 'consumer-01', category: 'discovery' as const, scenarioId: 'repository-only' as const, modelId: 'low-cost-model', replicate: 0, variantId: 'variant-a' }
    const observation = await runControlledCommand({ plan: value, execution, command: process.execPath, args: ['-e', 'process.stdout.write("{}")'], cwd: process.cwd(), contextBytes: 0 })
    const empty = parseControlledStudyLedger({ type: 'controlled-study-observation-ledger', schemaVersion: 1, ledgerVersion: 'v1', observations: [], contentHashAlgo: 'sha256-normalized-v1', contentHash: 'd7aacae053872796b29fbb6cca38a41a5fb2d542c7a5628c0671c9add14f9955' })
    const first = upsertControlledStudyObservation(empty, observation)
    expect(upsertControlledStudyObservation(first, observation)).toEqual(first)
    expect(() => parseControlledStudyLedger({ ...first, contentHash: 'a'.repeat(64) })).toThrow('Invalid observation-ledger content hash')
    expect(createControlledStudyLedger({ type: 'controlled-study-observation-ledger', schemaVersion: 1, ledgerVersion: 'v1', observations: [] }).observations).toEqual([])
  })
})
