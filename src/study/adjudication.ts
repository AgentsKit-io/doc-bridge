import { spawn } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { z } from 'zod'

import {
  calculateStudyCostUsd,
  validateStudyProviderCommand,
  type StudyAdjudicatorCli,
} from './provider-cli.js'
import {
  createControlledStudyLedger,
  createControlledStudyObservation,
  parseControlledStudyLedger,
  type ControlledStudyObservationLedgerV1,
  type ControlledStudyObservationV1,
} from './runner.js'
import { parseStudyTaskSuite, type StudyTaskV1 } from './task-suite.js'

export const STUDY_ADJUDICATION_METHOD = 'independent-rubric-v1' as const

const outcome = z.enum(['success', 'partial', 'incorrect', 'incomplete', 'blocked'])
const identifier = z.string().regex(/^[a-z][a-z0-9-]{0,127}$/)
const AdjudicatorOutputSchema = z.object({
  outcome,
  confidence: z.number().min(0).max(1),
  reasonCodes: z.array(identifier).max(16),
  inputTokens: z.number().int().nonnegative().optional(),
  outputTokens: z.number().int().nonnegative().optional(),
  tokenMethod: z.enum(['provider', 'estimate']).optional(),
  measurements: z.record(z.string().min(1).max(128), z.number().finite().nonnegative()).optional(),
}).strict().superRefine((value, context) => {
  if ((value.inputTokens !== undefined || value.outputTokens !== undefined) && value.tokenMethod === undefined) context.addIssue({ code: z.ZodIssueCode.custom, path: ['tokenMethod'], message: 'Adjudicator token counts require a token method.' })
})

type AdjudicatorOutput = z.infer<typeof AdjudicatorOutputSchema>

type ProcessResult = {
  readonly status: 'completed' | 'timed-out' | 'unavailable' | 'invalid-output' | 'budget-exceeded'
  readonly stdout: string
  readonly stderrBytes: number
  readonly durationMs: number
}

const terminate = (child: ReturnType<typeof spawn>): void => {
  if (child.pid === undefined) return
  try { process.kill(-child.pid, 'SIGTERM') } catch { child.kill('SIGTERM') }
}

const runAdjudicatorProcess = (config: StudyAdjudicatorCli, cwd: string, input: string, maxRuntimeMs: number): Promise<ProcessResult> => new Promise((resolveResult) => {
  const env = Object.fromEntries([...new Set(['PATH', 'HOME', 'TMPDIR', ...config.envAllowlist])].flatMap((name) => process.env[name] === undefined ? [] : [[name, process.env[name] as string]]))
  const started = Date.now()
  const child = spawn(config.command, [...config.args], { cwd: resolve(cwd), shell: false, detached: true, env, stdio: ['pipe', 'pipe', 'pipe'] })
  let stdout = ''
  let stderrBytes = 0
  let settled = false
  const finish = (result: ProcessResult): void => { if (settled) return; settled = true; resolveResult(result) }
  const timer = setTimeout(() => { terminate(child); finish({ status: 'timed-out', stdout, stderrBytes, durationMs: Date.now() - started }) }, maxRuntimeMs)
  child.stdout.on('data', (chunk: Buffer) => {
    stdout += chunk.toString('utf8')
    if (Buffer.byteLength(stdout, 'utf8') > config.maxOutputBytes) { clearTimeout(timer); terminate(child); finish({ status: 'budget-exceeded', stdout: stdout.slice(0, config.maxOutputBytes), stderrBytes, durationMs: Date.now() - started }) }
  })
  child.stderr.on('data', (chunk: Buffer) => { stderrBytes += Buffer.byteLength(chunk) })
  child.once('error', () => { clearTimeout(timer); finish({ status: 'unavailable', stdout, stderrBytes, durationMs: Date.now() - started }) })
  child.once('close', (code) => {
    clearTimeout(timer)
    if (settled) return
    if (code !== 0) finish({ status: 'unavailable', stdout, stderrBytes, durationMs: Date.now() - started })
    else { try { JSON.parse(stdout) as unknown; finish({ status: 'completed', stdout, stderrBytes, durationMs: Date.now() - started }) } catch { finish({ status: 'invalid-output', stdout, stderrBytes, durationMs: Date.now() - started }) } }
  })
  child.stdin.end(input)
})

const adjudicatorInput = (task: StudyTaskV1, observation: ControlledStudyObservationV1): string => JSON.stringify({
  protocol: 'doc-bridge.study-adjudicator.v1',
  instruction: 'Evaluate only the bounded candidate record against the task rubric. Use evidenceCoverage and acceptanceExecution to distinguish missing evidence from unexecuted checks. Do not infer missing evidence. Return one JSON object and no prose.',
  task: { id: task.id, category: task.category, difficulty: task.difficulty, objective: task.objective, expectedOutcome: task.expectedOutcome, evidenceRequirements: task.evidenceRequirements, acceptanceChecks: task.acceptanceChecks, rubric: task.rubric },
  candidate: {
    taskOutcome: observation.taskOutcome ?? null,
    evidenceQuality: observation.evidenceQuality ?? null,
    safetyOutcome: observation.safetyOutcome ?? null,
    evidenceIds: observation.evidenceIds,
    evidenceCoverage: {
      required: task.evidenceRequirements.map((requirement) => ({ id: requirement.id, present: observation.evidenceIds.includes(requirement.id) })),
      referenceCount: observation.evidenceIds.length,
    },
    acceptanceExecution: {
      status: observation.execution.status,
      passed: observation.measurements?.acceptanceChecksPassed ?? null,
      total: observation.measurements?.acceptanceChecksTotal ?? null,
      measurementPresent: observation.measurements?.acceptanceChecksPassed !== undefined && observation.measurements?.acceptanceChecksTotal !== undefined,
    },
    measurements: observation.measurements ?? {},
    execution: { status: observation.execution.status, durationMs: observation.execution.durationMs, responseBytes: observation.execution.responseBytes },
  },
})

const withUpdatedObservation = (observation: ControlledStudyObservationV1, adjudication: ControlledStudyObservationV1['adjudication'], measurements: Readonly<Record<string, number>>): ControlledStudyObservationV1 => {
  const { contentHash: _contentHash, contentHashAlgo: _contentHashAlgo, ...payload } = observation
  return createControlledStudyObservation({ ...payload, measurements, adjudication })
}

export const independentlyAdjudicateStudyObservation = async (task: StudyTaskV1, observation: ControlledStudyObservationV1, config: StudyAdjudicatorCli, cwd: string, maxRuntimeMs: number, configurationHash: string): Promise<ControlledStudyObservationV1> => {
  validateStudyProviderCommand(config, cwd)
  const input = adjudicatorInput(task, observation)
  if (Buffer.byteLength(input, 'utf8') > config.maxInputBytes) throw new Error(`Adjudicator input limit ${config.maxInputBytes} bytes exceeded for ${task.id}.`)
  const processResult = await runAdjudicatorProcess(config, cwd, input, maxRuntimeMs)
  const baseMeasurements = { ...(observation.measurements ?? {}), adjudicatorLatencyMs: processResult.durationMs }
  if (processResult.status !== 'completed') return withUpdatedObservation(observation, { status: 'pending', actor: config.id, method: STUDY_ADJUDICATION_METHOD, reason: `Independent adjudicator ${processResult.status}.` }, baseMeasurements)
  const parsed = AdjudicatorOutputSchema.safeParse(JSON.parse(processResult.stdout))
  if (!parsed.success) return withUpdatedObservation(observation, { status: 'pending', actor: config.id, method: STUDY_ADJUDICATION_METHOD, reason: 'Independent adjudicator returned invalid output.' }, baseMeasurements)
  const output: AdjudicatorOutput = parsed.data
  const costUsd = calculateStudyCostUsd(config.pricing, {
    ...(output.inputTokens === undefined ? {} : { inputTokens: output.inputTokens }),
    ...(output.measurements?.cachedInputTokens === undefined ? {} : { cachedInputTokens: output.measurements.cachedInputTokens }),
    ...(output.outputTokens === undefined ? {} : { outputTokens: output.outputTokens }),
  })
  const tokenUnits = output.tokenMethod === 'provider' && output.inputTokens !== undefined && output.outputTokens !== undefined ? output.inputTokens + output.outputTokens : undefined
  return withUpdatedObservation(observation, {
    status: 'automated',
    actor: config.id,
    method: STUDY_ADJUDICATION_METHOD,
    configurationHash,
    outcome: output.outcome,
    confidence: output.confidence,
    reasonCodes: output.reasonCodes,
    reason: 'Independent adjudicator evaluated the anonymized bounded candidate record against the task rubric.',
  }, {
    ...baseMeasurements,
    ...(output.measurements ?? {}),
    ...(output.inputTokens === undefined ? {} : { adjudicatorInputTokens: output.inputTokens }),
    ...(output.outputTokens === undefined ? {} : { adjudicatorOutputTokens: output.outputTokens }),
    ...(tokenUnits === undefined ? {} : { adjudicatorTokenCostUnits: tokenUnits }),
    ...(costUsd === undefined ? {} : { adjudicatorCostUsd: costUsd }),
  })
}

export type IndependentStudyAdjudicationOptions = {
  readonly ledger: ControlledStudyObservationLedgerV1
  readonly taskSuite: ReturnType<typeof parseStudyTaskSuite>
  readonly config: StudyAdjudicatorCli
  readonly configurationHash: string
  readonly cwd: string
  readonly maxRuntimeMs: number
  readonly runId?: string
  readonly limit?: number
  readonly offset?: number
}

export const independentlyAdjudicateStudyLedger = async (options: IndependentStudyAdjudicationOptions): Promise<ControlledStudyObservationLedgerV1> => {
  if (options.limit !== undefined && (!Number.isInteger(options.limit) || options.limit < 1)) throw new Error('Adjudication limit must be a positive integer.')
  if (options.offset !== undefined && (!Number.isInteger(options.offset) || options.offset < 0)) throw new Error('Adjudication offset must be a non-negative integer.')
  const taskMap = new Map(options.taskSuite.tasks.map((task) => [task.id, task]))
  const observations = [] as ControlledStudyObservationV1[]
  let selected = 0
  let skipped = 0
  for (const observation of options.ledger.observations) {
    if (options.runId !== undefined && observation.runId !== options.runId) { observations.push(observation); continue }
    if (options.offset !== undefined && skipped < options.offset) { skipped += 1; observations.push(observation); continue }
    if (options.limit !== undefined && selected >= options.limit) { observations.push(observation); continue }
    const task = taskMap.get(observation.task.taskId)
    if (!task) throw new Error(`No task definition exists for ${observation.task.taskId}.`)
    selected += 1
    observations.push(await independentlyAdjudicateStudyObservation(task, observation, options.config, options.cwd, options.maxRuntimeMs, options.configurationHash))
  }
  const { contentHash: _contentHash, contentHashAlgo: _contentHashAlgo, ...payload } = options.ledger
  return createControlledStudyLedger({ ...payload, observations })
}

export const persistIndependentlyAdjudicatedLedger = (path: string, ledger: ControlledStudyObservationLedgerV1): string => {
  parseControlledStudyLedger(ledger)
  mkdirSync(dirname(resolve(path)), { recursive: true })
  writeFileSync(resolve(path), `${JSON.stringify(ledger, null, 2)}\n`, 'utf8')
  return resolve(path)
}

export const adjudicatedLedgerInputHash = (task: StudyTaskV1, observation: ControlledStudyObservationV1): string => createHash('sha256').update(adjudicatorInput(task, observation)).digest('hex')
