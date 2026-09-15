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

/**
 * What mechanically checks a rubric item, when anything does.
 *
 * `acceptance-checks` is the task's own commands and their exit status; `evidence-coverage` is
 * whether each required evidence id was cited; `retrieval-expectations` is the entities and
 * documents the task expects retrieval to return, measured by `ak-docs bench retrieval`. An item
 * that names one of these is decided by the runner and never shown to the model adjudicator.
 */
export const RUBRIC_MECHANICAL_CHECKS = ['acceptance-checks', 'evidence-coverage', 'retrieval-expectations'] as const
export type RubricMechanicalCheck = (typeof RUBRIC_MECHANICAL_CHECKS)[number]

/**
 * A rubric item: prose, or prose with the mechanical check that decides it.
 *
 * The plain string is kept because most of a rubric is a judgement — "the answer identifies a
 * wrong entrypoint" is not something a checker can settle — and a suite written before this
 * existed stays valid, with every item going to the adjudicator exactly as before.
 */
const RubricItemSchema = z.union([
  safeText,
  z.object({ text: safeText, check: z.enum(RUBRIC_MECHANICAL_CHECKS) }).strict(),
])
const RubricItemListSchema = z.array(RubricItemSchema).min(1).max(32)

export type RubricItem = z.infer<typeof RubricItemSchema>

export const rubricItemText = (item: RubricItem): string => (typeof item === 'string' ? item : item.text)
export const rubricItemCheck = (item: RubricItem): RubricMechanicalCheck | undefined => (typeof item === 'string' ? undefined : item.check)

const RubricSchema = z.object({
  success: RubricItemListSchema,
  partial: RubricItemListSchema,
  incorrect: RubricItemListSchema,
  incomplete: RubricItemListSchema,
  blocked: RubricItemListSchema,
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
  /*
   * What retrieval is expected to return for this task, as opaque references.
   *
   * The last study round recorded zero semantic successes because success was only ever a model's
   * opinion, and an opinion produces no signal. These are the mechanical half: the references are
   * resolved to concrete entities and documents by a local expectations file — never here, since
   * this suite is publication-bound and a repository path in it is a privacy failure — and the
   * resolved targets are checked by `ak-docs bench retrieval`.
   */
  expectedEntities: z.array(reference).max(16).optional(),
  expectedDocuments: z.array(reference).max(16).optional(),
  /** What to ask retrieval. Defaults to the task's objective, which is already stated above. */
  retrievalQueries: z.array(safeText).min(1).max(8).optional(),
}).strict().superRefine((value, context) => {
  if (value.expectedEntities?.length === 0) context.addIssue({ code: z.ZodIssueCode.custom, path: ['expectedEntities'], message: 'Declare at least one expected entity or omit the field.' })
  if (value.expectedDocuments?.length === 0) context.addIssue({ code: z.ZodIssueCode.custom, path: ['expectedDocuments'], message: 'Declare at least one expected document or omit the field.' })
  if (value.retrievalQueries && !value.expectedEntities && !value.expectedDocuments) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['retrievalQueries'], message: 'A retrieval query needs expected entities or documents; a query with nothing expected checks nothing.' })
  }
})

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

/** Whether a task can be checked without asking a model anything. */
export const hasRetrievalExpectations = (task: StudyTaskV1): boolean =>
  (task.expectedEntities?.length ?? 0) > 0 || (task.expectedDocuments?.length ?? 0) > 0

/** The queries a task is checked with: its own, or its objective. */
export const taskRetrievalQueries = (task: StudyTaskV1): readonly string[] => task.retrievalQueries ?? [task.objective]

/** The rubric items a checker decides, by outcome. */
export const mechanicalRubricItems = (task: StudyTaskV1): readonly { readonly outcome: TaskOutcomeStatus; readonly text: string; readonly check: RubricMechanicalCheck }[] =>
  outcomes.flatMap((outcome) =>
    task.rubric[outcome].flatMap((item) => {
      const check = rubricItemCheck(item)
      return check === undefined ? [] : [{ outcome, text: rubricItemText(item), check }]
    }),
  )

/**
 * The rubric items no checker can decide — the only ones a model adjudicator should ever see.
 *
 * Handing a model an item the runner already settled invites it to disagree with a measurement,
 * which is how a study ends up with an opinion where it had a number.
 */
export const modelRubricItems = (task: StudyTaskV1): Readonly<Record<TaskOutcomeStatus, readonly string[]>> => {
  const judged = (outcome: TaskOutcomeStatus): readonly string[] =>
    task.rubric[outcome].filter((item) => rubricItemCheck(item) === undefined).map(rubricItemText)
  return { success: judged('success'), partial: judged('partial'), incorrect: judged('incorrect'), incomplete: judged('incomplete'), blocked: judged('blocked') }
}

const uniqueIds = (values: readonly string[], label: string): void => {
  if (new Set(values).size !== values.length) throw new Error(`Duplicate ${label} id.`)
}

export type ValidateStudyTaskSuiteOptions = {
  /**
   * Require every task to declare retrieval expectations.
   *
   * Off by default, because a suite written before expectations existed is still a valid suite.
   * A study that wants a mechanical answer turns it on and finds out which tasks cannot give one.
   */
  readonly requireExpectations?: boolean
}

export const validateStudyTaskSuite = (suite: StudyTaskSuiteV1, options: ValidateStudyTaskSuiteOptions = {}): void => {
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
  if (options.requireExpectations) {
    const without = suite.tasks.filter((task) => !hasRetrievalExpectations(task)).map((task) => task.id)
    if (without.length) throw new Error(`These tasks declare no expected entities or documents, so nothing about them can be checked mechanically: ${without.join(', ')}.`)
  }
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
  `Mechanically checkable tasks: ${suite.tasks.filter(hasRetrievalExpectations).length}/${suite.tasks.length}`,
  `Tasks: ${suite.tasks.length} (${suite.population.length} repositories × ${categories.length} categories)`,
  `Executions planned: ${suite.tasks.length * suite.modelIds.length * suite.scenarioIds.length * suite.replicatesPerTask}`,
  `Ordering: ${suite.ordering.strategy} (${suite.ordering.seed})`,
  `Budget: ${suite.maxTokensPerTask} tokens/task, ${suite.maxRuntimeMsPerTask} ms/task, ${suite.maxRuns} runs`,
  `Content hash: ${suite.contentHash}`,
]
