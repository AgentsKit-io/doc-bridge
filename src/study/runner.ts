import { spawn } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { z } from 'zod'

import { contentHashForArtifactV1, sha256NormalizedV1 } from '../index-builder/content-hash.js'
import { isSafeStudyText } from './protocol.js'
import { calculateStudyCostUsd, type StudyProviderCostPricing } from './provider-cli.js'

export const STUDY_RUNNER_SCHEMA_VERSION = 1 as const
export const STUDY_RUNNER_CONTENT_HASH_ALGO = 'sha256-normalized-v1' as const

const hash = z.string().regex(/^[a-f0-9]{64}$/)
const identifier = z.string().regex(/^[a-z][a-z0-9-]{0,127}$/)
const evidenceId = z.string().min(1).max(256).refine((value) => !/[\u0000\r\n]/.test(value), 'Evidence IDs cannot contain control characters.')
const reference = z.string().regex(/^[a-z0-9][a-z0-9._:-]{0,255}$/)
const outcome = z.enum(['success', 'partial', 'incorrect', 'incomplete', 'blocked'])
const modelReference = z.string().regex(/^[a-z0-9][a-z0-9._:/-]{0,255}$/)
const safeText = z.string().min(1).max(2_048).refine(
  isSafeStudyText,
  'Public study text cannot contain paths, URLs, credentials, or secret material',
)

const ModelConfigSchema = z.object({
  id: identifier,
  role: z.enum(['low-cost', 'reference']),
  provider: identifier,
  model: modelReference,
  version: reference,
  parametersHash: hash,
  contextLimit: z.number().int().positive(),
  toolConfigurationHash: hash,
  promptContractHash: hash,
}).strict()

const ScenarioConfigSchema = z.object({
  id: z.enum(['repository-only', 'deterministic-doc-bridge', 'registry-assisted']),
  agentId: identifier.optional(),
  agentVersion: reference.optional(),
  network: z.literal(false),
}).strict().superRefine((value, context) => {
  if (value.id === 'registry-assisted' && (!value.agentId || !value.agentVersion)) context.addIssue({ code: z.ZodIssueCode.custom, message: 'Registry-assisted scenarios require agent identity and version.' })
  if (value.id !== 'registry-assisted' && (value.agentId || value.agentVersion)) context.addIssue({ code: z.ZodIssueCode.custom, message: 'Only registry-assisted scenarios may declare an agent.' })
})

const TaskExecutionSchema = z.object({
  taskId: identifier,
  repositoryId: identifier,
  category: z.enum(['discovery', 'architecture', 'documentation', 'implementation']),
  scenarioId: ScenarioConfigSchema.shape.id,
  modelId: identifier,
  replicate: z.number().int().nonnegative(),
  variantId: identifier,
  difficulty: z.enum(['easy', 'medium', 'hard']).optional(),
}).strict()

const RunBudgetSchema = z.object({
  maxTokens: z.number().int().positive(),
  maxRuntimeMs: z.number().int().positive(),
  maxOutputBytes: z.number().int().positive(),
  maxAttempts: z.number().int().positive().max(3),
}).strict()

const SamplingSchema = z.discriminatedUnion('strategy', [
  z.object({
    strategy: z.literal('balanced-task-strata'),
    sampleSize: z.number().int().positive(),
  }).strict(),
  z.object({
    strategy: z.literal('pairwise-task-strata'),
    sampleSize: z.number().int().positive(),
    scenarioIds: z.array(ScenarioConfigSchema.shape.id).length(2),
  }).strict(),
])

const RunPlanPayloadSchema = z.object({
  type: z.literal('controlled-study-run-plan'),
  schemaVersion: z.literal(STUDY_RUNNER_SCHEMA_VERSION),
  planVersion: reference,
  protocolVersion: reference,
  protocolHash: hash,
  taskSuiteHash: hash,
  sourceRevisionHash: hash,
  configurationHash: hash,
  docBridgeVersion: reference,
  models: z.array(ModelConfigSchema).length(2),
  scenarios: z.array(ScenarioConfigSchema).length(3),
  taskIds: z.array(identifier).length(24),
  sampling: SamplingSchema,
  budget: RunBudgetSchema,
  runId: reference,
}).strict()

export const ControlledStudyRunPlanV1Schema = RunPlanPayloadSchema.extend({
  contentHash: hash,
  contentHashAlgo: z.literal(STUDY_RUNNER_CONTENT_HASH_ALGO),
}).strict()

export type ControlledStudyRunPlanV1 = z.infer<typeof ControlledStudyRunPlanV1Schema>
export type TaskExecutionV1 = z.infer<typeof TaskExecutionSchema>

const ExecutionResultSchema = z.object({
  status: z.enum(['completed', 'failed', 'timed-out', 'unavailable', 'invalid-output', 'budget-exceeded']),
  exitCode: z.number().int().nullable(),
  signal: z.string().nullable(),
  durationMs: z.number().int().nonnegative(),
  responseBytes: z.number().int().nonnegative(),
  stderrBytes: z.number().int().nonnegative(),
  stdoutHash: hash.optional(),
  stderrHash: hash.optional(),
  inputTokens: z.number().int().nonnegative().optional(),
  outputTokens: z.number().int().nonnegative().optional(),
  tokenMethod: z.enum(['provider', 'estimate']).optional(),
  toolCalls: z.number().int().nonnegative().optional(),
  errorCode: identifier.optional(),
}).strict().superRefine((value, context) => {
  if ((value.inputTokens !== undefined || value.outputTokens !== undefined) && !value.tokenMethod) context.addIssue({ code: z.ZodIssueCode.custom, path: ['tokenMethod'], message: 'Token counts require a provider or estimate method.' })
})

const AgentMetricsSchema = z.object({
  taskOutcome: outcome.optional(),
  evidenceQuality: z.enum(['high', 'medium', 'low']).optional(),
  safetyOutcome: z.enum(['safe', 'unsafe', 'not-applicable']).optional(),
  evidenceIds: z.array(evidenceId).max(128).optional(),
  clarificationRequests: z.number().int().nonnegative().optional(),
  reworkCount: z.number().int().nonnegative().optional(),
  measurements: z.record(z.string().min(1).max(128), z.number().finite().nonnegative()).optional(),
  inputTokens: z.number().int().nonnegative().optional(),
  outputTokens: z.number().int().nonnegative().optional(),
  tokenMethod: z.enum(['provider', 'estimate']).optional(),
  toolCalls: z.number().int().nonnegative().optional(),
})

const ObservationPayloadSchema = z.object({
  type: z.literal('controlled-study-observation'),
  schemaVersion: z.literal(STUDY_RUNNER_SCHEMA_VERSION),
  observationVersion: reference,
  observedAt: z.string().datetime(),
  runId: reference,
  planHash: hash,
  task: TaskExecutionSchema,
  model: ModelConfigSchema,
  scenario: ScenarioConfigSchema,
  execution: ExecutionResultSchema,
  contextBytes: z.number().int().nonnegative(),
  evidenceIds: z.array(evidenceId).max(128),
  round: reference.optional(),
  taskOutcome: z.enum(['success', 'partial', 'incorrect', 'incomplete', 'blocked']).optional(),
  evidenceQuality: z.enum(['high', 'medium', 'low']).optional(),
  safetyOutcome: z.enum(['safe', 'unsafe', 'not-applicable']).optional(),
  clarificationRequests: z.number().int().nonnegative().optional(),
  reworkCount: z.number().int().nonnegative().optional(),
  measurements: z.record(z.string().min(1).max(128), z.number().finite().nonnegative()).optional(),
  adjudication: z.object({
    status: z.enum(['pending', 'automated', 'human-approved', 'human-rejected']),
    actor: identifier.optional(),
    method: reference.optional(),
    outcome: outcome.optional(),
    confidence: z.number().min(0).max(1).optional(),
    reasonCodes: z.array(identifier).max(16).optional(),
    configurationHash: hash.optional(),
    reason: safeText.optional(),
  }).strict().superRefine((value, context) => {
    if (value.status === 'automated' && (!value.actor || !value.method || !value.outcome)) context.addIssue({ code: z.ZodIssueCode.custom, message: 'Automated adjudication requires actor, method, and outcome.' })
  }),
}).strict()

export const ControlledStudyObservationV1Schema = ObservationPayloadSchema.extend({
  contentHash: hash,
  contentHashAlgo: z.literal(STUDY_RUNNER_CONTENT_HASH_ALGO),
}).strict()

export type ControlledStudyObservationV1 = z.infer<typeof ControlledStudyObservationV1Schema>

const LedgerPayloadSchema = z.object({
  type: z.literal('controlled-study-observation-ledger'),
  schemaVersion: z.literal(STUDY_RUNNER_SCHEMA_VERSION),
  ledgerVersion: reference,
  observations: z.array(ControlledStudyObservationV1Schema).max(100_000),
}).strict()

export const ControlledStudyObservationLedgerV1Schema = LedgerPayloadSchema.extend({
  contentHash: hash,
  contentHashAlgo: z.literal(STUDY_RUNNER_CONTENT_HASH_ALGO),
}).strict()

export type ControlledStudyObservationLedgerV1 = z.infer<typeof ControlledStudyObservationLedgerV1Schema>

const uniqueIds = (values: readonly string[], label: string): void => {
  if (new Set(values).size !== values.length) throw new Error(`Duplicate ${label} id.`)
}

const validatePlan = (plan: ControlledStudyRunPlanV1): void => {
  uniqueIds(plan.models.map((model) => model.id), 'model')
  uniqueIds(plan.scenarios.map((scenario) => scenario.id), 'scenario')
  uniqueIds(plan.taskIds, 'task')
  if (new Set(plan.models.map((model) => model.role)).size !== 2) throw new Error('The run plan requires one low-cost and one reference model.')
  if (new Set(plan.scenarios.map((scenario) => scenario.id)).size !== 3) throw new Error('The run plan requires all three controlled scenarios.')
  if (plan.budget.maxTokens <= 0 || plan.budget.maxRuntimeMs <= 0) throw new Error('Run budgets must be positive.')
  const selectedScenarioIds = plan.sampling.strategy === 'pairwise-task-strata' ? plan.sampling.scenarioIds : plan.scenarios.map((scenario) => scenario.id)
  if (selectedScenarioIds.some((scenarioId) => !plan.scenarios.some((scenario) => scenario.id === scenarioId))) throw new Error('Sampling references an unknown scenario.')
  const stratumCount = plan.models.length * selectedScenarioIds.length
  const maxSampleSize = plan.taskIds.length * stratumCount
  if (plan.sampling.sampleSize > maxSampleSize || plan.sampling.sampleSize % stratumCount !== 0) throw new Error('Sampling must be a positive balanced subset of the task strata.')
}

export const createControlledStudyRunPlan = (input: unknown): ControlledStudyRunPlanV1 => {
  const payload = RunPlanPayloadSchema.parse(input)
  const hashable = { ...payload, contentHashAlgo: STUDY_RUNNER_CONTENT_HASH_ALGO }
  const plan = ControlledStudyRunPlanV1Schema.parse({ ...hashable, contentHash: sha256NormalizedV1(hashable) })
  validatePlan(plan)
  return plan
}

export const parseControlledStudyRunPlan = (input: unknown): ControlledStudyRunPlanV1 => {
  const plan = ControlledStudyRunPlanV1Schema.parse(input)
  if (contentHashForArtifactV1(plan) !== plan.contentHash) throw new Error('Invalid controlled run-plan content hash.')
  validatePlan(plan)
  return plan
}

export const createControlledStudyObservation = (input: unknown): ControlledStudyObservationV1 => {
  const payload = ObservationPayloadSchema.parse(input)
  if (payload.task.modelId !== payload.model.id) throw new Error(`Observation task model ${payload.task.modelId} does not match model ${payload.model.id}.`)
  if (payload.task.scenarioId !== payload.scenario.id) throw new Error(`Observation task scenario ${payload.task.scenarioId} does not match scenario ${payload.scenario.id}.`)
  const hashable = { ...payload, contentHashAlgo: STUDY_RUNNER_CONTENT_HASH_ALGO }
  return ControlledStudyObservationV1Schema.parse({ ...hashable, contentHash: sha256NormalizedV1(hashable) })
}

export const parseControlledStudyObservation = (input: unknown): ControlledStudyObservationV1 => {
  const observation = ControlledStudyObservationV1Schema.parse(input)
  if (contentHashForArtifactV1(observation) !== observation.contentHash) throw new Error('Invalid controlled observation content hash.')
  return observation
}

export const createControlledStudyLedger = (input: unknown): ControlledStudyObservationLedgerV1 => {
  const payload = LedgerPayloadSchema.parse(input)
  const hashable = { ...payload, contentHashAlgo: STUDY_RUNNER_CONTENT_HASH_ALGO }
  const ledger = ControlledStudyObservationLedgerV1Schema.parse({ ...hashable, contentHash: sha256NormalizedV1(hashable) })
  uniqueIds(ledger.observations.map((observation) => observation.contentHash), 'observation')
  return ledger
}

export const parseControlledStudyLedger = (input: unknown): ControlledStudyObservationLedgerV1 => {
  const ledger = ControlledStudyObservationLedgerV1Schema.parse(input)
  if (contentHashForArtifactV1(ledger) !== ledger.contentHash) throw new Error('Invalid observation-ledger content hash.')
  uniqueIds(ledger.observations.map((observation) => observation.contentHash), 'observation')
  return ledger
}

export const upsertControlledStudyObservation = (
  ledger: ControlledStudyObservationLedgerV1,
  observation: ControlledStudyObservationV1,
): ControlledStudyObservationLedgerV1 => {
  const existing = ledger.observations.find((item) => item.runId === observation.runId && sha256NormalizedV1(item.task) === sha256NormalizedV1(observation.task))
  if (existing && existing.contentHash !== observation.contentHash) throw new Error(`Observation ${observation.runId} already exists with different contents.`)
  if (existing) return ledger
  const { contentHash: _contentHash, contentHashAlgo: _contentHashAlgo, ...payload } = ledger
  return createControlledStudyLedger({ ...payload, observations: [...ledger.observations, observation] })
}

export type ControlledCommandRequest = {
  readonly plan: ControlledStudyRunPlanV1
  readonly execution: TaskExecutionV1
  readonly command: string
  readonly args?: readonly string[]
  readonly cwd: string
  readonly input?: string
  readonly envAllowlist?: readonly string[]
  readonly maxRuntimeMs?: number
  readonly maxOutputBytes?: number
  readonly contextBytes: number
  readonly round?: string
  readonly taskOutcome?: 'success' | 'partial' | 'incorrect' | 'incomplete' | 'blocked'
  readonly evidenceQuality?: 'high' | 'medium' | 'low'
  readonly safetyOutcome?: 'safe' | 'unsafe' | 'not-applicable'
  readonly clarificationRequests?: number
  readonly reworkCount?: number
  readonly measurements?: Readonly<Record<string, number>>
  readonly providerPricing?: StudyProviderCostPricing
}

type ChildAttempt = {
  readonly status: z.infer<typeof ExecutionResultSchema>['status']
  readonly exitCode: number | null
  readonly signal: string | null
  readonly durationMs: number
  readonly stdout: string
  readonly stderr: string
  readonly errorCode?: string
}

const terminateChildProcessGroup = (child: ReturnType<typeof spawn>): void => {
  if (child.pid === undefined) return
  try { process.kill(-child.pid, 'SIGTERM') } catch { child.kill('SIGTERM') }
}

const runAttempt = (request: ControlledCommandRequest, sessionId: string): Promise<ChildAttempt> => new Promise((resolveAttempt) => {
  const env = request.envAllowlist === undefined
    ? process.env
    : Object.fromEntries([...new Set(['PATH', 'HOME', 'TMPDIR', ...request.envAllowlist])].flatMap((name) => process.env[name] === undefined ? [] : [[name, process.env[name] as string]]))
  const started = Date.now()
  const maxRuntimeMs = request.maxRuntimeMs ?? request.plan.budget.maxRuntimeMs
  const maxOutputBytes = request.maxOutputBytes ?? request.plan.budget.maxOutputBytes
  const child = spawn(request.command, [...(request.args ?? [])], {
    cwd: resolve(request.cwd),
    shell: false,
    detached: true,
    env: { ...env, DOC_BRIDGE_STUDY_SESSION_ID: sessionId },
    stdio: ['pipe', 'pipe', 'pipe'],
  })
  let stdout = ''
  let stderr = ''
  let settled = false
  const finish = (result: ChildAttempt): void => {
    if (settled) return
    settled = true
    resolveAttempt(result)
  }
  const timer = setTimeout(() => {
    terminateChildProcessGroup(child)
    finish({ status: 'timed-out', exitCode: null, signal: 'SIGTERM', durationMs: Date.now() - started, stdout, stderr, errorCode: 'timeout' })
  }, maxRuntimeMs)
  child.stdout.on('data', (chunk: Buffer) => {
    stdout += chunk.toString('utf8')
    if (Buffer.byteLength(stdout, 'utf8') > maxOutputBytes) {
      clearTimeout(timer)
      terminateChildProcessGroup(child)
      finish({ status: 'budget-exceeded', exitCode: null, signal: 'SIGTERM', durationMs: Date.now() - started, stdout: stdout.slice(0, maxOutputBytes), stderr, errorCode: 'output-limit' })
    }
  })
  child.stderr.on('data', (chunk: Buffer) => { stderr += chunk.toString('utf8').slice(0, maxOutputBytes) })
  child.once('error', () => { clearTimeout(timer); finish({ status: 'unavailable', exitCode: null, signal: null, durationMs: Date.now() - started, stdout, stderr, errorCode: 'unavailable' }) })
  child.once('close', (exitCode, signal) => {
    clearTimeout(timer)
    if (settled) return
    if (exitCode !== 0) finish({ status: 'failed', exitCode, signal, durationMs: Date.now() - started, stdout, stderr, errorCode: 'non-zero-exit' })
    else {
      try { JSON.parse(stdout) as unknown; finish({ status: 'completed', exitCode, signal, durationMs: Date.now() - started, stdout, stderr }) }
      catch { finish({ status: 'invalid-output', exitCode, signal, durationMs: Date.now() - started, stdout, stderr, errorCode: 'invalid-json' }) }
    }
  })
  child.stdin.end(request.input ?? '')
})

export const runControlledCommand = async (request: ControlledCommandRequest): Promise<ControlledStudyObservationV1> => {
  const sessionId = sha256NormalizedV1({ runId: request.plan.runId, execution: request.execution }).slice(0, 32)
  let attempt: ChildAttempt | undefined
  for (let index = 0; index < request.plan.budget.maxAttempts; index += 1) {
    attempt = await runAttempt(request, `${sessionId}-${index + 1}`)
    if (attempt.status === 'completed') break
  }
  const result = attempt as ChildAttempt
  const parsedOutput = (() => { try { return JSON.parse(result.stdout) as unknown } catch { return undefined } })()
  const parsedMetrics = AgentMetricsSchema.safeParse(parsedOutput)
  const effectiveResult = result.status === 'completed' && !parsedMetrics.success
    ? { ...result, status: 'invalid-output' as const, errorCode: 'invalid-metrics' }
    : result
  const output = parsedMetrics.success ? parsedMetrics.data : {}
  const providerTokenTotal = output.tokenMethod === 'provider' && output.inputTokens !== undefined && output.outputTokens !== undefined
    ? output.inputTokens + output.outputTokens
    : undefined
  const providerCostUsd = calculateStudyCostUsd(request.providerPricing, {
    ...(output.inputTokens === undefined ? {} : { inputTokens: output.inputTokens }),
    ...(output.measurements?.cachedInputTokens === undefined ? {} : { cachedInputTokens: output.measurements.cachedInputTokens }),
    ...(output.outputTokens === undefined ? {} : { outputTokens: output.outputTokens }),
  })
  const measurements = {
    ...(output.measurements ?? request.measurements ?? {}),
    ...(providerTokenTotal === undefined ? {} : { providerTokenCostUnits: providerTokenTotal }),
    ...(providerCostUsd === undefined ? {} : { agentCostUsd: providerCostUsd }),
  }
  const executionResult = {
    status: effectiveResult.status,
    exitCode: effectiveResult.exitCode,
    signal: effectiveResult.signal,
    durationMs: effectiveResult.durationMs,
    responseBytes: Buffer.byteLength(result.stdout, 'utf8'),
    stderrBytes: Buffer.byteLength(result.stderr, 'utf8'),
    stdoutHash: createHash('sha256').update(result.stdout).digest('hex'),
    stderrHash: createHash('sha256').update(result.stderr).digest('hex'),
    ...(output.inputTokens === undefined ? {} : { inputTokens: output.inputTokens }),
    ...(output.outputTokens === undefined ? {} : { outputTokens: output.outputTokens }),
    ...(output.tokenMethod === undefined ? {} : { tokenMethod: output.tokenMethod }),
    ...(output.toolCalls === undefined ? {} : { toolCalls: output.toolCalls }),
    ...(effectiveResult.errorCode === undefined ? {} : { errorCode: effectiveResult.errorCode }),
  }
  if ((executionResult.inputTokens ?? 0) + (executionResult.outputTokens ?? 0) > request.plan.budget.maxTokens) {
    executionResult.status = 'budget-exceeded'
    executionResult.errorCode = 'token-budget'
  }
  return createControlledStudyObservation({
    type: 'controlled-study-observation',
    schemaVersion: STUDY_RUNNER_SCHEMA_VERSION,
    observationVersion: 'v1',
    observedAt: new Date().toISOString(),
    runId: request.plan.runId,
    planHash: request.plan.contentHash,
    task: request.execution,
    model: request.plan.models.find((model) => model.id === request.execution.modelId),
    scenario: request.plan.scenarios.find((scenario) => scenario.id === request.execution.scenarioId),
    execution: executionResult,
    contextBytes: request.contextBytes,
    evidenceIds: output.evidenceIds ?? [],
    ...(request.round === undefined ? {} : { round: request.round }),
    ...(output.taskOutcome === undefined ? request.taskOutcome === undefined ? {} : { taskOutcome: request.taskOutcome } : { taskOutcome: output.taskOutcome }),
    ...(output.evidenceQuality === undefined ? request.evidenceQuality === undefined ? {} : { evidenceQuality: request.evidenceQuality } : { evidenceQuality: output.evidenceQuality }),
    ...(output.safetyOutcome === undefined ? request.safetyOutcome === undefined ? {} : { safetyOutcome: request.safetyOutcome } : { safetyOutcome: output.safetyOutcome }),
    ...(output.clarificationRequests === undefined ? request.clarificationRequests === undefined ? {} : { clarificationRequests: request.clarificationRequests } : { clarificationRequests: output.clarificationRequests }),
    ...(output.reworkCount === undefined ? request.reworkCount === undefined ? {} : { reworkCount: request.reworkCount } : { reworkCount: output.reworkCount }),
    ...(Object.keys(measurements).length === 0 ? {} : { measurements }),
    adjudication: { status: 'pending' },
  })
}

export const persistControlledStudyLedger = (path: string, ledger: ControlledStudyObservationLedgerV1): string => {
  parseControlledStudyLedger(ledger)
  mkdirSync(dirname(resolve(path)), { recursive: true })
  writeFileSync(resolve(path), `${JSON.stringify(ledger, null, 2)}\n`, 'utf8')
  return resolve(path)
}

export const formatControlledStudyRunPlanText = (plan: ControlledStudyRunPlanV1): readonly string[] => [
  `Run plan: ${plan.planVersion}`,
  `Tasks: ${plan.taskIds.length}`,
  `Models: ${plan.models.length}`,
  `Scenarios: ${plan.scenarios.length}`,
  `Sample: ${plan.sampling.sampleSize}/${plan.taskIds.length} (${plan.sampling.strategy})`,
  `Budget: ${plan.budget.maxTokens} tokens, ${plan.budget.maxRuntimeMs} ms, ${plan.budget.maxOutputBytes} bytes, ${plan.budget.maxAttempts} attempts`,
  `Content hash: ${plan.contentHash}`,
]
