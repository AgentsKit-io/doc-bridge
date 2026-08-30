import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import { loadWorkflowManifest, runWorkflow, WORKFLOW_STAGES } from '../src/workflow/engine.js'

const hash = (character: string): string => character.repeat(64)

const handlers = (failReport = false) => Object.fromEntries(WORKFLOW_STAGES.map((stage, index) => [stage, ({ previousOutput }: { previousOutput: unknown }) => {
  if (stage === 'report' && failReport) throw new Error('report failed')
  return { stage, index, previousOutput }
}]))

describe('persistent workflow engine', () => {
  it('runs explicit stages and persists atomic, schema-valid state', () => {
    const root = mkdtempSync(join(tmpdir(), 'doc-bridge-workflow-stage-'))
    const result = runWorkflow({ root, sourceRevision: 'revision-1', configurationHash: hash('a'), stage: 'collect', handlers: handlers() })

    expect(result.run.state).toBe('discovering')
    expect(result.run.steps.find((step) => step.name === 'collect')?.status).toBe('completed')
    expect(result.reusedStages).toEqual([])
    expect(existsSync(join(result.stateDir, 'manifest.json'))).toBe(true)
    expect(existsSync(join(result.stateDir, 'transitions.jsonl'))).toBe(true)
    expect(loadWorkflowManifest(result.stateDir)).toEqual(result.run)
  })

  it('reuses completed artifacts and marks changed inputs stale without replacing last known good', () => {
    const root = mkdtempSync(join(tmpdir(), 'doc-bridge-workflow-idempotent-'))
    const first = runWorkflow({ root, sourceRevision: 'revision-1', configurationHash: hash('a'), handlers: handlers() })
    const second = runWorkflow({ root, sourceRevision: 'revision-1', configurationHash: hash('a'), handlers: handlers() })
    expect(second.reusedStages).toEqual([...WORKFLOW_STAGES])
    expect(second.run.steps.map((step) => step.artifactRefs?.[0])).toEqual(first.run.steps.map((step) => step.artifactRefs?.[0]))
    const lastKnownGood = readFileSync(join(first.stateDir, 'last-known-good.json'), 'utf8')

    let changed: ReturnType<typeof runWorkflow> | undefined
    expect(() => { changed = runWorkflow({ root, sourceRevision: 'revision-2', configurationHash: hash('a'), handlers: handlers(true) }) }).toThrow('report failed')
    expect(changed).toBeUndefined()
    expect(loadWorkflowManifest(first.stateDir).state).toBe('failed')
    expect(readFileSync(join(first.stateDir, 'last-known-good.json'), 'utf8')).toBe(lastKnownGood)
    expect(readFileSync(join(first.stateDir, 'transitions.jsonl'), 'utf8')).toContain('"to":"stale"')
    expect(readFileSync(join(first.stateDir, 'manifest.json'), 'utf8')).toContain('supersedes:')
  })

  it('recovers stale locks and serializes active locks', () => {
    const root = mkdtempSync(join(tmpdir(), 'doc-bridge-workflow-lock-'))
    const stateDir = join(root, '.state')
    mkdirSync(join(stateDir, '.lock'), { recursive: true })
    writeFileSync(join(stateDir, '.lock', 'owner.json'), JSON.stringify({ pid: 999999 }))
    expect(runWorkflow({ root, stateDir: '.state', sourceRevision: 'revision-1', configurationHash: hash('a'), stage: 'collect', handlers: handlers() }).run.state).toBe('discovering')

    mkdirSync(join(stateDir, '.lock'), { recursive: true })
    writeFileSync(join(stateDir, '.lock', 'owner.json'), JSON.stringify({ pid: process.pid }))
    expect(() => runWorkflow({ root, stateDir: '.state', sourceRevision: 'revision-1', configurationHash: hash('a'), stage: 'collect', handlers: handlers() })).toThrow('already running')
  })

  it('resumes a failed stage without rerunning valid prior artifacts', () => {
    const root = mkdtempSync(join(tmpdir(), 'doc-bridge-workflow-resume-'))
    expect(() => runWorkflow({ root, sourceRevision: 'revision-1', configurationHash: hash('a'), handlers: handlers(true) })).toThrow('report failed')
    const failed = loadWorkflowManifest(join(root, '.doc-bridge/workflow'))
    expect(failed.state).toBe('failed')
    const resumed = runWorkflow({ root, sourceRevision: 'revision-1', configurationHash: hash('a'), handlers: handlers() })
    expect(resumed.run.state).toBe('delivered')
    expect(resumed.reusedStages).toEqual(['collect', 'normalize', 'reconcile', 'evaluate'])
  })

  it('invalidates a failed run when its source changes before retry', () => {
    const root = mkdtempSync(join(tmpdir(), 'doc-bridge-workflow-failed-retry-'))
    expect(() => runWorkflow({ root, sourceRevision: 'revision-1', configurationHash: hash('a'), handlers: handlers(true) })).toThrow('report failed')
    const retried = runWorkflow({ root, sourceRevision: 'revision-2', configurationHash: hash('a'), handlers: handlers() })
    expect(retried.run.state).toBe('delivered')
    expect(retried.reusedStages).toEqual([])
    expect(retried.run.artifactRefs.some((ref) => ref.startsWith('supersedes:'))).toBe(true)
  })

  it('rejects a corrupted artifact and records the failure', () => {
    const root = mkdtempSync(join(tmpdir(), 'doc-bridge-workflow-corrupt-'))
    const first = runWorkflow({ root, sourceRevision: 'revision-1', configurationHash: hash('a'), stage: 'collect', handlers: handlers() })
    const step = first.run.steps.find((item) => item.name === 'collect')!
    writeFileSync(join(first.stateDir, step.artifactRefs![0]!), '{"type":"workflow-step-artifact","stage":"collect","inputHash":"bad","outputHash":"bad","value":{}}\n')
    expect(() => runWorkflow({ root, sourceRevision: 'revision-1', configurationHash: hash('a'), stage: 'normalize', handlers: handlers() })).toThrow(/Invalid workflow artifact|hash mismatch/)
    expect(loadWorkflowManifest(first.stateDir).state).toBe('failed')
  })

  it('records cancellation and allows an explicit resume', () => {
    const root = mkdtempSync(join(tmpdir(), 'doc-bridge-workflow-cancel-'))
    const cancelled = runWorkflow({ root, sourceRevision: 'revision-1', configurationHash: hash('a'), stage: 'collect', shouldCancel: () => true, handlers: handlers() })
    expect(cancelled.run.state).toBe('cancelled')
    const resumed = runWorkflow({ root, sourceRevision: 'revision-1', configurationHash: hash('a'), stage: 'collect', handlers: handlers() })
    expect(resumed.run.state).toBe('discovering')
    expect(resumed.run.steps.find((step) => step.name === 'collect')?.status).toBe('completed')
  })

  it('invalidates reuse when analyzer versions change', () => {
    const root = mkdtempSync(join(tmpdir(), 'doc-bridge-workflow-version-'))
    const first = runWorkflow({ root, sourceRevision: 'revision-1', configurationHash: hash('a'), analyzerVersions: { 'js-ts': '1.0.0' }, stage: 'collect', handlers: handlers() })
    const second = runWorkflow({ root, sourceRevision: 'revision-1', configurationHash: hash('a'), analyzerVersions: { 'js-ts': '2.0.0' }, stage: 'collect', handlers: handlers() })
    expect(second.reusedStages).toEqual([])
    expect(second.run.artifactRefs).toContain(`supersedes:${first.run.runId}`)
  })
})
