import { readFileSync } from 'node:fs'

import { describe, expect, it } from 'vitest'

import {
  createControlledStudyLedger,
  createControlledStudyRunPlan,
  parseControlledStudyLedger,
  parseControlledStudyObservation,
  parseControlledStudyRunPlan,
  runControlledCommand,
  upsertControlledStudyObservation,
} from '../src/study/runner.js'
import { assistedArmReadiness, formatControlledStudyRunText } from '../src/study/execution.js'
import { createStudyProviderCliConfig } from '../src/study/provider-cli.js'
import { parseStudyTaskSuite } from '../src/study/task-suite.js'

const fixture = () => JSON.parse(readFileSync(new URL('../docs/study/run-plan-v1.json', import.meta.url), 'utf8')) as Record<string, unknown>
const plan = () => parseControlledStudyRunPlan(fixture())
const suite = parseStudyTaskSuite(JSON.parse(readFileSync(new URL('../docs/study/task-suite-v1.json', import.meta.url), 'utf8')) as unknown)
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
    const text = formatControlledStudyRunText({
      status: 'dry-run',
      runId: value.runId,
      planned: 24,
      executed: 0,
      skipped: 0,
      providerConfigHash: 'a'.repeat(64),
      repositoryConfigHash: 'b'.repeat(64),
      assistedArm: { status: 'unavailable', reason: 'No provider CLI is configured for the registry-assisted scenario.', recorded: 8 },
    })
    expect(text).toContain('Status: dry-run')
    // An arm that could not run says so, with its reason: a silent third arm is what produced no signal.
    expect(text).toContain('Assisted arm: unavailable (8 execution(s) recorded as unavailable)')
    expect(text.some((line) => line.includes('No provider CLI is configured'))).toBe(true)
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

  it('fails closed for invalid JSON and output over the command budget', async () => {
    const value = plan()
    const execution = { taskId: value.taskIds[0]!, repositoryId: 'consumer-01', category: 'discovery' as const, scenarioId: 'repository-only' as const, modelId: 'low-cost-model', replicate: 0, variantId: 'variant-a' }
    const invalidJson = await runControlledCommand({ plan: value, execution, command: process.execPath, args: ['-e', "process.stdout.write('not-json')"], cwd: process.cwd(), contextBytes: 0 })
    expect(invalidJson.execution.status).toBe('invalid-output')
    expect(invalidJson.execution.errorCode).toBe('invalid-json')
    const outputLimit = await runControlledCommand({ plan: value, execution, command: process.execPath, args: ['-e', "process.stdout.write('0123456789')"], cwd: process.cwd(), contextBytes: 0, maxOutputBytes: 2 })
    expect(outputLimit.execution.status).toBe('budget-exceeded')
    expect(outputLimit.execution.errorCode).toBe('output-limit')
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
    expect(parseControlledStudyObservation(observation)).toEqual(observation)
    expect(() => parseControlledStudyObservation({ ...observation, contentHash: 'a'.repeat(64) })).toThrow('Invalid controlled observation content hash')
    expect(() => parseControlledStudyLedger({ ...first, contentHash: 'a'.repeat(64) })).toThrow('Invalid observation-ledger content hash')
    expect(createControlledStudyLedger({ type: 'controlled-study-observation-ledger', schemaVersion: 1, ledgerVersion: 'v1', observations: [] }).observations).toEqual([])
  })
})

/**
 * The third arm: reserved since the first suite, never executed.
 *
 * A study that quietly drops an arm cannot report on it, which is how the assisted arm stayed
 * unmeasured across four rounds. So readiness is a declared status with a reason, an arm that
 * cannot run records unavailable observations instead of vanishing, and a missing declaration is
 * reported without costing the arm its run.
 */
describe('the assisted arm reports its own readiness', () => {
  const providersFor = (entries: readonly { readonly modelId: string; readonly scenarioIds: readonly string[] }[]) =>
    createStudyProviderCliConfig({
      type: 'study-provider-cli-config',
      schemaVersion: 1,
      configVersion: 'assisted-arm-fixture',
      providers: entries.map((entry) => ({
        modelId: entry.modelId,
        scenarioIds: [...entry.scenarioIds],
        command: process.execPath,
        args: ['-e', 'process.stdout.write(JSON.stringify({}))'],
        envAllowlist: [],
        providerNetwork: false,
        maxInputBytes: 1_000_000,
        maxOutputBytes: 10_000,
      })),
    })

  const everyScenario = () => providersFor(suite.modelIds.flatMap((modelId) => [{ modelId, scenarioIds: [...suite.scenarioIds] }]))

  it('is unavailable — with the reason — when no provider, no scenario, or no agent identity exists', () => {
    const withoutAssistedProvider = providersFor(suite.modelIds.map((modelId) => ({ modelId, scenarioIds: ['repository-only', 'deterministic-doc-bridge'] })))
    expect(assistedArmReadiness(plan(), withoutAssistedProvider, suite)).toMatchObject({
      status: 'unavailable',
      reason: expect.stringContaining('No provider CLI is configured for the registry-assisted scenario'),
    })

    const oneModelShort = providersFor([
      { modelId: suite.modelIds[0]!, scenarioIds: [...suite.scenarioIds] },
      { modelId: suite.modelIds[1]!, scenarioIds: ['repository-only', 'deterministic-doc-bridge'] },
    ])
    expect(assistedArmReadiness(plan(), oneModelShort, suite).reason).toContain(suite.modelIds[1]!)

    // The plan schema pins three scenarios, so an absent third arm can only reach the check here.
    const withoutScenario = { ...plan(), scenarios: plan().scenarios.filter((scenario) => scenario.id !== 'registry-assisted') }
    expect(assistedArmReadiness(withoutScenario, everyScenario(), suite)).toMatchObject({ status: 'unavailable', reason: 'The run plan declares no registry-assisted scenario.' })

    // The plan schema already refuses an assisted scenario with no agent; the check says so too.
    expect(() =>
      rehash({
        ...fixture(),
        scenarios: (fixture().scenarios as Record<string, unknown>[]).map((scenario) => (scenario.id === 'registry-assisted' ? { id: scenario.id, network: false } : scenario)),
      }),
    ).toThrow('require agent identity and version')
    const withoutAgent = { ...plan(), scenarios: plan().scenarios.map((scenario) => (scenario.id === 'registry-assisted' ? { id: scenario.id, network: false } : scenario)) }
    expect(assistedArmReadiness(withoutAgent, everyScenario(), suite).reason).toContain('names no agent identity and version')
  })

  it('runs with a missing prompt version or agent budget, and reports what it could not name', () => {
    // The committed plan declares the agent but neither the prompt version nor the agent budget.
    const ready = assistedArmReadiness(plan(), everyScenario(), suite)
    expect(ready.status).toBe('ready')
    expect(ready.undeclared).toEqual(['promptVersion', 'agentBudget'])
    expect(ready.reason).toContain('cannot be reproduced')

    const declared = rehash({
      ...fixture(),
      scenarios: (fixture().scenarios as Record<string, unknown>[]).map((scenario) =>
        scenario.id === 'registry-assisted' ? { ...scenario, promptVersion: 'v2', agentBudget: { maxTokens: 4_000, maxRuntimeMs: 60_000 } } : scenario,
      ),
    })
    const complete = assistedArmReadiness(declared, everyScenario(), suite)
    expect(complete).toEqual({ status: 'ready' })
    expect(formatControlledStudyRunText({
      status: 'completed',
      runId: declared.runId,
      planned: 1,
      executed: 1,
      skipped: 0,
      providerConfigHash: 'a'.repeat(64),
      repositoryConfigHash: 'b'.repeat(64),
      assistedArm: { ...ready, recorded: 0 },
    }).join('\n')).toContain('undeclared: promptVersion, agentBudget')
  })

  it('refuses the declarations on any other scenario: only the assisted arm has an agent to budget', () => {
    expect(() =>
      rehash({
        ...fixture(),
        scenarios: (fixture().scenarios as Record<string, unknown>[]).map((scenario) =>
          scenario.id === 'repository-only' ? { ...scenario, promptVersion: 'v2' } : scenario,
        ),
      }),
    ).toThrow()
  })
})
