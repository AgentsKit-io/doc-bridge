import { z } from 'zod'

import { contentHashForArtifactV1, sha256NormalizedV1 } from '../index-builder/content-hash.js'
import { EVAL_FORMAT_VERSION, runRetrievalBench, type RetrievalBenchResultV1, type RetrievalSuite } from '../bench/retrieval.js'
import type { DocBridgeIndexV1 } from '../schemas/doc-bridge-index.js'
import { hasRetrievalExpectations, taskRetrievalQueries, type StudyTaskSuiteV1, type StudyTaskV1 } from './task-suite.js'

/**
 * The mechanical half of a study task, and why it lives in two files.
 *
 * The last controlled round recorded zero semantic successes in both arms, which means it could
 * not tell a working retrieval layer from a broken one. The cause was structural: a task whose
 * only success criterion is a model's opinion produces no signal. The fix is to state what
 * retrieval is expected to return and check it — with `ak-docs bench retrieval`, deterministically.
 *
 * The expectations are split across two artifacts on purpose. The task suite is
 * publication-bound, so it may only carry opaque references (`primary-entrypoint`), never a path.
 * This file is the local resolution — references to concrete entity ids and document paths for a
 * repository on the operator's disk — and it must never be published. Putting it under
 * `docs/study/` would fail the privacy gate, which is the intended outcome rather than a bug.
 */

export const STUDY_EXPECTATIONS_SCHEMA_VERSION = 1 as const
export const STUDY_EXPECTATIONS_CONTENT_HASH_ALGO = 'sha256-normalized-v1' as const

const hash = z.string().regex(/^[a-f0-9]{64}$/)
const identifier = z.string().regex(/^[a-z][a-z0-9-]{0,127}$/)
const reference = z.string().regex(/^[a-z0-9][a-z0-9._:-]{0,255}$/)
const target = z.string().min(1).max(512)

const ExpectationsPayloadSchema = z.object({
  type: z.literal('controlled-study-expectations'),
  schemaVersion: z.literal(STUDY_EXPECTATIONS_SCHEMA_VERSION),
  configVersion: reference,
  /** Self-declared: this artifact resolves references to paths and is never publication-bound. */
  scope: z.literal('local'),
  /** The suite these references belong to. A suite that moved on invalidates the resolution. */
  taskSuiteHash: hash,
  repositories: z.array(z.object({
    id: identifier,
    /** Opaque reference → the entity ids or document paths it stands for in this repository. */
    targets: z.record(reference, z.array(target).min(1).max(32)),
  }).strict()).min(1).max(16),
}).strict()

export const StudyExpectationsV1Schema = ExpectationsPayloadSchema.extend({
  contentHash: hash,
  contentHashAlgo: z.literal(STUDY_EXPECTATIONS_CONTENT_HASH_ALGO),
}).strict()

export type StudyExpectationsV1 = z.infer<typeof StudyExpectationsV1Schema>

export const createStudyExpectations = (input: unknown): StudyExpectationsV1 => {
  const payload = ExpectationsPayloadSchema.parse(input)
  const hashable = { ...payload, contentHashAlgo: STUDY_EXPECTATIONS_CONTENT_HASH_ALGO }
  return StudyExpectationsV1Schema.parse({ ...hashable, contentHash: sha256NormalizedV1(hashable) })
}

export const parseStudyExpectations = (input: unknown): StudyExpectationsV1 => {
  const expectations = StudyExpectationsV1Schema.parse(input)
  if (contentHashForArtifactV1(expectations) !== expectations.contentHash) throw new Error('Invalid study expectations content hash.')
  if (new Set(expectations.repositories.map((entry) => entry.id)).size !== expectations.repositories.length) {
    throw new Error('Study expectations contain duplicate repository ids.')
  }
  return expectations
}

/** A reference a task expects that the local file does not resolve. Reported, never ignored. */
export type UnresolvedExpectation = {
  readonly taskId: string
  readonly repositoryId: string
  readonly reference: string
  readonly kind: 'entity' | 'document'
}

export type StudyRetrievalSuite = {
  readonly suite: RetrievalSuite
  readonly unresolved: readonly UnresolvedExpectation[]
  /** Task ids that declare no expectations, so nothing about them is checked here. */
  readonly withoutExpectations: readonly string[]
}

export type StudyRetrievalSuiteOptions = {
  readonly taskSuite: StudyTaskSuiteV1
  readonly expectations: StudyExpectationsV1
  /** Check one repository instead of every one the expectations resolve. */
  readonly repositoryId?: string
}

const caseId = (task: StudyTaskV1, index: number, total: number): string => (total === 1 ? task.id : `${task.id}-q${index + 1}`)

/**
 * Turn the study's expectations into a retrieval suite.
 *
 * One case per task query, whose expected targets are the resolved references. The result is an
 * ordinary Open Eval Format suite, so the same command, the same ranking and the same metrics
 * that gate this repository's retrieval also answer the study's mechanical questions — rather
 * than a second, study-shaped checker nobody else exercises.
 */
export const studyRetrievalSuite = (options: StudyRetrievalSuiteOptions): StudyRetrievalSuite => {
  const { taskSuite, expectations } = options
  if (expectations.taskSuiteHash !== taskSuite.contentHash) {
    throw new Error('Study expectations were written for a different task suite; re-resolve the references against this one.')
  }
  const byRepository = new Map(expectations.repositories.map((entry) => [entry.id, entry.targets]))
  const unresolved: UnresolvedExpectation[] = []
  const withoutExpectations: string[] = []
  const cases: RetrievalSuite['cases'] = []

  for (const task of taskSuite.tasks) {
    if (options.repositoryId !== undefined && task.repositoryId !== options.repositoryId) continue
    if (!hasRetrievalExpectations(task)) {
      withoutExpectations.push(task.id)
      continue
    }
    const targets = byRepository.get(task.repositoryId)
    const resolve = (references: readonly string[], kind: UnresolvedExpectation['kind']): string[] =>
      references.flatMap((item) => {
        const resolved = targets?.[item]
        if (!resolved?.length) {
          unresolved.push({ taskId: task.id, repositoryId: task.repositoryId, reference: item, kind })
          return []
        }
        return resolved
      })
    const expectedTargets = [
      ...new Set([...resolve(task.expectedEntities ?? [], 'entity'), ...resolve(task.expectedDocuments ?? [], 'document')]),
    ].sort()
    if (!expectedTargets.length) continue
    const queries = taskRetrievalQueries(task)
    for (const [index, input] of queries.entries()) {
      cases.push({
        id: caseId(task, index, queries.length),
        input,
        metadata: { expectedTargets, kind: 'question', studyTaskId: task.id, studyRepositoryId: task.repositoryId, studyCategory: task.category },
      })
    }
  }

  return {
    suite: {
      evalFormatVersion: EVAL_FORMAT_VERSION,
      name: `study-${taskSuite.suiteVersion}`,
      description: 'Mechanical retrieval expectations resolved from the controlled study task suite.',
      cases,
    },
    unresolved: [...unresolved].sort((a, b) => a.taskId.localeCompare(b.taskId) || a.reference.localeCompare(b.reference)),
    withoutExpectations,
  }
}

export type StudyExpectationOutcome = {
  readonly taskId: string
  readonly repositoryId: string
  readonly caseId: string
  readonly hit: boolean
  readonly rank: number | null
  readonly expectedTargets: readonly string[]
  readonly rankedTargets: readonly string[]
}

export type StudyExpectationCheck = {
  /** True when every case hit and every reference resolved: the mechanical verdict, with no model. */
  readonly ok: boolean
  readonly checkedTasks: number
  readonly withoutExpectations: readonly string[]
  readonly unresolved: readonly UnresolvedExpectation[]
  readonly outcomes: readonly StudyExpectationOutcome[]
  readonly result?: RetrievalBenchResultV1
}

export type CheckStudyExpectationsOptions = StudyRetrievalSuiteOptions & {
  readonly index: DocBridgeIndexV1
  readonly limit?: number
}

/**
 * Run the study's mechanical expectations through the retrieval benchmark.
 *
 * A task with no expectations is reported as unchecked rather than counted as a pass, and an
 * unresolved reference fails the check: an expectation nobody resolved is an expectation nobody
 * tested, and calling that a success is exactly the failure this replaces.
 */
export const checkStudyExpectations = (options: CheckStudyExpectationsOptions): StudyExpectationCheck => {
  const { suite, unresolved, withoutExpectations } = studyRetrievalSuite(options)
  if (!suite.cases.length) {
    return { ok: false, checkedTasks: 0, withoutExpectations, unresolved, outcomes: [] }
  }
  const result = runRetrievalBench({ index: options.index, suite, ...(options.limit === undefined ? {} : { limit: options.limit }) })
  const byCase = new Map(result.cases.map((entry) => [entry.id, entry]))
  const outcomes = suite.cases.map((entry): StudyExpectationOutcome => {
    const outcome = byCase.get(entry.id)
    return {
      taskId: String(entry.metadata.studyTaskId ?? entry.id),
      repositoryId: String(entry.metadata.studyRepositoryId ?? ''),
      caseId: entry.id,
      hit: outcome?.hitAt3 ?? false,
      rank: outcome?.rank ?? null,
      expectedTargets: outcome?.expectedTargets ?? entry.metadata.expectedTargets,
      rankedTargets: outcome?.rankedTargets ?? [],
    }
  })
  return {
    ok: unresolved.length === 0 && outcomes.every((outcome) => outcome.hit),
    checkedTasks: new Set(outcomes.map((outcome) => outcome.taskId)).size,
    withoutExpectations,
    unresolved,
    outcomes,
    result,
  }
}

export const formatStudyExpectationsText = (check: StudyExpectationCheck): readonly string[] => [
  `Study expectations: ${check.ok ? 'pass' : 'fail'}`,
  `Tasks checked: ${check.checkedTasks}${check.withoutExpectations.length ? ` (${check.withoutExpectations.length} without expectations: ${check.withoutExpectations.slice(0, 8).join(', ')}${check.withoutExpectations.length > 8 ? ', …' : ''})` : ''}`,
  ...(check.result ? [`hit@3: ${(check.result.metrics.hitAt3 * 100).toFixed(1)}% over ${check.result.metrics.caseCount} case(s)`] : ['No case could be built: nothing was checked.']),
  ...check.unresolved.map((entry) => `  unresolved ${entry.kind} reference "${entry.reference}" for ${entry.taskId} (${entry.repositoryId})`),
  ...check.outcomes.filter((outcome) => !outcome.hit).map((outcome) => `  miss ${outcome.caseId}: expected ${outcome.expectedTargets.slice(0, 4).join(', ')}`),
]
