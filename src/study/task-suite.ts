import { z } from 'zod'

import { contentHashForArtifactV1, sha256NormalizedV1 } from '../index-builder/content-hash.js'
import { isSafeStudyText } from './protocol.js'

export const STUDY_TASK_SUITE_SCHEMA_VERSION = 1 as const
export const STUDY_TASK_SUITE_CONTENT_HASH_ALGO = 'sha256-normalized-v1' as const

const hash = z.string().regex(/^[a-f0-9]{64}$/)
const identifier = z.string().regex(/^[a-z][a-z0-9-]{0,127}$/)
const reference = z.string().regex(/^[a-z0-9][a-z0-9._:-]{0,255}$/)
const safeText = z.string().min(1).max(2_048).refine(
  isSafeStudyText,
  'Public study text cannot contain paths, URLs, credentials, or secret material',
)
const safeTextList = z.array(safeText).min(1).max(32)

const surfaces = ['logic', 'endpoint', 'database', 'cli', 'mcp', 'ui', 'docs'] as const
const categories = ['discovery', 'architecture', 'documentation', 'implementation'] as const
const outcomes = ['success', 'partial', 'incorrect', 'incomplete', 'blocked'] as const

const SurfaceSchema = z.object({
  required: z.boolean(),
  reason: safeText.optional(),
}).strict().superRefine((value, context) => {
  if (!value.required && !value.reason) context.addIssue({ code: z.ZodIssueCode.custom, path: ['reason'], message: 'Non-applicable surfaces require a reason.' })
})

const CheckSchema = z.object({
  id: identifier,
  command: safeText,
  expected: safeText,
}).strict()

const EvidenceSchema = z.object({
  id: identifier,
  description: safeText,
  source: z.enum(['runner', 'artifact', 'human', 'agent']),
}).strict()

const VariantSchema = z.object({
  id: identifier,
  label: safeText,
  context: safeText,
}).strict()

const RubricSchema = z.object({
  success: safeTextList,
  partial: safeTextList,
  incorrect: safeTextList,
  incomplete: safeTextList,
  blocked: safeTextList,
}).strict()

const BudgetSchema = z.object({
  maxTokens: z.number().int().positive(),
  maxRuntimeMs: z.number().int().positive(),
}).strict()

const TaskSchema = z.object({
  id: identifier,
  repositoryId: identifier,
  category: z.enum(categories),
  difficulty: z.enum(['easy', 'medium', 'hard']),
  objective: safeText,
  initialContext: safeTextList,
  allowedTools: safeTextList,
  forbiddenActions: safeTextList,
  expectedOutcome: safeText,
  evidenceRequirements: z.array(EvidenceSchema).min(1).max(16),
  acceptanceChecks: z.array(CheckSchema).min(1).max(16),
  budget: BudgetSchema,
  surfaces: z.object(Object.fromEntries(surfaces.map((surface) => [surface, SurfaceSchema])) as Record<typeof surfaces[number], typeof SurfaceSchema>).strict(),
  rubric: RubricSchema,
  variantGroup: identifier,
  variants: z.array(VariantSchema).length(2),
}).strict()

const TaskSuitePayloadSchema = z.object({
  type: z.literal('study-task-suite'),
  schemaVersion: z.literal(STUDY_TASK_SUITE_SCHEMA_VERSION),
  suiteVersion: reference,
  protocolVersion: reference,
  title: safeText,
  population: z.array(identifier).length(6),
  modelIds: z.array(identifier).length(2),
  scenarioIds: z.array(identifier).length(3),
  maxTokensPerTask: z.number().int().positive(),
  maxRuntimeMsPerTask: z.number().int().positive(),
  maxRuns: z.number().int().positive(),
  replicatesPerTask: z.number().int().positive(),
  ordering: z.object({
    strategy: z.literal('balanced-counter-order'),
    seed: reference,
  }).strict(),
  tasks: z.array(TaskSchema).max(128),
}).strict()

export const StudyTaskSuiteV1Schema = TaskSuitePayloadSchema.extend({
  contentHash: hash,
  contentHashAlgo: z.literal(STUDY_TASK_SUITE_CONTENT_HASH_ALGO),
}).strict()

export type StudyTaskSuiteV1 = z.infer<typeof StudyTaskSuiteV1Schema>
export type StudyTaskV1 = StudyTaskSuiteV1['tasks'][number]
export type TaskOutcomeStatus = typeof outcomes[number]

const uniqueIds = (values: readonly string[], label: string): void => {
  if (new Set(values).size !== values.length) throw new Error(`Duplicate ${label} id.`)
}

export const validateStudyTaskSuite = (suite: StudyTaskSuiteV1): void => {
  uniqueIds(suite.population, 'population')
  uniqueIds(suite.modelIds, 'model')
  uniqueIds(suite.scenarioIds, 'scenario')
  uniqueIds(suite.tasks.map((task) => task.id), 'task')
  if (suite.tasks.length !== 24) throw new Error(`The controlled task suite must contain exactly 24 tasks; received ${suite.tasks.length}.`)
  const expectedCategories = new Set(categories)
  for (const repositoryId of suite.population) {
    const repositoryTasks = suite.tasks.filter((task) => task.repositoryId === repositoryId)
    if (repositoryTasks.length !== categories.length) throw new Error(`Repository ${repositoryId} must contain exactly four tasks.`)
    const repositoryCategories = new Set(repositoryTasks.map((task) => task.category))
    if (repositoryCategories.size !== categories.length || [...expectedCategories].some((category) => !repositoryCategories.has(category))) {
      throw new Error(`Repository ${repositoryId} must cover discovery, architecture, documentation, and implementation.`)
    }
  }
  for (const task of suite.tasks) {
    if (!suite.population.includes(task.repositoryId)) throw new Error(`Task ${task.id} references unknown repository ${task.repositoryId}.`)
    if (task.budget.maxTokens > suite.maxTokensPerTask || task.budget.maxRuntimeMs > suite.maxRuntimeMsPerTask) throw new Error(`Task ${task.id} exceeds the suite budget.`)
    if (task.variantGroup !== task.id) throw new Error(`Task ${task.id} must own its variant group.`)
    uniqueIds(task.acceptanceChecks.map((check) => check.id), `acceptance check for ${task.id}`)
    uniqueIds(task.evidenceRequirements.map((evidence) => evidence.id), `evidence requirement for ${task.id}`)
    uniqueIds(task.variants.map((variant) => variant.id), `variant for ${task.id}`)
    if (task.variants[0]?.label === task.variants[1]?.label) throw new Error(`Task ${task.id} variants must be distinguishable.`)
  }
  const plannedRuns = suite.tasks.length * suite.modelIds.length * suite.scenarioIds.length * suite.replicatesPerTask
  if (plannedRuns > suite.maxRuns) throw new Error(`Planned runs ${plannedRuns} exceed maxRuns ${suite.maxRuns}.`)
}

export const createStudyTaskSuite = (input: unknown): StudyTaskSuiteV1 => {
  const payload = TaskSuitePayloadSchema.parse(input)
  const hashable = { ...payload, contentHashAlgo: STUDY_TASK_SUITE_CONTENT_HASH_ALGO }
  const suite = StudyTaskSuiteV1Schema.parse({ ...hashable, contentHash: sha256NormalizedV1(hashable) })
  validateStudyTaskSuite(suite)
  return suite
}

export const parseStudyTaskSuite = (input: unknown): StudyTaskSuiteV1 => {
  const suite = StudyTaskSuiteV1Schema.parse(input)
  if (contentHashForArtifactV1(suite) !== suite.contentHash) throw new Error('Invalid task-suite content hash.')
  validateStudyTaskSuite(suite)
  return suite
}

export type TaskExecution = {
  readonly taskId: string
  readonly repositoryId: string
  readonly category: typeof categories[number]
  readonly scenarioId: string
  readonly modelId: string
  readonly replicate: number
  readonly variantId: string
}

export const selectTaskExecutions = (suite: StudyTaskSuiteV1, sampleSize?: number, sampling?: { readonly strategy?: 'balanced-task-strata' | 'pairwise-task-strata'; readonly scenarioIds?: readonly string[] }): readonly TaskExecution[] => {
  const selectedScenarioIds = sampling?.strategy === 'pairwise-task-strata' ? sampling.scenarioIds ?? [] : suite.scenarioIds
  if (sampling?.strategy === 'pairwise-task-strata' && selectedScenarioIds.length !== 2) throw new Error('Pairwise sampling requires exactly two scenarios.')
  const executions: TaskExecution[] = []
  for (const task of suite.tasks) {
    const taskExecutions: Omit<TaskExecution, 'variantId'>[] = []
    for (const scenarioId of selectedScenarioIds) for (const modelId of suite.modelIds) for (let replicate = 0; replicate < suite.replicatesPerTask; replicate += 1) {
      taskExecutions.push({ taskId: task.id, repositoryId: task.repositoryId, category: task.category, scenarioId, modelId, replicate })
    }
    taskExecutions.sort((a, b) => sha256NormalizedV1({ seed: suite.ordering.seed, ...a }).localeCompare(sha256NormalizedV1({ seed: suite.ordering.seed, ...b })))
    taskExecutions.forEach((execution, index) => executions.push({ ...execution, variantId: task.variants[index % task.variants.length]?.id ?? '' }))
  }
  const ordered = executions.sort((a, b) => sha256NormalizedV1({ seed: suite.ordering.seed, ...a }).localeCompare(sha256NormalizedV1({ seed: suite.ordering.seed, ...b })))
  if (sampleSize === undefined || sampleSize === ordered.length) return ordered
  const stratumCount = suite.modelIds.length * selectedScenarioIds.length
  const maxSampleSize = suite.tasks.length * stratumCount
  if (!Number.isInteger(sampleSize) || sampleSize <= 0 || sampleSize > maxSampleSize) throw new Error(`Sample size must be an integer between 1 and ${maxSampleSize}.`)
  if (sampleSize % stratumCount !== 0) throw new Error(`Sample size must be divisible by the ${stratumCount} model/scenario strata.`)
  if (sampling?.strategy === 'pairwise-task-strata') {
    const taskCount = sampleSize / stratumCount
    const taskOrder = [...suite.tasks].sort((a, b) => sha256NormalizedV1({ seed: suite.ordering.seed, taskId: a.id }).localeCompare(sha256NormalizedV1({ seed: suite.ordering.seed, taskId: b.id })))
    const selectedTasks = new Set(taskOrder.slice(0, taskCount).map((task) => task.id))
    return ordered.filter((execution) => selectedTasks.has(execution.taskId) && execution.replicate === 0).slice(0, sampleSize)
  }
  const selected: TaskExecution[] = []
  for (let index = 0; index < sampleSize; index += 1) {
    const task = suite.tasks[index]
    const scenarioId = suite.scenarioIds[Math.floor(index / suite.modelIds.length) % suite.scenarioIds.length]
    const modelId = suite.modelIds[index % suite.modelIds.length]
    const execution = ordered.find((candidate) => candidate.taskId === task?.id && candidate.scenarioId === scenarioId && candidate.modelId === modelId && candidate.replicate === 0)
    if (!execution) throw new Error(`Unable to select a balanced execution for task ${task?.id ?? index}.`)
    selected.push(execution)
  }
  return selected
}

export type TaskEvaluationInput = {
  readonly acceptanceChecksPassed: number
  readonly evidenceItemsPresent: number
  readonly blocked?: boolean
  readonly incorrect?: boolean
}

export type TaskEvaluation = TaskEvaluationInput & {
  readonly status: TaskOutcomeStatus
}

export const evaluateStudyTask = (task: StudyTaskV1, result: TaskEvaluationInput): TaskEvaluation => {
  const acceptanceTotal = task.acceptanceChecks.length
  const evidenceTotal = task.evidenceRequirements.length
  if (result.blocked) return { ...result, status: 'blocked' }
  if (result.incorrect) return { ...result, status: 'incorrect' }
  if (result.acceptanceChecksPassed === acceptanceTotal && result.evidenceItemsPresent === evidenceTotal) return { ...result, status: 'success' }
  if (result.acceptanceChecksPassed === 0 && result.evidenceItemsPresent === 0) return { ...result, status: 'incomplete' }
  return { ...result, status: 'partial' }
}

export const formatStudyTaskSuiteText = (suite: StudyTaskSuiteV1): readonly string[] => [
  `Task suite: ${suite.suiteVersion}`,
  `Tasks: ${suite.tasks.length} (${suite.population.length} repositories × ${categories.length} categories)`,
  `Executions planned: ${suite.tasks.length * suite.modelIds.length * suite.scenarioIds.length * suite.replicatesPerTask}`,
  `Ordering: ${suite.ordering.strategy} (${suite.ordering.seed})`,
  `Budget: ${suite.maxTokensPerTask} tokens/task, ${suite.maxRuntimeMsPerTask} ms/task, ${suite.maxRuns} runs`,
  `Content hash: ${suite.contentHash}`,
]
