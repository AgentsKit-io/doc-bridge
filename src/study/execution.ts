import { existsSync, readFileSync, statSync } from 'node:fs'
import { resolve } from 'node:path'
import { z } from 'zod'

import { contentHashForArtifactV1, sha256NormalizedV1 } from '../index-builder/content-hash.js'
import {
  createControlledStudyLedger,
  createControlledStudyObservation,
  parseControlledStudyLedger,
  persistControlledStudyLedger,
  runControlledCommand,
  upsertControlledStudyObservation,
  type ControlledStudyObservationLedgerV1,
  type ControlledStudyObservationV1,
  type ControlledStudyRunPlanV1,
  type TaskExecutionV1,
} from './runner.js'
import { providerForStudyExecution, parseStudyProviderCliConfig, validateStudyProviderCommand, type StudyProviderCliConfigV1 } from './provider-cli.js'
import { evaluateStudyTask, parseStudyTaskSuite, selectTaskExecutions, type StudyTaskSuiteV1, type StudyTaskV1 } from './task-suite.js'

const PROVIDER_RESPONSE_CONTRACT = 'Return ONLY one JSON object with exactly these required keys: taskOutcome, evidenceQuality, safetyOutcome, evidenceIds, clarificationRequests, reworkCount, and measurements. measurements must be an array of objects with name (string) and value (non-negative number). Before returning, execute each listed acceptance check when the repository contract makes it available; report acceptanceChecksPassed and acceptanceChecksTotal from observed execution, and report zero passed when a required check is unavailable or blocked. Use canonical measurement names when observed: tokensToFirstEvidence (tokens consumed before correct grounded evidence was in hand), registryAgentInputTokens, registryAgentOutputTokens, registryAgentCostUsd, registryAgentRuns (the enrichment agent of the assisted arm, reported apart from your own cost), searchHitRate, acceptanceChecksPassed, acceptanceChecksTotal, acceptanceChecksExecuted, entrypointEvidenceCount, ownershipEvidenceCount, architectureRelationCount, documentationClaimEvidenceCount, sourceComparisonEvidenceCount, verificationEvidenceCount, errorRate, documentationFindingCount, documentationExampleRate, documentationFreshnessRate, documentationCorrectnessRate, documentationCompletenessRate, documentationClarityRate, documentationMaintainabilityRate, analysisCostUsd, and agentCostUsd. Omit a measurement when it cannot be established; never invent values. Do not include markdown, prose, logs, token counts, or extra top-level keys; never emit logs on stdout.'

export const STUDY_REPOSITORY_CONFIG_SCHEMA_VERSION = 1 as const
export const STUDY_REPOSITORY_CONFIG_CONTENT_HASH_ALGO = 'sha256-normalized-v1' as const

const hash = z.string().regex(/^[a-f0-9]{64}$/)
const identifier = z.string().regex(/^[a-z][a-z0-9-]{0,127}$/)
const reference = z.string().regex(/^[a-z0-9][a-z0-9._:-]{0,255}$/)

const RepositoryConfigPayloadSchema = z.object({
  type: z.literal('controlled-study-repository-config'),
  schemaVersion: z.literal(STUDY_REPOSITORY_CONFIG_SCHEMA_VERSION),
  configVersion: reference,
  repositories: z.array(z.object({
    id: identifier,
    root: z.string().min(1).max(4_096),
  }).strict()).length(6),
}).strict()

export const StudyRepositoryConfigV1Schema = RepositoryConfigPayloadSchema.extend({
  contentHash: hash,
  contentHashAlgo: z.literal(STUDY_REPOSITORY_CONFIG_CONTENT_HASH_ALGO),
}).strict()

export type StudyRepositoryConfigV1 = z.infer<typeof StudyRepositoryConfigV1Schema>

export type ControlledStudyRunOptions = {
  readonly plan: ControlledStudyRunPlanV1
  readonly suite: StudyTaskSuiteV1
  readonly providers: StudyProviderCliConfigV1
  readonly repositories: StudyRepositoryConfigV1
  readonly ledgerPath: string
  readonly round?: string
  readonly dryRun?: boolean
}

/**
 * Whether the assisted arm can run at all, and why not when it cannot.
 *
 * The `registry-assisted` scenario has been reserved since the first suite and has never
 * executed. It must be possible to run a study without it — a missing Registry is a fact about
 * the environment, not a reason to lose the other two arms — so the arm reports itself
 * unavailable and its executions are recorded as unavailable observations.
 */
export type AssistedArmStatus = {
  readonly status: 'ready' | 'unavailable'
  readonly reason?: string
  /**
   * Fields the arm ran without: `promptVersion`, `agentBudget`. It still runs — losing the third
   * arm over a missing declaration would be worse than running it — but a run that cannot name
   * the prompt it used, or cost the enrichment agent apart from the model, says so here.
   */
  readonly undeclared?: readonly string[]
  /** Executions recorded as unavailable because the arm could not run. */
  readonly recorded: number
}

export type ControlledStudyRunSummary = {
  readonly status: 'dry-run' | 'completed'
  readonly runId: string
  readonly planned: number
  readonly executed: number
  readonly skipped: number
  readonly ledgerPath?: string
  readonly ledgerHash?: string
  readonly providerConfigHash: string
  readonly repositoryConfigHash: string
  readonly assistedArm: AssistedArmStatus
}

export const createStudyRepositoryConfig = (input: unknown): StudyRepositoryConfigV1 => {
  const payload = RepositoryConfigPayloadSchema.parse(input)
  const hashable = { ...payload, contentHashAlgo: STUDY_REPOSITORY_CONFIG_CONTENT_HASH_ALGO }
  return StudyRepositoryConfigV1Schema.parse({ ...hashable, contentHash: sha256NormalizedV1(hashable) })
}

export const parseStudyRepositoryConfig = (input: unknown): StudyRepositoryConfigV1 => {
  const config = StudyRepositoryConfigV1Schema.parse(input)
  if (contentHashForArtifactV1(config) !== config.contentHash) throw new Error('Invalid study repository config content hash.')
  if (new Set(config.repositories.map((repository) => repository.id)).size !== config.repositories.length) throw new Error('Study repository config contains duplicate repository ids.')
  return config
}

const emptyLedger = (): ControlledStudyObservationLedgerV1 => createControlledStudyLedger({
  type: 'controlled-study-observation-ledger',
  schemaVersion: 1,
  ledgerVersion: 'v1',
  observations: [],
})

const loadLedger = (path: string): ControlledStudyObservationLedgerV1 => {
  if (!existsSync(path)) return emptyLedger()
  return parseControlledStudyLedger(JSON.parse(readFileSync(path, 'utf8')) as unknown)
}

const executionKey = (execution: { readonly taskId: string; readonly scenarioId: string; readonly modelId: string; readonly replicate: number }): string => sha256NormalizedV1(execution)

export const ASSISTED_SCENARIO = 'registry-assisted' as const

/**
 * What the assisted arm needs before it is allowed to run: a provider for every model, and a
 * scenario that declares the agent, its version, its prompt version and its own budget.
 */
export const assistedArmReadiness = (
  plan: ControlledStudyRunPlanV1,
  providers: StudyProviderCliConfigV1,
  suite: StudyTaskSuiteV1,
): Omit<AssistedArmStatus, 'recorded'> => {
  const scenario = plan.scenarios.find((entry) => entry.id === ASSISTED_SCENARIO)
  if (!scenario) return { status: 'unavailable', reason: 'The run plan declares no registry-assisted scenario.' }
  if (!scenario.agentId || !scenario.agentVersion) {
    return { status: 'unavailable', reason: 'The registry-assisted scenario names no agent identity and version, so nothing it produced could be attributed.' }
  }
  const withoutProvider = suite.modelIds.filter((modelId) => !providers.providers.some((provider) => provider.modelId === modelId && provider.scenarioIds.includes(ASSISTED_SCENARIO)))
  if (withoutProvider.length) {
    return { status: 'unavailable', reason: `No provider CLI is configured for the registry-assisted scenario and model(s) ${withoutProvider.join(', ')}.` }
  }
  const undeclared = [...(scenario.promptVersion ? [] : ['promptVersion']), ...(scenario.agentBudget ? [] : ['agentBudget'])]
  return {
    status: 'ready',
    ...(undeclared.length
      ? {
          undeclared,
          reason: `The registry-assisted scenario declares no ${undeclared.join(' or ')}; the arm runs, but it cannot be ${undeclared.includes('promptVersion') ? 'reproduced' : 'costed'} from this ledger alone.`,
        }
      : {}),
  }
}

/**
 * The observation an unavailable arm leaves behind.
 *
 * Recorded rather than skipped: a scenario absent from the ledger is indistinguishable from one
 * that was never planned, and the study's whole purpose is to compare the arms it planned.
 */
const unavailableObservation = (
  plan: ControlledStudyRunPlanV1,
  execution: TaskExecutionV1,
  reason: string,
  round: string | undefined,
): ControlledStudyObservationV1 => createControlledStudyObservation({
  type: 'controlled-study-observation',
  schemaVersion: 1,
  observationVersion: 'v1',
  observedAt: new Date().toISOString(),
  runId: plan.runId,
  planHash: plan.contentHash,
  task: execution,
  model: plan.models.find((model) => model.id === execution.modelId),
  scenario: plan.scenarios.find((scenario) => scenario.id === execution.scenarioId),
  execution: { status: 'unavailable', exitCode: null, signal: null, durationMs: 0, responseBytes: 0, stderrBytes: 0, errorCode: 'registry-unavailable' },
  contextBytes: 0,
  evidenceIds: [],
  ...(round === undefined ? {} : { round }),
  adjudication: { status: 'automated', actor: 'deterministic-rubric-v1', method: 'deterministic-rubric-v1', outcome: 'blocked', reason },
})

export const adjudicateControlledStudyObservation = (task: StudyTaskV1, observation: ControlledStudyObservationV1): ControlledStudyObservationV1 => {
  const passed = observation.measurements?.acceptanceChecksPassed
  const total = observation.measurements?.acceptanceChecksTotal
  const blocked = observation.execution.status !== 'completed' || passed === undefined || total !== task.acceptanceChecks.length
  const evidenceIds = new Set(observation.evidenceIds)
  const requiredEvidencePresent = task.evidenceRequirements.filter((requirement) => evidenceIds.has(requirement.id)).length
  const evaluation = evaluateStudyTask(task, {
    acceptanceChecksPassed: passed ?? 0,
    evidenceItemsPresent: requiredEvidencePresent,
    blocked,
  })
  const { contentHash: _contentHash, contentHashAlgo: _contentHashAlgo, ...payload } = observation
  return createControlledStudyObservation({
    ...payload,
    adjudication: {
      status: 'automated',
      actor: 'deterministic-rubric-v1',
      method: 'deterministic-rubric-v1',
      outcome: evaluation.status,
      reason: 'Independent bounded evaluation of execution status, acceptance metrics, and exact required evidence coverage.',
    },
  })
}

const assertRunInputs = (options: ControlledStudyRunOptions): Map<string, { readonly id: string; readonly root: string }> => {
  if (options.plan.taskSuiteHash !== options.suite.contentHash) throw new Error('Run plan taskSuiteHash does not match the supplied task suite.')
  if (options.plan.models.map((model) => model.id).sort().join(',') !== [...options.suite.modelIds].sort().join(',')) throw new Error('Run plan model ids do not match the task suite.')
  if (options.plan.scenarios.map((scenario) => scenario.id).sort().join(',') !== [...options.suite.scenarioIds].sort().join(',')) throw new Error('Run plan scenario ids do not match the task suite.')
  if (options.plan.taskIds.slice().sort().join(',') !== options.suite.tasks.map((task) => task.id).sort().join(',')) throw new Error('Run plan task ids do not match the task suite.')
  const repositories = new Map(options.repositories.repositories.map((repository) => [repository.id, repository]))
  for (const repository of options.repositories.repositories) {
    const root = resolve(repository.root)
    if (!existsSync(root) || !statSync(root).isDirectory()) throw new Error(`Study repository ${repository.id} is not available at the configured root.`)
  }
  const executions = selectTaskExecutions(options.suite, options.plan.sampling.sampleSize, options.plan.sampling)
  const assisted = assistedArmReadiness(options.plan, options.providers, options.suite)
  for (const execution of executions) {
    const repository = repositories.get(execution.repositoryId)
    if (!repository) throw new Error(`No repository root is configured for ${execution.repositoryId}.`)
    // An unavailable assisted arm is recorded, not validated: the other two arms still run.
    if (execution.scenarioId === ASSISTED_SCENARIO && assisted.status === 'unavailable') continue
    const provider = providerForStudyExecution(options.providers, execution.modelId, execution.scenarioId as 'repository-only' | 'deterministic-doc-bridge' | 'registry-assisted')
    validateStudyProviderCommand(provider, repository.root)
    const task = options.suite.tasks.find((item) => item.id === execution.taskId)
    if (!task) throw new Error(`Task ${execution.taskId} is not present in the task suite.`)
    const input = JSON.stringify({
      protocol: 'doc-bridge.study-provider.v1',
      response: PROVIDER_RESPONSE_CONTRACT,
      task: { ...execution, difficulty: task.difficulty },
      objective: task.objective,
      initialContext: task.initialContext,
      expectedOutcome: task.expectedOutcome,
      evidenceRequirements: task.evidenceRequirements,
      acceptanceChecks: task.acceptanceChecks,
      allowedTools: task.allowedTools,
      forbiddenActions: task.forbiddenActions,
    })
    if (Buffer.byteLength(input, 'utf8') > provider.maxInputBytes) throw new Error(`Provider CLI input limit ${provider.maxInputBytes} bytes exceeded for ${execution.taskId}.`)
  }
  return repositories
}

export const runControlledStudy = async (options: ControlledStudyRunOptions): Promise<ControlledStudyRunSummary> => {
  const plan = options.plan
  const suite = parseStudyTaskSuite(options.suite)
  const providers = parseStudyProviderCliConfig(options.providers)
  const repositories = parseStudyRepositoryConfig(options.repositories)
  const executions = selectTaskExecutions(suite, plan.sampling.sampleSize, plan.sampling)
  const repositoryMap = assertRunInputs({ ...options, plan, suite, providers, repositories })
  const assisted = assistedArmReadiness(plan, providers, suite)
  if (options.dryRun) return {
    status: 'dry-run',
    runId: plan.runId,
    planned: executions.length,
    executed: 0,
    skipped: 0,
    providerConfigHash: providers.contentHash,
    repositoryConfigHash: repositories.contentHash,
    assistedArm: { ...assisted, recorded: 0 },
  }

  let ledger = loadLedger(resolve(options.ledgerPath))
  if (ledger.observations.some((observation) => observation.runId === plan.runId && observation.planHash !== plan.contentHash)) throw new Error(`Ledger already contains run ${plan.runId} with a different plan hash.`)
  let executed = 0
  let skipped = 0
  let unavailableRecorded = 0
  for (const execution of executions) {
    const existing = ledger.observations.find((observation) => observation.runId === plan.runId && executionKey(observation.task) === executionKey(execution))
    if (existing) { skipped += 1; continue }
    if (execution.scenarioId === ASSISTED_SCENARIO && assisted.status === 'unavailable') {
      const typedUnavailable = { ...execution, difficulty: suite.tasks.find((item) => item.id === execution.taskId)?.difficulty, scenarioId: ASSISTED_SCENARIO } as TaskExecutionV1
      ledger = upsertControlledStudyObservation(ledger, unavailableObservation(plan, typedUnavailable, assisted.reason ?? 'The registry-assisted arm is unavailable.', options.round))
      persistControlledStudyLedger(options.ledgerPath, ledger)
      unavailableRecorded += 1
      continue
    }
    const repository = repositoryMap.get(execution.repositoryId)
    if (!repository) throw new Error(`No repository root is configured for ${execution.repositoryId}.`)
    const provider = providerForStudyExecution(providers, execution.modelId, execution.scenarioId as 'repository-only' | 'deterministic-doc-bridge' | 'registry-assisted')
    const task = suite.tasks.find((item) => item.id === execution.taskId)
    if (!task) throw new Error(`Task ${execution.taskId} is not present in the task suite.`)
    const input = JSON.stringify({
      protocol: 'doc-bridge.study-provider.v1',
      response: PROVIDER_RESPONSE_CONTRACT,
      task: { ...execution, difficulty: task.difficulty },
      objective: task.objective,
      initialContext: task.initialContext,
      expectedOutcome: task.expectedOutcome,
      evidenceRequirements: task.evidenceRequirements,
      acceptanceChecks: task.acceptanceChecks,
      allowedTools: task.allowedTools,
      forbiddenActions: task.forbiddenActions,
    })
    const typedExecution = { ...execution, difficulty: task.difficulty, scenarioId: execution.scenarioId as 'repository-only' | 'deterministic-doc-bridge' | 'registry-assisted' }
    const observation = await runControlledCommand({
      plan,
      execution: typedExecution,
      command: provider.command,
      args: provider.args,
      cwd: repository.root,
      input,
      envAllowlist: provider.envAllowlist,
      maxOutputBytes: Math.min(provider.maxOutputBytes, plan.budget.maxOutputBytes),
      contextBytes: Buffer.byteLength(input, 'utf8'),
      ...(provider.pricing === undefined ? {} : { providerPricing: provider.pricing }),
      ...(options.round === undefined ? {} : { round: options.round }),
    })
    ledger = upsertControlledStudyObservation(ledger, adjudicateControlledStudyObservation(task, observation))
    persistControlledStudyLedger(options.ledgerPath, ledger)
    executed += 1
  }
  return {
    status: 'completed',
    runId: plan.runId,
    planned: executions.length,
    executed,
    skipped,
    ledgerPath: resolve(options.ledgerPath),
    ledgerHash: ledger.contentHash,
    providerConfigHash: providers.contentHash,
    repositoryConfigHash: repositories.contentHash,
    assistedArm: { ...assisted, recorded: unavailableRecorded },
  }
}

export const formatControlledStudyRunText = (summary: ControlledStudyRunSummary): readonly string[] => [
  `Study run: ${summary.runId}`,
  `Status: ${summary.status}`,
  `Planned: ${summary.planned}`,
  `Executed: ${summary.executed}`,
  `Skipped: ${summary.skipped}`,
  ...(summary.ledgerPath === undefined ? [] : [`Ledger: ${summary.ledgerPath}`, `Ledger hash: ${summary.ledgerHash}`]),
  `Provider config hash: ${summary.providerConfigHash}`,
  `Repository config hash: ${summary.repositoryConfigHash}`,
  `Assisted arm: ${summary.assistedArm.status}${summary.assistedArm.recorded ? ` (${summary.assistedArm.recorded} execution(s) recorded as unavailable)` : ''}${summary.assistedArm.undeclared?.length ? ` (undeclared: ${summary.assistedArm.undeclared.join(', ')})` : ''}`,
  ...(summary.assistedArm.reason ? [`  ${summary.assistedArm.reason}`] : []),
]
