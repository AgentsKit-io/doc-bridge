import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

import {
  createStudyProviderCliConfig,
  calculateStudyCostUsd,
  parseStudyProviderCliConfig,
  validateStudyProviderCommand,
} from '../src/study/provider-cli.js'
import { independentlyAdjudicateStudyObservation } from '../src/study/adjudication.js'
import {
  adjudicateControlledStudyObservation,
  createStudyRepositoryConfig,
  runControlledStudy,
} from '../src/study/execution.js'
import { parseControlledStudyRunPlan, runControlledCommand } from '../src/study/runner.js'
import { parseStudyTaskSuite } from '../src/study/task-suite.js'

const plan = parseControlledStudyRunPlan(JSON.parse(readFileSync(new URL('../docs/study/run-plan-v1.json', import.meta.url), 'utf8')) as unknown)
const suite = parseStudyTaskSuite(JSON.parse(readFileSync(new URL('../docs/study/task-suite-v1.json', import.meta.url), 'utf8')) as unknown)

const providerConfig = createStudyProviderCliConfig({
  type: 'study-provider-cli-config',
  schemaVersion: 1,
  configVersion: 'fixture-v1',
  providers: plan.models.flatMap((model) => plan.scenarios.map((scenario) => ({
    modelId: model.id,
    scenarioIds: [scenario.id],
    command: process.execPath,
    args: ['-e', 'process.stdout.write(JSON.stringify({}))'],
    envAllowlist: [],
    providerNetwork: false,
    maxInputBytes: 1_000_000,
    maxOutputBytes: 10_000,
  }))),
})

const repositoryConfig = createStudyRepositoryConfig({
  type: 'controlled-study-repository-config',
  schemaVersion: 1,
  configVersion: 'fixture-v1',
  repositories: suite.population.map((id) => ({ id, root: process.cwd() })),
})

describe('study provider CLI contract', () => {
  it('content-addresses complete model/scenario mappings', () => {
    const parsed = parseStudyProviderCliConfig(providerConfig)
    expect(parsed.providers).toHaveLength(6)
    expect(parsed.contentHash).toMatch(/^[a-f0-9]{64}$/)
    validateStudyProviderCommand(parsed.providers[0]!, process.cwd())
  })

  it('rejects duplicate model/scenario mappings and missing commands', () => {
    expect(() => createStudyProviderCliConfig({
      type: 'study-provider-cli-config',
      schemaVersion: 1,
      configVersion: 'fixture-v1',
      providers: [
        { ...providerConfig.providers[0], scenarioIds: ['repository-only'] },
        { ...providerConfig.providers[0], scenarioIds: ['repository-only'] },
      ],
    })).not.toThrow()
    const duplicateConfig = createStudyProviderCliConfig({
      type: 'study-provider-cli-config',
      schemaVersion: 1,
      configVersion: 'fixture-v1',
      providers: [providerConfig.providers[0], providerConfig.providers[0]],
    })
    expect(() => parseStudyProviderCliConfig(duplicateConfig)).toThrow('Duplicate study provider mapping')
    expect(() => validateStudyProviderCommand({ ...providerConfig.providers[0]!, command: 'missing-study-provider-cli' }, process.cwd())).toThrow('was not found on PATH')
  })

  it('performs a complete dry-run without invoking a model CLI or writing a ledger', async () => {
    const ledgerPath = join(process.cwd(), '.tmp-study-provider-cli-ledger.json')
    const summary = await runControlledStudy({ plan, suite, providers: providerConfig, repositories: repositoryConfig, ledgerPath, dryRun: true })
    expect(summary).toMatchObject({ status: 'dry-run', planned: 24, executed: 0, skipped: 0 })
    expect(existsSync(ledgerPath)).toBe(false)
  })

  it('records an independent deterministic adjudication without trusting provider outcome', async () => {
    const task = suite.tasks[0]!
    const execution = { taskId: task.id, repositoryId: task.repositoryId, category: task.category, scenarioId: 'repository-only' as const, modelId: 'low-cost-model', replicate: 0, variantId: task.variants[0]!.id }
    const observation = await runControlledCommand({
      plan,
      execution,
      command: process.execPath,
      args: ['-e', "process.stdout.write(JSON.stringify({taskOutcome: 'success', evidenceQuality: 'high', safetyOutcome: 'safe', evidenceIds: ['entrypoint-evidence'], clarificationRequests: 0, reworkCount: 0, inputTokens: 3, outputTokens: 5, tokenMethod: 'provider', measurements: {acceptanceChecksPassed: 1, acceptanceChecksTotal: 1}}))"],
      cwd: process.cwd(),
      contextBytes: 128,
    })
    const adjudicated = adjudicateControlledStudyObservation(task, observation)
    expect(adjudicated.taskOutcome).toBe('success')
    expect(adjudicated.adjudication).toMatchObject({ status: 'automated', actor: 'deterministic-rubric-v1', method: 'deterministic-rubric-v1', outcome: 'success' })
    expect(adjudicated.measurements?.providerTokenCostUnits).toBe(8)
  })

  it('calculates configured USD cost without mixing cached input with uncached input', () => {
    expect(calculateStudyCostUsd({ currency: 'USD', inputPerMillionUsd: 2, cachedInputPerMillionUsd: 1, outputPerMillionUsd: 4 }, { inputTokens: 1_500, cachedInputTokens: 500, outputTokens: 1_000 })).toBe(0.0065)
  })

  it('records independent CLI adjudication, token usage, and configured cost', async () => {
    const task = suite.tasks[0]!
    const execution = { taskId: task.id, repositoryId: task.repositoryId, category: task.category, scenarioId: 'repository-only' as const, modelId: 'low-cost-model', replicate: 0, variantId: task.variants[0]!.id }
    const observation = await runControlledCommand({
      plan,
      execution,
      command: process.execPath,
      args: ['-e', "process.stdout.write(JSON.stringify({taskOutcome: 'success', evidenceQuality: 'high', safetyOutcome: 'safe', evidenceIds: ['bounded-evidence'], clarificationRequests: 0, reworkCount: 0, inputTokens: 3, outputTokens: 5, tokenMethod: 'provider', measurements: {acceptanceChecksPassed: 1, acceptanceChecksTotal: 1}}))"],
      cwd: process.cwd(),
      contextBytes: 128,
    })
    const output = JSON.stringify({ outcome: 'success', confidence: 0.9, reasonCodes: ['rubric-match'], inputTokens: 100, outputTokens: 30, tokenMethod: 'provider', measurements: { cachedInputTokens: 20 } })
    const config = createStudyProviderCliConfig({
      type: 'study-provider-cli-config',
      schemaVersion: 1,
      configVersion: 'adjudicator-fixture-v1',
      providers: [providerConfig.providers[0]],
      adjudicator: {
        id: 'independent-reviewer',
        modelId: 'reference-model',
        command: process.execPath,
        args: ['-e', `process.stdout.write(${JSON.stringify(output)})`],
        envAllowlist: [],
        providerNetwork: false,
        maxInputBytes: 1_000_000,
        maxOutputBytes: 10_000,
        pricing: { currency: 'USD', inputPerMillionUsd: 2, cachedInputPerMillionUsd: 1, outputPerMillionUsd: 4 },
      },
    })
    const parsedConfig = parseStudyProviderCliConfig(config)
    const adjudicated = await independentlyAdjudicateStudyObservation(task, observation, parsedConfig.adjudicator!, process.cwd(), 30_000, parsedConfig.contentHash)
    expect(adjudicated.adjudication).toMatchObject({ status: 'automated', actor: 'independent-reviewer', method: 'independent-rubric-v1', configurationHash: config.contentHash, outcome: 'success', confidence: 0.9, reasonCodes: ['rubric-match'] })
    expect(adjudicated.measurements).toMatchObject({ adjudicatorInputTokens: 100, adjudicatorOutputTokens: 30, adjudicatorTokenCostUnits: 130, adjudicatorCostUsd: 0.0003 })
    expect(adjudicated.adjudication.reason).not.toContain(process.cwd())
  })

  it('keeps adjudication pending when the independent CLI emits invalid output', async () => {
    const task = suite.tasks[0]!
    const execution = { taskId: task.id, repositoryId: task.repositoryId, category: task.category, scenarioId: 'repository-only' as const, modelId: 'low-cost-model', replicate: 0, variantId: task.variants[0]!.id }
    const observation = await runControlledCommand({ plan, execution, command: process.execPath, args: ['-e', "process.stdout.write('{}')"], cwd: process.cwd(), contextBytes: 64 })
    const config = createStudyProviderCliConfig({
      type: 'study-provider-cli-config',
      schemaVersion: 1,
      configVersion: 'adjudicator-invalid-fixture-v1',
      providers: [providerConfig.providers[0]],
      adjudicator: { id: 'invalid-reviewer', modelId: 'reference-model', command: process.execPath, args: ['-e', "process.stdout.write('not-json')"], envAllowlist: [], providerNetwork: false, maxInputBytes: 1_000_000, maxOutputBytes: 10_000 },
    })
    const parsedConfig = parseStudyProviderCliConfig(config)
    const adjudicated = await independentlyAdjudicateStudyObservation(task, observation, parsedConfig.adjudicator!, process.cwd(), 30_000, parsedConfig.contentHash)
    expect(adjudicated.adjudication).toMatchObject({ status: 'pending', actor: 'invalid-reviewer', method: 'independent-rubric-v1' })
    expect(adjudicated.adjudication.outcome).toBeUndefined()
  })

  it('keeps adjudication pending when the independent CLI times out, is unavailable, or exceeds output limits', async () => {
    const task = suite.tasks[0]!
    const execution = { taskId: task.id, repositoryId: task.repositoryId, category: task.category, scenarioId: 'repository-only' as const, modelId: 'low-cost-model', replicate: 0, variantId: task.variants[0]!.id }
    const observation = await runControlledCommand({ plan, execution, command: process.execPath, args: ['-e', 'process.stdout.write("{}")'], cwd: process.cwd(), contextBytes: 0 })
    const base = { type: 'study-provider-cli-config' as const, schemaVersion: 1 as const, configVersion: 'adjudicator-status-fixture-v1', providers: [providerConfig.providers[0]] }
    const run = async (args: string[], maxOutputBytes = 10_000, id = 'status-reviewer', maxRuntimeMs = 1_000) => {
      const config = parseStudyProviderCliConfig(createStudyProviderCliConfig({ ...base, adjudicator: { id, modelId: 'reference-model', command: process.execPath, args, envAllowlist: [], providerNetwork: false, maxInputBytes: 1_000_000, maxOutputBytes } }))
      return independentlyAdjudicateStudyObservation(task, observation, config.adjudicator!, process.cwd(), maxRuntimeMs, config.contentHash)
    }
    expect((await run(['-e', 'setTimeout(() => {}, 1000)'], 10_000, 'timeout-reviewer', 20)).adjudication.reason).toContain('timed-out')
    expect((await run(['-e', 'process.stdout.write("0123456789")'], 2, 'budget-reviewer')).adjudication.reason).toContain('budget-exceeded')
    expect((await run(['-e', 'process.exit(1)'], 10_000, 'unavailable-reviewer')).adjudication.reason).toContain('unavailable')
  })
})
