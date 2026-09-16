import { readFileSync } from 'node:fs'

import { describe, expect, it } from 'vitest'

import {
  checkStudyExpectations,
  createStudyExpectations,
  formatStudyExpectationsText,
  parseStudyExpectations,
  studyRetrievalSuite,
} from '../src/study/expectations.js'
import { adjudicatorRubric } from '../src/study/adjudication.js'
import {
  createStudyTaskSuite,
  mechanicalRubricItems,
  modelRubricItems,
  parseStudyTaskSuite,
  rubricItemCheck,
  rubricItemText,
  validateStudyTaskSuite,
  type StudyTaskSuiteV1,
} from '../src/study/task-suite.js'
import { DocBridgeIndexV1Schema, type DocBridgeIndexV1 } from '../src/schemas/doc-bridge-index.js'

const committed = (): Record<string, unknown> =>
  JSON.parse(readFileSync(new URL('../docs/study/task-suite-v1.json', import.meta.url), 'utf8')) as Record<string, unknown>

/** The committed suite without its seal, ready to be re-sealed after a change. */
const payloadOf = (): Record<string, unknown> => {
  const { contentHash: _hash, contentHashAlgo: _algo, ...rest } = committed()
  return rest
}

const tasksOf = (payload: Record<string, unknown>): Record<string, unknown>[] => payload.tasks as Record<string, unknown>[]

/**
 * The committed suite with expectations added to two tasks.
 *
 * The published suite is not rewritten here: its hash is bound to artifacts that were already
 * published, and the concrete targets belong to study repositories that are not in this one. What
 * is exercised is the mechanism — opaque references in the suite, resolution on the operator's
 * disk, and the benchmark deciding the outcome.
 */
const suiteWithExpectations = (overrides: { readonly alsoExpect?: string } = {}): StudyTaskSuiteV1 => {
  const payload = payloadOf()
  const tasks = tasksOf(payload).map((task) => {
    if (task.id === 'consumer-01-discovery') {
      return {
        ...task,
        expectedDocuments: ['primary-entrypoint', ...(overrides.alsoExpect ? [overrides.alsoExpect] : [])],
        retrievalQueries: ['alpha subsystem'],
        rubric: {
          ...(task.rubric as Record<string, unknown>),
          success: [
            ...((task.rubric as Record<string, string[]>).success),
            { text: 'Retrieval returns the expected entrypoint document in the first three results.', check: 'retrieval-expectations' },
          ],
        },
      }
    }
    if (task.id === 'consumer-01-architecture') {
      return { ...task, expectedEntities: ['ranking-module'], retrievalQueries: ['beta ranking', 'beta rota'] }
    }
    return task
  })
  return createStudyTaskSuite({ ...payload, tasks })
}

const expectationsFor = (suite: StudyTaskSuiteV1, targets: Record<string, string[]>) =>
  createStudyExpectations({
    type: 'controlled-study-expectations',
    schemaVersion: 1,
    configVersion: 'v1',
    scope: 'local',
    taskSuiteHash: suite.contentHash,
    repositories: [{ id: 'consumer-01', targets }],
  })

const RESOLVED = { 'primary-entrypoint': ['docs/alpha.md'], 'ranking-module': ['docs/beta.md'] }

/** A three-entry index whose ranking for the queries above is known by construction. */
const fixtureIndex = (): DocBridgeIndexV1 => DocBridgeIndexV1Schema.parse({
  schemaVersion: 1,
  contentHash: 'a'.repeat(64),
  contentHashAlgo: 'sha256-normalized-v1',
  project: { name: 'fixture', root: '.' },
  knowledge: [
    { id: 'alpha', type: 'agent-doc', title: 'Alpha', path: 'docs/alpha.md', description: 'Alpha covers the subsystem entrypoints.' },
    { id: 'beta', type: 'agent-doc', title: 'Beta', path: 'docs/beta.md', description: 'Beta explains ranking and the support rota.' },
    { id: 'gamma', type: 'agent-doc', title: 'Gamma', path: 'docs/gamma.md', description: 'Gamma is about something else entirely.' },
  ],
  lookup: { packages: [] },
})

describe('study expectations: the mechanical half of a task, resolved locally', () => {
  it('builds one retrieval case per task query and reports the tasks that declare none', () => {
    const suite = suiteWithExpectations()
    const { suite: generated, unresolved, withoutExpectations } = studyRetrievalSuite({ taskSuite: suite, expectations: expectationsFor(suite, RESOLVED) })

    expect(unresolved).toEqual([])
    expect(generated.cases.map((entry) => entry.id)).toEqual(['consumer-01-discovery', 'consumer-01-architecture-q1', 'consumer-01-architecture-q2'])
    expect(generated.cases[0]).toMatchObject({ input: 'alpha subsystem', metadata: { expectedTargets: ['docs/alpha.md'], studyTaskId: 'consumer-01-discovery', studyRepositoryId: 'consumer-01', studyCategory: 'discovery' } })
    expect(generated.cases[1]?.input).toBe('beta ranking')
    expect(generated.cases[2]?.input).toBe('beta rota')
    // 24 tasks, two with expectations: the other 22 are reported as unchecked, never as passes.
    expect(withoutExpectations).toHaveLength(22)
    expect(withoutExpectations).not.toContain('consumer-01-discovery')
  })

  it('passes only when every case hits and every reference resolved', () => {
    const suite = suiteWithExpectations()
    const check = checkStudyExpectations({ taskSuite: suite, expectations: expectationsFor(suite, RESOLVED), index: fixtureIndex() })

    expect(check.ok).toBe(true)
    expect(check.checkedTasks).toBe(2)
    expect(check.result?.metrics.hitAt3).toBe(1)
    expect(check.outcomes.map((outcome) => [outcome.caseId, outcome.hit, outcome.rank])).toEqual([
      ['consumer-01-discovery', true, 1],
      ['consumer-01-architecture-q1', true, 1],
      ['consumer-01-architecture-q2', true, 1],
    ])
    expect(formatStudyExpectationsText(check).join('\n')).toContain('Study expectations: pass')
  })

  it('fails on an unresolved reference rather than counting the task as a success', () => {
    const suite = suiteWithExpectations({ alsoExpect: 'ownership-map' })
    const check = checkStudyExpectations({ taskSuite: suite, expectations: expectationsFor(suite, RESOLVED), index: fixtureIndex() })

    expect(check.ok).toBe(false)
    expect(check.unresolved).toEqual([{ taskId: 'consumer-01-discovery', repositoryId: 'consumer-01', reference: 'ownership-map', kind: 'document' }])
    // The cases that did resolve still ran: the miss is the reference, not the retrieval.
    expect(check.outcomes.every((outcome) => outcome.hit)).toBe(true)
    const text = formatStudyExpectationsText(check).join('\n')
    expect(text).toContain('Study expectations: fail')
    expect(text).toContain('unresolved document reference "ownership-map" for consumer-01-discovery')
  })

  it('reports a miss with the targets it expected, and never silently rewrites the verdict', () => {
    const suite = suiteWithExpectations()
    const check = checkStudyExpectations({
      taskSuite: suite,
      expectations: expectationsFor(suite, { ...RESOLVED, 'primary-entrypoint': ['docs/gamma.md'] }),
      index: fixtureIndex(),
    })

    expect(check.ok).toBe(false)
    expect(check.outcomes.find((outcome) => outcome.caseId === 'consumer-01-discovery')).toMatchObject({ hit: false, expectedTargets: ['docs/gamma.md'] })
    expect(formatStudyExpectationsText(check).join('\n')).toContain('miss consumer-01-discovery: expected docs/gamma.md')
  })

  it('refuses references resolved against a different task suite, and a tampered or duplicated file', () => {
    const suite = suiteWithExpectations()
    const expectations = expectationsFor(suite, RESOLVED)
    const other = parseStudyTaskSuite(committed())
    expect(() => studyRetrievalSuite({ taskSuite: other, expectations })).toThrow('written for a different task suite')

    expect(() => parseStudyExpectations({ ...expectations, taskSuiteHash: 'f'.repeat(64) })).toThrow('content hash')
    const duplicated = createStudyExpectations({
      type: 'controlled-study-expectations',
      schemaVersion: 1,
      configVersion: 'v1',
      scope: 'local',
      taskSuiteHash: suite.contentHash,
      repositories: [{ id: 'consumer-01', targets: RESOLVED }, { id: 'consumer-01', targets: RESOLVED }],
    })
    expect(() => parseStudyExpectations(duplicated)).toThrow('duplicate repository ids')
    // The artifact declares itself local: it resolves references to paths and is never published.
    expect(expectations.scope).toBe('local')
  })

  it('checks one repository when asked, and reports nothing checked when a filter matches no task', () => {
    const suite = suiteWithExpectations()
    const expectations = expectationsFor(suite, RESOLVED)
    expect(checkStudyExpectations({ taskSuite: suite, expectations, index: fixtureIndex(), repositoryId: 'consumer-01' }).checkedTasks).toBe(2)
    const none = checkStudyExpectations({ taskSuite: suite, expectations, index: fixtureIndex(), repositoryId: 'consumer-02' })
    expect(none).toMatchObject({ ok: false, checkedTasks: 0 })
    expect(formatStudyExpectationsText(none).join('\n')).toContain('No case could be built: nothing was checked.')
  })
})

describe('the suite side of expectations', () => {
  it('accepts a suite without expectations by default and names the gaps in strict mode', () => {
    const published = parseStudyTaskSuite(committed())
    expect(() => validateStudyTaskSuite(published)).not.toThrow()
    expect(() => validateStudyTaskSuite(published, { requireExpectations: true })).toThrow('consumer-01-discovery')

    const partial = suiteWithExpectations()
    expect(() => validateStudyTaskSuite(partial, { requireExpectations: true })).toThrow('nothing about them can be checked mechanically')

    const payload = payloadOf()
    const every = createStudyTaskSuite({ ...payload, tasks: tasksOf(payload).map((task) => ({ ...task, expectedDocuments: ['primary-entrypoint'] })) })
    expect(() => validateStudyTaskSuite(every, { requireExpectations: true })).not.toThrow()
  })

  it('refuses a retrieval query with nothing expected, since it would check nothing', () => {
    const payload = payloadOf()
    const tasks = tasksOf(payload).map((task) => (task.id === 'consumer-01-discovery' ? { ...task, retrievalQueries: ['alpha subsystem'] } : task))
    expect(() => createStudyTaskSuite({ ...payload, tasks })).toThrow(/expected entities or documents/)
  })

  it('keeps the suite publication-bound: a reference may not be a path or a URL', () => {
    const payload = payloadOf()
    const tasks = tasksOf(payload).map((task) => (task.id === 'consumer-01-discovery' ? { ...task, expectedDocuments: ['docs/alpha.md'] } : task))
    expect(() => createStudyTaskSuite({ ...payload, tasks })).toThrow()
  })
})

describe('the adjudicator boundary: a model never re-decides a measurement', () => {
  it('splits the rubric into what a checker settled and what only a judgement can settle', () => {
    const suite = suiteWithExpectations()
    const task = suite.tasks.find((entry) => entry.id === 'consumer-01-discovery')!
    const mechanical = mechanicalRubricItems(task)
    const model = modelRubricItems(task)

    expect(mechanical).toEqual([{ outcome: 'success', text: 'Retrieval returns the expected entrypoint document in the first three results.', check: 'retrieval-expectations' }])
    expect(model.success).toEqual(['All required entrypoints and owners are correct and evidenced.'])
    expect(model.success).not.toContain(mechanical[0]!.text)
    // Every outcome is present, so a rubric with no prose items reads as an empty list, not a hole.
    expect(Object.keys(model).sort()).toEqual(['blocked', 'incomplete', 'incorrect', 'partial', 'success'])

    const split = adjudicatorRubric(task)
    expect(split.rubric).toEqual(model)
    expect(split.mechanical).toEqual(mechanical)
    expect(JSON.stringify(split.rubric)).not.toContain('first three results')

    // A plain string item stays a plain string item: a suite written before this is unchanged.
    const plain = suite.tasks.find((entry) => entry.id === 'consumer-02-discovery')!
    expect(mechanicalRubricItems(plain)).toEqual([])
    expect(modelRubricItems(plain).success).toEqual(plain.rubric.success.map(rubricItemText))
    expect(plain.rubric.success.map(rubricItemCheck)).toEqual([undefined])
  })
})
