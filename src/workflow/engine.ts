import { appendFileSync, existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'

import { contentHashForArtifactV1, sha256NormalizedV1 } from '../index-builder/content-hash.js'
import { WorkflowRunV1Schema, type WorkflowRunV1, type WorkflowState, type WorkflowStep } from '../schemas/knowledge.js'

export const WORKFLOW_STAGES = ['collect', 'normalize', 'reconcile', 'evaluate', 'report'] as const
export type WorkflowStage = (typeof WORKFLOW_STAGES)[number]

export type WorkflowStageContext = {
  readonly root: string
  readonly stage: WorkflowStage
  readonly input: unknown
  readonly previousOutput: unknown
}

export type WorkflowStageHandler = (context: WorkflowStageContext) => unknown

export type WorkflowOptions = {
  readonly root: string
  readonly stateDir?: string
  readonly sourceRevision: string
  readonly configurationHash: string
  readonly toolVersion?: string
  readonly runId?: string
  readonly stage?: WorkflowStage | 'all'
  readonly inputs?: Partial<Record<WorkflowStage, unknown>>
  readonly handlers: Partial<Record<WorkflowStage, WorkflowStageHandler>>
}

export type WorkflowExecutionResult = {
  readonly run: WorkflowRunV1
  readonly stateDir: string
  readonly reusedStages: readonly WorkflowStage[]
}

type PersistedArtifact = {
  readonly type: 'workflow-step-artifact'
  readonly stage: WorkflowStage
  readonly inputHash: string
  readonly outputHash: string
  readonly value: unknown
}

const stageState: Record<WorkflowStage, WorkflowState> = {
  collect: 'discovering',
  normalize: 'analyzed',
  reconcile: 'compared',
  evaluate: 'proposed',
  report: 'delivered',
}

const defaultStateDir = (root: string): string => join(root, '.doc-bridge', 'workflow')

const atomicWrite = (path: string, value: unknown): void => {
  const temp = `${path}.tmp-${process.pid}-${Date.now()}`
  writeFileSync(temp, `${JSON.stringify(value, null, 2)}\n`, 'utf8')
  renameSync(temp, path)
}

const writeManifest = (stateDir: string, run: WorkflowRunV1): void => {
  atomicWrite(join(stateDir, 'manifest.json'), run)
}

const appendTransition = (stateDir: string, transition: WorkflowRunV1['transitions'][number]): void => {
  appendFileSync(join(stateDir, 'transitions.jsonl'), `${JSON.stringify(transition)}\n`, 'utf8')
}

const transition = (run: WorkflowRunV1, to: WorkflowState, reason?: string): WorkflowRunV1 => {
  const item = {
    from: run.state,
    to,
    at: new Date().toISOString(),
    ...(reason ? { reason } : {}),
  }
  return { ...run, state: to, transitions: [...run.transitions, item] }
}

const runId = (): string => `${Date.now()}-${process.pid}`

const stageInputHash = (options: WorkflowOptions, stage: WorkflowStage, input: unknown): string =>
  sha256NormalizedV1({ stage, input, sourceRevision: options.sourceRevision, configurationHash: options.configurationHash, toolVersion: options.toolVersion ?? '1.0.0' })

const stageArtifactPath = (stateDir: string, stage: WorkflowStage, inputHash: string): string => join(stateDir, 'artifacts', `${stage}-${inputHash}.json`)

const readArtifact = (path: string): PersistedArtifact => JSON.parse(readFileSync(path, 'utf8')) as PersistedArtifact

const stepArtifactPath = (stateDir: string, step: WorkflowStep): string => resolve(stateDir, step.artifactRefs?.[0] ?? '')

const stepOutput = (stateDir: string, run: WorkflowRunV1, stage: WorkflowStage): unknown => {
  const step = run.steps.find((item) => item.name === stage)
  if (!step || step.status !== 'completed' || !step.artifactRefs?.[0]) return null
  return readArtifact(stepArtifactPath(stateDir, step)).value
}

const acquireLock = (stateDir: string): (() => void) => {
  const lock = join(stateDir, '.lock')
  try {
    mkdirSync(lock)
  } catch {
    const ownerPath = join(lock, 'owner.json')
    try {
      const owner = JSON.parse(readFileSync(ownerPath, 'utf8')) as { pid?: number }
      if (typeof owner.pid === 'number') process.kill(owner.pid, 0)
      throw new Error(`Workflow is already running (pid ${owner.pid ?? 'unknown'}).`)
    } catch (error) {
      if (error instanceof Error && error.message.startsWith('Workflow is already running')) throw error
      rmSync(lock, { recursive: true, force: true })
      mkdirSync(lock)
    }
  }
  writeFileSync(join(lock, 'owner.json'), JSON.stringify({ pid: process.pid, startedAt: new Date().toISOString() }), 'utf8')
  return () => rmSync(lock, { recursive: true, force: true })
}

const loadManifest = (stateDir: string): WorkflowRunV1 | undefined => {
  const path = join(stateDir, 'manifest.json')
  if (!existsSync(path)) return undefined
  return WorkflowRunV1Schema.parse(JSON.parse(readFileSync(path, 'utf8')) as unknown)
}

const baseRun = (options: WorkflowOptions, stateDir: string, supersedes?: string): WorkflowRunV1 => {
  const inputHash = sha256NormalizedV1({ sourceRevision: options.sourceRevision, configurationHash: options.configurationHash, toolVersion: options.toolVersion ?? '1.0.0' })
  return WorkflowRunV1Schema.parse({
    type: 'workflow-run',
    schemaVersion: 1,
    contentHash: '0'.repeat(64),
    contentHashAlgo: 'sha256-normalized-v1',
    project: { name: resolve(options.root).split('/').pop() ?? 'project', root: '.' },
    sourceRevision: options.sourceRevision,
    sourceRevisionKind: 'content',
    configurationHash: options.configurationHash,
    pipelineVersion: '1.0.0',
    analyzerVersions: { workflow: options.toolVersion ?? '1.0.0' },
    runId: options.runId ?? runId(),
    state: 'created',
    steps: WORKFLOW_STAGES.map((name) => ({ name, status: 'pending', inputHash })) as WorkflowStep[],
    transitions: [{ from: null, to: 'created', at: new Date().toISOString() }],
    artifactRefs: [relative(resolve(options.root), stateDir), ...(supersedes ? [`supersedes:${supersedes}`] : [])],
  })
}

const withHash = (run: WorkflowRunV1): WorkflowRunV1 => WorkflowRunV1Schema.parse({ ...run, contentHash: contentHashForArtifactV1(run) })

const sameInputs = (run: WorkflowRunV1, options: WorkflowOptions): boolean =>
  run.sourceRevision === options.sourceRevision &&
  run.configurationHash === options.configurationHash &&
  run.analyzerVersions.workflow === (options.toolVersion ?? '1.0.0')

const selectedStages = (stage: WorkflowOptions['stage']): readonly WorkflowStage[] =>
  stage && stage !== 'all' ? [stage] : WORKFLOW_STAGES

export const runWorkflow = (options: WorkflowOptions): WorkflowExecutionResult => {
  const root = resolve(options.root)
  const stateDir = resolve(root, options.stateDir ?? defaultStateDir(root))
  mkdirSync(join(stateDir, 'artifacts'), { recursive: true })
  const release = acquireLock(stateDir)
  try {
    let run = loadManifest(stateDir)
    let supersedes: string | undefined
    if (run && !sameInputs(run, options)) {
      supersedes = run.runId
      run = withHash(transition(run, 'stale', 'Source revision, configuration hash, or tool version changed.'))
      appendTransition(stateDir, run.transitions[run.transitions.length - 1]!)
      writeManifest(stateDir, run)
      run = undefined
    }
    if (!run) {
      run = withHash(baseRun(options, stateDir, supersedes))
      appendTransition(stateDir, run.transitions[0]!)
      writeManifest(stateDir, run)
    }

    if (!run) throw new Error('Workflow manifest was not initialized.')
    const firstSelectedStage = selectedStages(options.stage)[0]
    const previousStageIndex = firstSelectedStage ? WORKFLOW_STAGES.indexOf(firstSelectedStage) - 1 : -1
    let previousOutput: unknown = previousStageIndex >= 0 ? stepOutput(stateDir, run, WORKFLOW_STAGES[previousStageIndex]!) : null
    const reusedStages: WorkflowStage[] = []
    for (const stage of selectedStages(options.stage)) {
      const input = options.inputs?.[stage] ?? previousOutput
      const inputHash = stageInputHash(options, stage, input)
      const existing = run.steps.find((step) => step.name === stage)
      const artifactPath = existing?.artifactRefs?.[0] ? resolve(stateDir, existing.artifactRefs[0]) : stageArtifactPath(stateDir, stage, inputHash)
      if (existing?.status === 'completed' && existing.inputHash === inputHash && existing.outputHash && existsSync(artifactPath)) {
        previousOutput = readArtifact(artifactPath).value
        reusedStages.push(stage)
        continue
      }

      const handler = options.handlers[stage]
      if (!handler) throw new Error(`No handler configured for workflow stage "${stage}".`)
      run = withHash(transition(run, stageState[stage]))
      appendTransition(stateDir, run.transitions[run.transitions.length - 1]!)
      const runningStep: WorkflowStep = { name: stage, status: 'running', inputHash }
      run = withHash({ ...run, steps: run.steps.map((step) => step.name === stage ? runningStep : step) })
      writeManifest(stateDir, run)
      try {
        const value = handler({ root, stage, input, previousOutput })
        const outputHash = sha256NormalizedV1(value)
        const artifact: PersistedArtifact = { type: 'workflow-step-artifact', stage, inputHash, outputHash, value }
        mkdirSync(join(stateDir, 'artifacts'), { recursive: true })
        if (existsSync(artifactPath)) {
          const existingArtifact = readArtifact(artifactPath)
          if (existingArtifact.outputHash !== outputHash) throw new Error(`Immutable workflow artifact collision for stage "${stage}".`)
        } else {
          atomicWrite(artifactPath, artifact)
        }
        const ref = relative(stateDir, artifactPath)
        const completedStep: WorkflowStep = { name: stage, status: 'completed', inputHash, outputHash, artifactRefs: [ref] }
        run = withHash({ ...run, steps: run.steps.map((step) => step.name === stage ? completedStep : step) })
        writeManifest(stateDir, run)
        previousOutput = value
      } catch (error) {
        run = withHash(transition(run, 'failed', error instanceof Error ? error.message : String(error)))
        appendTransition(stateDir, run.transitions[run.transitions.length - 1]!)
        writeManifest(stateDir, run)
        throw error
      }
    }

    if (selectedStages(options.stage).every((stage) => run!.steps.find((step) => step.name === stage)?.status === 'completed')) {
      const complete = selectedStages(options.stage).includes('report') && run.state !== 'delivered' ? withHash(transition(run, 'delivered')) : run
      if (complete !== run) {
        appendTransition(stateDir, complete.transitions[complete.transitions.length - 1]!)
        run = complete
      }
      writeManifest(stateDir, run)
      if (run.state === 'delivered') atomicWrite(join(stateDir, 'last-known-good.json'), { runId: run.runId, manifestHash: run.contentHash, report: run.steps.find((step) => step.name === 'report')?.artifactRefs?.[0] })
    }
    return { run, stateDir, reusedStages }
  } finally {
    release()
  }
}

export const loadWorkflowManifest = (stateDir: string): WorkflowRunV1 => WorkflowRunV1Schema.parse(JSON.parse(readFileSync(join(resolve(stateDir), 'manifest.json'), 'utf8')) as unknown)

export const loadWorkflowStepOutput = (stateDir: string, stage: WorkflowStage): unknown => stepOutput(resolve(stateDir), loadWorkflowManifest(stateDir), stage)
