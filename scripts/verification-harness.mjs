#!/usr/bin/env node

import { execFileSync, spawn } from 'node:child_process'
import { createHash } from 'node:crypto'
import {
  appendFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { dirname, join, relative, resolve, sep } from 'node:path'

const VERSION = '1.4.0'
const STATES = new Set(['CLARIFYING', 'PLANNED', 'VERIFYING', 'AWAITING_HUMAN_APPROVAL', 'AWAITING_AUTHORIZATION', 'COMPLETE', 'BLOCKED', 'FAILED'])
const PROFILES = new Set(['default', 'strict', 'poc', 'custom', 'enterprise'])
const SURFACES = ['logic', 'endpoint', 'database', 'cli', 'mcp', 'ui', 'docs']
const PROFILE_POLICIES = {
  default: { requiresExplicitExemptions: false, requiresAllSurfaces: false, requiresMeasurement: false, requiresTracking: false },
  strict: { requiresExplicitExemptions: false, requiresAllSurfaces: false, requiresMeasurement: false, requiresTracking: false },
  poc: { requiresExplicitExemptions: true, requiresAllSurfaces: false, requiresMeasurement: false, requiresTracking: false },
  custom: { requiresExplicitExemptions: true, requiresAllSurfaces: false, requiresMeasurement: false, requiresTracking: false },
  enterprise: { requiresExplicitExemptions: false, requiresAllSurfaces: true, requiresMeasurement: true, requiresTracking: true },
}
const CATEGORIES = new Set(['build', 'test', 'lint', 'logic', 'endpoint', 'database', 'cli', 'mcp', 'ui', 'docs', 'custom'])
const INTENTS = new Set(['ok', 'certo', 'certa', 'aprovado', 'aprovada', 'approve', 'approved', 'confirmo', 'confirmado', 'confirmed', 'yes'])
const DEFAULT_CONFIG = '.codex/verification.json'
const LEGAL_TRANSITIONS = {
  null: ['PLANNED'],
  CLARIFYING: ['PLANNED', 'BLOCKED', 'FAILED'],
  PLANNED: ['CLARIFYING', 'VERIFYING', 'BLOCKED', 'FAILED'],
  VERIFYING: ['AWAITING_HUMAN_APPROVAL', 'AWAITING_AUTHORIZATION', 'COMPLETE', 'BLOCKED', 'FAILED'],
  AWAITING_HUMAN_APPROVAL: ['AWAITING_AUTHORIZATION', 'COMPLETE', 'BLOCKED', 'FAILED'],
  AWAITING_AUTHORIZATION: ['COMPLETE', 'BLOCKED', 'FAILED'],
  BLOCKED: [],
  FAILED: [],
  COMPLETE: [],
}

const fail = (message) => { throw new Error(message) }
const hash = (value) => createHash('sha256').update(JSON.stringify(value)).digest('hex')
const now = () => new Date().toISOString()
const readJson = (path) => JSON.parse(readFileSync(path, 'utf8'))
const assertKnownKeys = (value, allowed, label) => {
  for (const key of Object.keys(value ?? {})) if (!allowed.has(key)) fail(`${label}.${key} is not supported.`)
}
const writeAtomic = (path, value) => {
  mkdirSync(dirname(path), { recursive: true })
  const temp = `${path}.tmp-${process.pid}`
  writeFileSync(temp, `${JSON.stringify(value, null, 2)}\n`, 'utf8')
  renameSync(temp, path)
}

const parseArgs = (argv) => {
  const flags = new Set()
  const values = new Map()
  const positional = []
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]
    if (arg === '--config' || arg === '--run-id' || arg === '--by') {
      const value = argv[++i]
      if (!value) fail(`${arg} requires a value.`)
      values.set(arg.slice(2), value)
    } else if (arg?.startsWith('--')) flags.add(arg.slice(2))
    else if (arg) positional.push(arg)
  }
  return { flags, values, positional }
}

const projectRoot = (configPath, raw) => resolve(dirname(resolve(configPath)), raw.root ?? '.')
const inside = (root, path) => {
  const rel = relative(root, path)
  return rel === '' || (rel !== '..' && !rel.startsWith(`..${sep}`) && !rel.startsWith(sep))
}

const surfaceRequired = (value, name) => {
  if (typeof value === 'boolean') return { required: value, reason: value ? undefined : `${name} is not part of this verification target.` }
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail(`surfaces.${name} must be a boolean or { required, reason }.`)
  assertKnownKeys(value, new Set(['required', 'reason']), `surfaces.${name}`)
  if (typeof value.required !== 'boolean') fail(`surfaces.${name}.required must be boolean.`)
  if (!value.required && typeof value.reason !== 'string') fail(`surfaces.${name}.reason is required when the surface is not required.`)
  return { required: value.required, ...(value.reason ? { reason: value.reason } : {}) }
}

const validateConfig = (raw, configPath) => {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) fail(`Invalid verification config: ${configPath}`)
  assertKnownKeys(raw, new Set(['schemaVersion', 'project', 'root', 'stateDir', 'profile', 'contract', 'surfaces', 'checks', 'exemptions', 'measurement', 'tracking', 'cleanup', 'overrides', 'budget', 'benchmark']), 'verification config')
  if (raw.schemaVersion !== 1) fail('verification config schemaVersion must be 1.')
  if (typeof raw.project !== 'string' || !raw.project) fail('verification config project is required.')
  if (raw.root !== undefined && typeof raw.root !== 'string') fail('verification config root must be a string.')
  if (raw.stateDir !== undefined && (typeof raw.stateDir !== 'string' || !raw.stateDir.trim())) fail('verification config stateDir must be a non-empty string.')
  if (raw.stateDir !== undefined && !inside(projectRoot(configPath, raw), resolve(projectRoot(configPath, raw), raw.stateDir))) fail('verification config stateDir must stay inside the project root.')
  if (raw.budget !== undefined) {
    if (!raw.budget || typeof raw.budget !== 'object' || Array.isArray(raw.budget)) fail('verification config budget must be an object.')
    assertKnownKeys(raw.budget, new Set(['maxDurationMs']), 'budget')
    if (!Number.isInteger(raw.budget.maxDurationMs) || raw.budget.maxDurationMs < 1) fail('budget.maxDurationMs must be a positive integer.')
  }
  if (raw.benchmark !== undefined) {
    if (!raw.benchmark || typeof raw.benchmark !== 'object' || Array.isArray(raw.benchmark)) fail('verification config benchmark must be an object.')
    assertKnownKeys(raw.benchmark, new Set(['suiteId', 'taskId', 'mode']), 'benchmark')
    for (const key of ['suiteId', 'taskId', 'mode']) if (typeof raw.benchmark[key] !== 'string' || !raw.benchmark[key].trim()) fail(`benchmark.${key} must be a non-empty string.`)
  }
  const profile = raw.profile ?? 'default'
  if (!PROFILES.has(profile)) fail(`verification config profile must be one of: ${[...PROFILES].join(', ')}.`)
  const policy = PROFILE_POLICIES[profile]
  if (raw.overrides !== undefined) {
    if (!raw.overrides || typeof raw.overrides !== 'object' || Array.isArray(raw.overrides)) fail('overrides must be an object.')
    assertKnownKeys(raw.overrides, new Set(['profile']), 'overrides')
    if (raw.overrides.profile !== undefined) fail('overrides.profile is not supported; set profile explicitly.')
  }
  if (!Array.isArray(raw.checks) || raw.checks.length === 0) fail('verification config requires at least one check.')
  const checks = raw.checks.map((check, index) => {
    if (!check || typeof check !== 'object' || Array.isArray(check)) fail(`checks[${index}] must be an object.`)
    assertKnownKeys(check, new Set(['id', 'category', 'command', 'required', 'timeoutMs', 'execution', 'capabilities', 'evidence']), `checks[${index}]`)
    if (typeof check.id !== 'string' || !check.id) fail(`checks[${index}].id is required.`)
    if (typeof check.command !== 'string' || !check.command) fail(`checks[${index}].command is required.`)
    if (!CATEGORIES.has(check.category)) fail(`checks[${index}].category is invalid.`)
    if (check.required !== undefined && typeof check.required !== 'boolean') fail(`checks[${index}].required must be boolean.`)
    if (check.timeoutMs !== undefined && (!Number.isInteger(check.timeoutMs) || check.timeoutMs < 1)) fail(`checks[${index}].timeoutMs must be a positive integer.`)
    if (check.evidence !== undefined && (typeof check.evidence !== 'string' || !check.evidence.trim())) fail(`checks[${index}].evidence must be a non-empty string.`)
    if (['endpoint', 'database', 'cli', 'mcp', 'ui'].includes(check.category) && check.execution !== 'real') fail(`checks[${index}] requires execution: "real".`)
    if (check.capabilities !== undefined && (!Array.isArray(check.capabilities) || check.capabilities.some((item) => typeof item !== 'string' || !item.trim()))) fail(`checks[${index}].capabilities must contain non-empty strings.`)
    if (check.category === 'ui') {
      for (const capability of ['real-browser', 'screenshot']) if (!check.capabilities?.includes(capability)) fail(`checks[${index}] requires capability "${capability}".`)
    }
    return { required: true, timeoutMs: 120_000, ...check }
  })
  if (new Set(checks.map((check) => check.id)).size !== checks.length) fail('check ids must be unique.')
  if (!raw.contract || typeof raw.contract !== 'object' || Array.isArray(raw.contract)) fail('verification contract is required.')
  assertKnownKeys(raw.contract, new Set(['intent', 'scope', 'ambiguities', 'outcomes']), 'contract')
  if (typeof raw.contract.intent !== 'string' || !raw.contract.intent.trim()) fail('contract.intent is required.')
  if (raw.contract.scope !== undefined) {
    if (!raw.contract.scope || typeof raw.contract.scope !== 'object' || Array.isArray(raw.contract.scope)) fail('contract.scope must be an object.')
    assertKnownKeys(raw.contract.scope, new Set(['inScope', 'outOfScope']), 'contract.scope')
    for (const key of ['inScope', 'outOfScope']) if (!Array.isArray(raw.contract.scope[key]) || raw.contract.scope[key].some((item) => typeof item !== 'string' || !item.trim())) fail(`contract.scope.${key} must contain non-empty strings.`)
  }
  if (raw.contract.ambiguities !== undefined && (!Array.isArray(raw.contract.ambiguities) || raw.contract.ambiguities.some((item) => typeof item !== 'string' || !item.trim()))) fail('contract.ambiguities must contain non-empty strings.')
  if (!Array.isArray(raw.contract.outcomes) || raw.contract.outcomes.length === 0) fail('contract.outcomes requires at least one outcome.')
  const checkIds = new Set(checks.map((check) => check.id))
  const outcomes = raw.contract.outcomes.map((outcome, index) => {
    if (!outcome || typeof outcome !== 'object' || Array.isArray(outcome)) fail(`contract.outcomes[${index}] must be an object.`)
    assertKnownKeys(outcome, new Set(['id', 'statement', 'checks']), `contract.outcomes[${index}]`)
    if (typeof outcome.id !== 'string' || !outcome.id.trim()) fail(`contract.outcomes[${index}].id is required.`)
    if (typeof outcome.statement !== 'string' || !outcome.statement.trim()) fail(`contract.outcomes[${index}].statement is required.`)
    if (!Array.isArray(outcome.checks) || outcome.checks.length === 0) fail(`contract.outcomes[${index}].checks requires at least one check id.`)
    if (outcome.checks.some((checkId) => typeof checkId !== 'string' || !checkIds.has(checkId))) fail(`contract.outcomes[${index}] references an unknown check.`)
    if (outcome.checks.some((checkId) => !checks.find((check) => check.id === checkId)?.required)) fail(`contract.outcomes[${index}] references a non-required check.`)
    return { id: outcome.id, statement: outcome.statement, checks: [...new Set(outcome.checks)] }
  })
  if (new Set(outcomes.map((outcome) => outcome.id)).size !== outcomes.length) fail('contract outcome ids must be unique.')
  if (raw.surfaces !== undefined && (!raw.surfaces || typeof raw.surfaces !== 'object' || Array.isArray(raw.surfaces))) fail('surfaces must be an object.')
  if (raw.surfaces) for (const name of Object.keys(raw.surfaces)) if (!SURFACES.includes(name)) fail(`surfaces.${name} is not supported.`)
  const surfaces = {}
  for (const name of SURFACES) {
    if (policy.requiresAllSurfaces && !Object.hasOwn(raw.surfaces ?? {}, name)) fail(`enterprise profile requires surfaces.${name} to be declared.`)
    surfaces[name] = surfaceRequired(raw.surfaces?.[name] ?? (name === 'logic'), name)
  }
  for (const [name, surface] of Object.entries(surfaces)) {
    const matching = checks.some((check) => check.category === name && check.required)
    if (surface.required && !matching) fail(`Required surface "${name}" has no required check.`)
  }
  if (policy.requiresExplicitExemptions && (!Array.isArray(raw.exemptions) || raw.exemptions.length === 0)) fail('This profile requires explicit exemptions.')
  if (raw.exemptions && (!Array.isArray(raw.exemptions) || raw.exemptions.some((item) => typeof item !== 'string' || !item.trim()))) fail('exemptions must be non-empty strings.')
  const measurement = raw.measurement ?? { required: false }
  if (!measurement || typeof measurement !== 'object' || Array.isArray(measurement)) fail('measurement must be an object.')
  assertKnownKeys(measurement, new Set(['required', 'checkId', 'baseline']), 'measurement')
  if (typeof measurement.required !== 'boolean') fail('measurement.required must be boolean.')
  if (policy.requiresMeasurement && !measurement.required) fail('enterprise profile requires measurement.required to be true.')
  if (measurement.required) {
    if (typeof measurement.checkId !== 'string' || !measurement.checkId.trim()) fail('measurement.checkId is required when measurement is required.')
    const measurementCheck = checks.find((check) => check.id === measurement.checkId)
    if (!measurementCheck) fail(`measurement.checkId references an unknown check: ${measurement.checkId}.`)
    if (!measurementCheck.required) fail('measurement.checkId must reference a required check.')
    if (typeof measurement.baseline !== 'string' || !measurement.baseline.trim()) fail('measurement.baseline is required when measurement is required.')
  }
  const tracking = raw.tracking ?? (policy.requiresTracking
    ? { required: true, authorization: 'ask' }
    : { required: false, reason: 'tracking is not configured for this run.' })
  assertKnownKeys(tracking, new Set(['required', 'authorization', 'target', 'reason']), 'tracking')
  if (typeof tracking.required !== 'boolean') fail('tracking.required must be boolean.')
  if (policy.requiresTracking && !tracking.required) fail('enterprise profile requires tracking.required to be true.')
  if (tracking.required && tracking.authorization !== 'ask') fail('tracking.authorization must be "ask".')
  if (tracking.required && typeof tracking.target !== 'string') fail('tracking.target is required when tracking is required.')
  if (!tracking.required && typeof tracking.reason !== 'string') fail('tracking.reason is required when tracking is not required.')
  if (raw.cleanup !== undefined) {
    if (!raw.cleanup || typeof raw.cleanup !== 'object' || Array.isArray(raw.cleanup)) fail('cleanup must be an object.')
    assertKnownKeys(raw.cleanup, new Set(['roots']), 'cleanup')
    if (raw.cleanup.roots !== undefined && (!Array.isArray(raw.cleanup.roots) || raw.cleanup.roots.some((root) => typeof root !== 'string' || !root.trim()))) fail('cleanup.roots must contain non-empty strings.')
  }
  return { ...raw, profile, checks, contract: { intent: raw.contract.intent.trim(), ...(raw.contract.scope ? { scope: raw.contract.scope } : {}), ...(raw.contract.ambiguities ? { ambiguities: raw.contract.ambiguities } : {}), outcomes }, surfaces, tracking, measurement, configPath, profilePolicy: policy }
}

const sourceRevision = (root) => {
  try {
    const gitOptions = { cwd: root, encoding: 'utf8', maxBuffer: 20 * 1024 * 1024, stdio: ['ignore', 'pipe', 'ignore'] }
    const head = execFileSync('git', ['rev-parse', 'HEAD'], gitOptions).trim()
    const diff = execFileSync('git', ['diff', '--no-ext-diff', '--binary', 'HEAD'], gitOptions)
    const status = execFileSync('git', ['status', '--porcelain=v1', '--untracked-files=all'], gitOptions)
    const untracked = execFileSync('git', ['ls-files', '--others', '--exclude-standard', '-z'], gitOptions)
      .split('\0').filter(Boolean).map((path) => ({ path, contentHash: hash(readFileSync(resolve(root, path), 'utf8')) }))
    return hash({ head, diff, status, untracked })
  } catch {
    return hash({ files: readdirSync(root).sort() })
  }
}

const machineStatusFrom = (stdout) => {
  const lines = String(stdout ?? '').trim().split('\n').reverse()
  for (const line of lines) {
    try {
      const value = JSON.parse(line)
      if (value && ['failed', 'passed', 'pending-human-review'].includes(value.status)) return value
    } catch {}
  }
  return undefined
}

const commandResult = (root, check) => new Promise((resolveResult) => {
  const started = Date.now()
  const child = spawn(check.command, { cwd: root, shell: true, env: { ...process.env, CI: process.env.CI ?? '1' } })
  let stdout = ''
  let stderr = ''
  const append = (current, chunk) => `${current}${chunk.toString()}`.slice(-12_000)
  child.stdout.on('data', (chunk) => { stdout = append(stdout, chunk) })
  child.stderr.on('data', (chunk) => { stderr = append(stderr, chunk) })
  const timer = setTimeout(() => child.kill('SIGTERM'), check.timeoutMs)
  child.on('error', (error) => resolveResult({ status: 'failed', exitCode: null, durationMs: Date.now() - started, stdout, stderr: `${stderr}${error.message}`.slice(-12_000) }))
  child.on('close', (exitCode, signal) => {
    clearTimeout(timer)
    const machineResult = machineStatusFrom(stdout)
    const status = exitCode !== 0 || machineResult?.status === 'failed'
      ? 'failed'
      : machineResult?.status === 'pending-human-review'
        ? 'awaiting-human-approval'
        : 'passed'
    resolveResult({ status, exitCode, signal, durationMs: Date.now() - started, stdout, stderr, ...(machineResult ? { verificationStatus: machineResult.status, verification: machineResult } : {}) })
  })
})

const validateUiEvidence = (root, run) => ({
  ...run,
  checks: run.checks.map((check) => {
    if (check.category !== 'ui' || check.status === 'failed') return check
    const evidence = check.verification
    const failures = []
    if (!evidence || evidence.capability !== 'real-browser') failures.push('UI evidence must declare capability "real-browser"')
    if (!Array.isArray(evidence?.artifacts) || evidence.artifacts.length === 0) failures.push('UI evidence must include screenshot artifacts')
    for (const artifact of evidence?.artifacts ?? []) {
      if (artifact?.type !== 'screenshot' || typeof artifact.path !== 'string' || typeof artifact.sha256 !== 'string' || typeof artifact.viewport !== 'string') {
        failures.push('Each UI artifact must include type=screenshot, path, sha256, and viewport')
        continue
      }
      const path = resolve(root, artifact.path)
      if (!inside(root, path) || !existsSync(path)) failures.push(`Screenshot artifact is missing or outside the project: ${artifact.path}`)
      else if (createHash('sha256').update(readFileSync(path)).digest('hex') !== artifact.sha256) failures.push(`Screenshot hash mismatch: ${artifact.path}`)
    }
    const criterionIds = run.contract.outcomes.filter((outcome) => outcome.checks.includes(check.id)).map((outcome) => outcome.id)
    if (!evidence?.criteria || typeof evidence.criteria !== 'object' || Array.isArray(evidence.criteria)) failures.push('UI evidence must include criterion-level results')
    for (const id of criterionIds) if (evidence?.criteria?.[id]?.status !== 'passed') failures.push(`UI criterion did not pass: ${id}`)
    if (!failures.length) return check
    return { ...check, status: 'failed', verificationStatus: 'failed', verification: { ...(evidence ?? {}), status: 'failed', failures } }
  }),
})

const validateMeasurementResult = (run, measurement) => {
  if (!measurement.required) return run
  const check = run.checks.find((item) => item.id === measurement.checkId)
  const verification = check?.verification
  const failures = []
  if (check?.status !== 'passed') failures.push(`measurement check ${measurement.checkId} did not pass`)
  if (!verification || typeof verification.metrics !== 'object' || Array.isArray(verification.metrics)) failures.push('measurement evidence must include an object named metrics')
  if (typeof verification?.baselineHash !== 'string' || !verification.baselineHash) failures.push('measurement evidence must include baselineHash')
  if (!Array.isArray(verification?.regressions)) failures.push('measurement evidence must include a regressions array')
  else if (verification.regressions.length) failures.push(`measurement regressions detected: ${verification.regressions.join('; ')}`)
  if (!failures.length) return run
  return {
    ...run,
    checks: run.checks.map((item) => item.id === measurement.checkId ? {
      ...item,
      status: 'failed',
      verificationStatus: 'failed',
      verification: { status: 'failed', failures },
    } : item),
  }
}

const stateDirFor = (root, configuredStateDir) => resolve(root, configuredStateDir ?? join('.codex', 'verification'))
const runDirFor = (root, runId, configuredStateDir) => join(stateDirFor(root, configuredStateDir), 'runs', runId)
const latestPathFor = (root, configuredStateDir) => join(stateDirFor(root, configuredStateDir), 'latest.json')
const loadLatest = (root, configuredStateDir) => existsSync(latestPathFor(root, configuredStateDir)) ? readJson(latestPathFor(root, configuredStateDir)) : undefined
const saveRun = (root, run, configuredStateDir) => {
  const dir = runDirFor(root, run.runId, configuredStateDir)
  writeAtomic(join(dir, 'run.json'), run)
  writeAtomic(latestPathFor(root, configuredStateDir), { runId: run.runId, state: run.state, path: relative(root, join(dir, 'run.json')), updatedAt: now() })
}
const transition = (run, state, reason) => {
  if (!STATES.has(state)) fail(`Unknown verification state: ${state}.`)
  const allowed = LEGAL_TRANSITIONS[String(run.state)] ?? []
  if (!allowed.includes(state)) fail(`Illegal verification transition ${run.state} -> ${state}.`)
  return { ...run, state, transitions: [...run.transitions, { from: run.state, to: state, at: now(), ...(reason ? { reason } : {}) }] }
}

const attachEvidence = (run) => {
  const evidenceReferences = run.checks.map((check) => ({
    checkId: check.id,
    status: check.status,
    ...(check.verificationStatus ? { verificationStatus: check.verificationStatus } : {}),
    evidenceHash: hash({ id: check.id, status: check.status, stdout: check.stdout, stderr: check.stderr, verification: check.verification }),
  }))
  const metrics = Object.fromEntries(run.checks.flatMap((check) => Object.entries(check.verification?.metrics ?? {})))
  return { ...run, evidenceReferences, metrics, outputHash: hash({ checks: run.checks, outcomes: run.outcomes, evidenceReferences, metrics }) }
}

const runVerification = async (root, config, runId) => {
  const source = sourceRevision(root)
  const inputHash = hash({ source, config: hash(config), version: VERSION })
  const previous = loadLatest(root, config.stateDir)
  if (previous?.runId) {
    const previousRunPath = join(root, previous.path)
    if (existsSync(previousRunPath)) {
      const previousRun = readJson(previousRunPath)
      if (previousRun.inputHash === inputHash && ['AWAITING_HUMAN_APPROVAL', 'AWAITING_AUTHORIZATION', 'COMPLETE'].includes(previousRun.state)) return previousRun
    }
  }
  const id = runId ?? `${Date.now()}-${process.pid}`
  let run = {
    schemaVersion: 1,
    type: 'verification-run',
    harnessVersion: VERSION,
    runId: id,
    project: config.project,
    profile: config.profile,
    profilePolicy: config.profilePolicy,
    sourceRevision: source,
    contractHash: hash(config.contract),
    inputHash,
    state: 'PLANNED',
    configPath: relative(root, config.configPath),
    contract: config.contract,
    checks: config.checks.map(({ id: checkId, category, command, required, timeoutMs, capabilities }) => ({ id: checkId, category, command, required, timeoutMs, ...(capabilities ? { capabilities } : {}), status: 'pending' })),
    surfaces: config.surfaces,
    applicability: config.surfaces,
    tracking: config.tracking,
    exemptions: config.exemptions ?? [],
    transitions: [{ from: null, to: 'PLANNED', at: now() }],
  }
  saveRun(root, run, config.stateDir)
  run = transition(run, 'VERIFYING')
  saveRun(root, run, config.stateDir)
  for (const [index, check] of config.checks.entries()) {
    const result = await commandResult(root, check)
    run = { ...run, checks: run.checks.map((item, itemIndex) => itemIndex === index ? { ...item, ...result } : item) }
    saveRun(root, run, config.stateDir)
  }
  run = validateUiEvidence(root, run)
  run = {
    ...run,
    outcomes: run.contract.outcomes.map((outcome) => {
      const checks = run.checks.filter((check) => outcome.checks.includes(check.id))
      const status = checks.some((check) => check.status === 'failed') ? 'failed' : checks.some((check) => check.status === 'awaiting-human-approval') ? 'awaiting-human-approval' : 'passed'
      return { ...outcome, status }
    }),
  }
  run = validateMeasurementResult(run, config.measurement)
  run = {
    ...run,
    outcomes: run.contract.outcomes.map((outcome) => {
      const checks = run.checks.filter((check) => outcome.checks.includes(check.id))
      const status = checks.some((check) => check.status === 'failed') ? 'failed' : checks.some((check) => check.status === 'awaiting-human-approval') ? 'awaiting-human-approval' : 'passed'
      return { ...outcome, status }
    }),
  }
  run = attachEvidence(run)
  const failedOutcomes = run.outcomes.filter((outcome) => outcome.status === 'failed')
  const failed = run.checks.filter((check) => check.required && !['passed', 'awaiting-human-approval'].includes(check.status))
  if (failed.length) run = transition(run, 'BLOCKED', `Required checks failed: ${failed.map((check) => check.id).join(', ')}`)
  else if (failedOutcomes.length) run = transition(run, 'BLOCKED', `Contract outcomes failed: ${failedOutcomes.map((outcome) => outcome.id).join(', ')}`)
  else if (config.surfaces.ui.required) run = transition(run, 'AWAITING_HUMAN_APPROVAL', 'Visual UI approval is required.')
  else if (config.tracking.required) run = transition(run, 'AWAITING_AUTHORIZATION', `Tracking authorization is required for ${config.tracking.target}.`)
  else run = transition(run, 'COMPLETE', 'All configured verification gates passed.')
  saveRun(root, run, config.stateDir)
  return run
}

const intent = (value) => {
  const normalized = String(value ?? '').trim().toLowerCase()
  if (!INTENTS.has(normalized)) fail(`Invalid human intent "${value}". Use an explicit approval word: ok, aprovado, approved, confirmo.`)
  return normalized
}

const updateApproval = (root, run, type, rawIntent, by, configuredStateDir) => {
  const expectedState = type === 'human-approval' ? 'AWAITING_HUMAN_APPROVAL' : 'AWAITING_AUTHORIZATION'
  if (run.state !== expectedState) fail(`Cannot record ${type} while run is ${run.state}.`)
  const approvedIntent = intent(rawIntent)
  const dir = runDirFor(root, run.runId, configuredStateDir)
  writeAtomic(join(dir, `${type}.json`), {
    type,
    runId: run.runId,
    runInputHash: run.inputHash,
    runSourceRevision: run.sourceRevision,
    runContractHash: run.contractHash,
    runOutputHash: run.outputHash,
    intent: approvedIntent,
    by: by ?? 'human',
    at: now(),
  })
  if (type === 'human-approval') {
    run = {
      ...run,
      checks: run.checks.map((check) => check.status === 'awaiting-human-approval'
        ? { ...check, status: 'passed', verificationStatus: 'human-approved' }
        : check),
      outcomes: run.outcomes.map((outcome) => outcome.status === 'awaiting-human-approval' ? { ...outcome, status: 'passed' } : outcome),
    }
    run = attachEvidence(run)
  }
  if (type === 'human-approval' && run.state === 'AWAITING_HUMAN_APPROVAL') run = run.tracking.required ? transition(run, 'AWAITING_AUTHORIZATION', `Human approval recorded for ${run.runId}.`) : transition(run, 'COMPLETE', 'Human approval recorded and all gates passed.')
  if (type === 'tracking-authorization' && run.state === 'AWAITING_AUTHORIZATION') run = transition(run, 'COMPLETE', `Tracking authorization recorded for ${run.tracking.target}.`)
  saveRun(root, run, configuredStateDir)
  return run
}

const replaceBaseline = (root, config, sourcePath, rawIntent, by) => {
  if (!config.measurement.required) fail('Baseline replacement requires measurement.required to be true.')
  if (!config.measurement.baseline) fail('Baseline replacement requires measurement.baseline.')
  if (!by) fail('Baseline replacement requires --by.')
  const approvedIntent = intent(rawIntent)
  const target = resolve(root, config.measurement.baseline)
  const source = resolve(root, sourcePath ?? '')
  if (!inside(root, target) || !inside(root, source)) fail('Baseline source and target must be inside the project root.')
  if (!existsSync(source)) fail(`Baseline source not found: ${sourcePath}`)
  if (source === target) fail('Baseline source must differ from the configured baseline target.')
  const value = readJson(source)
  writeAtomic(target, value)
  const auditPath = join(stateDirFor(root, config.stateDir), 'baseline-audit.jsonl')
  mkdirSync(dirname(auditPath), { recursive: true })
  const entry = { action: 'replace-baseline', source: relative(root, source), target: relative(root, target), baselineHash: hash(value), intent: approvedIntent, by, at: now() }
  appendFileSync(auditPath, `${JSON.stringify(entry)}\n`, 'utf8')
  return { status: 'baseline-replaced', ...entry }
}

const clean = (root, config, periodic) => {
  const manifestPath = join(stateDirFor(root, config.stateDir), 'owned-artifacts.json')
  if (!existsSync(manifestPath)) return { removed: [], skipped: [], periodic, message: 'No task-owned artifacts are registered.' }
  const manifest = readJson(manifestPath)
  if (!Array.isArray(manifest)) fail('owned-artifacts.json must contain an array.')
  const removed = []
  const skipped = []
  for (const entry of manifest) {
    const path = resolve(root, entry.path)
    const allowedRoots = (config.cleanup?.roots ?? ['.codex/verification/tmp']).map((item) => resolve(root, item))
    if (!entry.taskOwned || !inside(root, path) || !allowedRoots.some((allowed) => inside(allowed, path))) { skipped.push({ path: entry.path, reason: 'not task-owned or outside cleanup roots' }); continue }
    if (existsSync(path)) { rmSync(path, { recursive: true, force: true }); removed.push(entry.path) }
  }
  return { removed, skipped, periodic }
}

const output = (value, json) => process.stdout.write(json ? `${JSON.stringify(value, null, 2)}\n` : `Run: ${value.runId ?? '-'}\nState: ${value.state ?? value.status ?? '-'}\n${value.reason ? `Reason: ${value.reason}\n` : ''}`)

const main = async (argv) => {
  const { flags, values, positional } = parseArgs(argv)
  const command = positional[0] ?? 'help'
  if (flags.has('help') || command === 'help') {
    process.stdout.write('ak-verify run|status|approve <run-id> <intent>|authorize <run-id> <intent>|baseline replace <source> <intent> [--by <actor>]|clean [--periodic] [--config <path>] [--json]\n')
    return 0
  }
  const configPath = resolve(values.get('config') ?? DEFAULT_CONFIG)
  if (!existsSync(configPath)) fail(`Verification contract not found: ${configPath}`)
  const root = projectRoot(configPath, readJson(configPath))
  const config = validateConfig(readJson(configPath), configPath)
  if (command === 'baseline') {
    if (positional[1] !== 'replace') fail('Use: baseline replace <source> <intent> --by <actor>.')
    const result = replaceBaseline(root, config, positional[2], positional[3], values.get('by'))
    output(result, flags.has('json'))
    return 0
  }
  if (command === 'run') {
    const run = await runVerification(root, config, values.get('run-id'))
    output(run, flags.has('json'))
    return ['COMPLETE', 'AWAITING_HUMAN_APPROVAL', 'AWAITING_AUTHORIZATION'].includes(run.state) ? 0 : 1
  }
  if (command === 'status') {
    const latest = loadLatest(root, config.stateDir)
    if (!latest) fail('No verification run exists.')
    const run = readJson(join(root, latest.path))
    output(run, flags.has('json'))
    return run.state === 'COMPLETE' ? 0 : 1
  }
  if (command === 'clean') { output(clean(root, config, flags.has('periodic')), flags.has('json')); return 0 }
  const latest = loadLatest(root, config.stateDir)
  if (!latest) fail('No verification run exists.')
  let run = readJson(join(root, latest.path))
  const targetRunId = positional[1]
  if (targetRunId !== run.runId) fail(`Run id mismatch. Latest run is ${run.runId}.`)
  if (command === 'approve') run = updateApproval(root, run, 'human-approval', positional[2], values.get('by'), config.stateDir)
  else if (command === 'authorize') run = updateApproval(root, run, 'tracking-authorization', positional[2], values.get('by'), config.stateDir)
  else fail(`Unknown command "${command}".`)
  output(run, flags.has('json'))
  return run.state === 'COMPLETE' ? 0 : 1
}

if (import.meta.url === `file://${process.argv[1]}`) {
  try { process.exitCode = await main(process.argv.slice(2)) }
  catch (error) { process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`); process.exitCode = 2 }
}

export { INTENTS, LEGAL_TRANSITIONS, PROFILES, STATES, main, transition, validateConfig }
