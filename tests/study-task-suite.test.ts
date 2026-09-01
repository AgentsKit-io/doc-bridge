import { readFileSync } from 'node:fs'

import { describe, expect, it } from 'vitest'

import {
  createStudyTaskSuite,
  evaluateStudyTask,
  formatStudyTaskSuiteText,
  parseStudyTaskSuite,
  selectTaskExecutions,
  validateStudyTaskSuite,
} from '../src/study/task-suite.js'

const fixture = () => JSON.parse(readFileSync(new URL('../docs/study/task-suite-v1.json', import.meta.url), 'utf8')) as unknown

describe('study task suite contracts', () => {
  it('validates the versioned 24-task suite and planned execution budget', () => {
    const suite = parseStudyTaskSuite(fixture())
    expect(suite.tasks).toHaveLength(24)
    expect(formatStudyTaskSuiteText(suite)).toContain('Executions planned: 288')
  })

  it('rejects incomplete repositories and budget overruns', () => {
    const source = fixture() as Record<string, unknown>
    const tasks = [...(source.tasks as unknown[])]
    const { contentHash: _contentHash, contentHashAlgo: _contentHashAlgo, ...payload } = source
    expect(() => createStudyTaskSuite({ ...payload, tasks: tasks.slice(0, 23) })).toThrow('exactly 24')
    const suite = parseStudyTaskSuite(fixture())
    const overBudget = { ...suite, tasks: suite.tasks.map((task, index) => index === 0 ? { ...task, budget: { maxTokens: suite.maxTokensPerTask + 1, maxRuntimeMs: task.budget.maxRuntimeMs } } : task) }
    expect(() => validateStudyTaskSuite(overBudget)).toThrow('exceeds the suite budget')
  })

  it('assigns deterministic balanced variants without changing the execution set', () => {
    const suite = parseStudyTaskSuite(fixture())
    const first = selectTaskExecutions(suite)
    const second = selectTaskExecutions(suite)
    expect(first).toEqual(second)
    expect(first).toHaveLength(288)
    for (const task of suite.tasks) {
      const variants = first.filter((execution) => execution.taskId === task.id).map((execution) => execution.variantId)
      expect(variants.filter((variant) => variant === 'variant-a')).toHaveLength(6)
      expect(variants.filter((variant) => variant === 'variant-b')).toHaveLength(6)
    }
  })

  it('selects a deterministic balanced sample across every model/scenario stratum', () => {
    const suite = parseStudyTaskSuite(fixture())
    const sample = selectTaskExecutions(suite, 24)
    expect(sample).toHaveLength(24)
    expect(new Set(sample.map((execution) => execution.taskId)).size).toBe(24)
    for (const modelId of suite.modelIds) for (const scenarioId of suite.scenarioIds) {
      expect(sample.filter((execution) => execution.modelId === modelId && execution.scenarioId === scenarioId)).toHaveLength(4)
    }
    expect(() => selectTaskExecutions(suite, 23)).toThrow('divisible')
  })

  it('selects pairwise arms for the same tasks', () => {
    const suite = parseStudyTaskSuite(fixture())
    const sample = selectTaskExecutions(suite, 96, { strategy: 'pairwise-task-strata', scenarioIds: ['repository-only', 'deterministic-doc-bridge'] })
    expect(sample).toHaveLength(96)
    expect(new Set(sample.map((execution) => execution.taskId)).size).toBe(24)
    for (const taskId of new Set(sample.map((execution) => execution.taskId))) {
      expect(sample.filter((execution) => execution.taskId === taskId)).toHaveLength(4)
      for (const modelId of suite.modelIds) for (const scenarioId of ['repository-only', 'deterministic-doc-bridge']) {
        expect(sample.filter((execution) => execution.taskId === taskId && execution.modelId === modelId && execution.scenarioId === scenarioId)).toHaveLength(1)
      }
    }
  })

  it('keeps adjudication separate and fails closed for blocked or incomplete outcomes', () => {
    const suite = parseStudyTaskSuite(fixture())
    const task = suite.tasks[0]
    expect(evaluateStudyTask(task, { acceptanceChecksPassed: 1, evidenceItemsPresent: 1 }).status).toBe('success')
    expect(evaluateStudyTask(task, { acceptanceChecksPassed: 0, evidenceItemsPresent: 0 }).status).toBe('incomplete')
    expect(evaluateStudyTask(task, { acceptanceChecksPassed: 1, evidenceItemsPresent: 0 }).status).toBe('partial')
    expect(evaluateStudyTask(task, { acceptanceChecksPassed: 1, evidenceItemsPresent: 1, blocked: true }).status).toBe('blocked')
    expect(evaluateStudyTask(task, { acceptanceChecksPassed: 1, evidenceItemsPresent: 1, incorrect: true }).status).toBe('incorrect')
  })

  it('rejects tampered task-suite hashes and unsafe public task text', () => {
    const suite = parseStudyTaskSuite(fixture())
    expect(() => parseStudyTaskSuite({ ...suite, contentHash: 'a'.repeat(64) })).toThrow('Invalid task-suite content hash')
    const { contentHash: _contentHash, contentHashAlgo: _contentHashAlgo, ...payload } = suite
    expect(() => createStudyTaskSuite({ ...payload, title: 'file:///private/task' })).toThrow('Public study text')
  })
})
