import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import assert from 'node:assert/strict'

import { LEGAL_TRANSITIONS, main, transition, validateConfig } from './verification-harness.mjs'

const base = (overrides = {}) => validateConfig({
  schemaVersion: 1,
  project: 'fixture',
  contract: { intent: 'Validate the fixture', outcomes: [{ id: 'fixture', statement: 'The fixture checks pass.', checks: ['logic', 'docs'] }] },
  profile: 'strict',
  surfaces: { logic: true, endpoint: false, database: false, cli: false, mcp: false, ui: false, docs: true },
  checks: [
    { id: 'logic', category: 'logic', command: 'node -e "process.exit(0)"' },
    { id: 'docs', category: 'docs', command: 'node -e "process.exit(0)"' },
  ],
  tracking: { required: false, reason: 'fixture only' },
  ...overrides,
}, join(mkdtempSync(join(tmpdir(), 'ak-verify-test-')), '.codex/verification.json'))

test('accepts a strict contract with explicit non-applicable surfaces', () => {
  assert.equal(base().profile, 'strict')
})

test('uses the low-friction default profile when profile is omitted', () => {
  assert.equal(base({ profile: undefined }).profile, 'default')
})

test('requires every surface and enterprise gates when using enterprise profile', () => {
  const enterprise = {
    schemaVersion: 1,
    project: 'enterprise-fixture',
    profile: 'enterprise',
    surfaces: { logic: true, endpoint: false, database: false, cli: false, mcp: false, ui: false, docs: false },
    measurement: { required: true, checkId: 'metrics', baseline: 'baseline.json' },
    tracking: { required: true, authorization: 'ask', target: 'github:org/project#1' },
    checks: [
      { id: 'logic', category: 'logic', command: 'true' },
      { id: 'metrics', category: 'custom', command: 'true' },
    ],
    contract: { intent: 'Validate', outcomes: [{ id: 'logic', statement: 'Logic is validated.', checks: ['logic'] }] },
  }
  assert.equal(validateConfig(enterprise, 'verification.json').profile, 'enterprise')
  assert.throws(() => validateConfig({ ...enterprise, surfaces: { logic: true } }, 'verification.json'), /requires surfaces\.endpoint/)
  assert.throws(() => validateConfig({ ...enterprise, measurement: { required: false } }, 'verification.json'), /requires measurement/)
  assert.throws(() => validateConfig({ ...enterprise, tracking: { required: false, reason: 'fixture' } }, 'verification.json'), /requires tracking/)
})

test('rejects unknown contract fields before a run can mutate artifacts', () => {
  assert.throws(() => base({ unknown: true }), /verification config\.unknown/)
  assert.throws(() => base({ contract: { ...base().contract, extra: true } }), /contract\.extra/)
})

test('enforces the legal state transition graph', () => {
  assert.deepEqual(LEGAL_TRANSITIONS.PLANNED, ['CLARIFYING', 'VERIFYING', 'BLOCKED', 'FAILED'])
  const run = { state: 'PLANNED', transitions: [] }
  assert.equal(transition(run, 'VERIFYING').state, 'VERIFYING')
  assert.throws(() => transition(run, 'COMPLETE'), /Illegal verification transition/)
})

test('requires real execution for integration surfaces', () => {
  assert.throws(() => base({ surfaces: { logic: true, endpoint: true, database: false, cli: false, mcp: false, ui: false, docs: true }, checks: [{ id: 'logic', category: 'logic', command: 'true' }, { id: 'endpoint', category: 'endpoint', command: 'true' }, { id: 'docs', category: 'docs', command: 'true' }] }), /execution: "real"/)
})

test('requires explicit exemptions for non-strict profiles', () => {
  assert.throws(() => base({ profile: 'poc' }), /explicit exemptions/)
})

test('requires every outcome to map to known checks', () => {
  assert.throws(() => base({ contract: { intent: 'Validate', outcomes: [{ id: 'unmapped', statement: 'Missing evidence', checks: ['missing'] }] } }), /unknown check/)
})

test('does not allow an outcome to depend on an optional check', () => {
  assert.throws(() => base({
    checks: [
      { id: 'logic', category: 'logic', command: 'true' },
      { id: 'docs', category: 'docs', command: 'true' },
      { id: 'optional', category: 'custom', command: 'true', required: false },
    ],
    contract: { intent: 'Validate', outcomes: [{ id: 'optional', statement: 'Optional evidence must not gate completion.', checks: ['optional'] }] },
  }), /non-required check/)
})

test('requires a reason when tracking is disabled', () => {
  assert.throws(() => base({ tracking: { required: false } }), /tracking.reason/)
})

test('resolves a contract stored below the project root', () => {
  const configPath = join(mkdtempSync(join(tmpdir(), 'ak-verify-root-')), '.codex/verification.json')
  const config = validateConfig({
    schemaVersion: 1,
    project: 'fixture',
    root: '..',
    profile: 'strict',
    contract: { intent: 'Validate the fixture', outcomes: [{ id: 'logic', statement: 'The logic check passes.', checks: ['logic'] }] },
    checks: [{ id: 'logic', category: 'logic', command: 'true' }],
    tracking: { required: false, reason: 'fixture only' },
  }, configPath)
  assert.equal(config.root, '..')
})

test('accepts portable harness extensions and honors its configured state directory', async () => {
  const root = mkdtempSync(join(tmpdir(), 'ak-verify-extensions-'))
  const configDir = join(root, '.codex')
  mkdirSync(configDir)
  const configPath = join(configDir, 'verification.json')
  writeFileSync(configPath, JSON.stringify({
    schemaVersion: 1,
    project: 'portable-harness-fixture',
    root: '..',
    stateDir: '.codex/verification/harness',
    profile: 'strict',
    budget: { maxDurationMs: 1000 },
    benchmark: { suiteId: 'fixture-suite', taskId: 'fixture-task', mode: 'harness' },
    contract: {
      intent: 'Validate the portable harness contract.',
      scope: { inScope: ['fixture'], outOfScope: ['production'] },
      ambiguities: [],
      outcomes: [{ id: 'fixture', statement: 'The fixture check passes.', checks: ['logic'] }],
    },
    checks: [{ id: 'logic', category: 'logic', evidence: 'structured', command: 'true' }],
    tracking: { required: false, reason: 'fixture only' },
  }))
  const config = validateConfig(JSON.parse(readFileSync(configPath, 'utf8')), configPath)
  assert.equal(config.stateDir, '.codex/verification/harness')
  assert.equal(config.contract.scope.inScope[0], 'fixture')
  assert.equal(config.benchmark.taskId, 'fixture-task')
  assert.equal(await main(['run', '--config', configPath, '--json']), 0)
  assert.equal(existsSync(join(root, '.codex/verification/harness/latest.json')), true)
})

test('runs an idempotent complete verification and exposes status', async () => {
  const root = mkdtempSync(join(tmpdir(), 'ak-verify-run-'))
  const configDir = join(root, '.codex')
  mkdirSync(configDir)
  const configPath = join(configDir, 'verification.json')
  writeFileSync(configPath, JSON.stringify({
    schemaVersion: 1,
    project: 'fixture',
    root: '..',
    profile: 'strict',
    contract: { intent: 'Validate the fixture', outcomes: [{ id: 'logic', statement: 'The logic check passes.', checks: ['logic'] }] },
    checks: [{ id: 'logic', category: 'logic', command: 'node -e "process.exit(0)"' }],
    tracking: { required: false, reason: 'fixture only' },
  }))
  assert.equal(await main(['run', '--config', configPath, '--json']), 0)
  const first = JSON.parse(readFileSync(join(root, '.codex/verification/latest.json'), 'utf8'))
  assert.equal(await main(['run', '--config', configPath, '--json']), 0)
  const second = JSON.parse(readFileSync(join(root, '.codex/verification/latest.json'), 'utf8'))
  assert.equal(second.runId, first.runId)
  const completeRun = JSON.parse(readFileSync(join(root, first.path), 'utf8'))
  assert.equal(completeRun.outcomes[0].status, 'passed')
  assert.equal(completeRun.evidenceReferences[0].checkId, 'logic')
  assert.equal(completeRun.contractHash.length, 64)
  assert.equal(completeRun.outputHash.length, 64)
  assert.equal(await main(['status', '--config', configPath, '--json']), 0)
})

test('replaces a baseline only through the explicit audited command', async () => {
  const root = mkdtempSync(join(tmpdir(), 'ak-verify-baseline-'))
  const configDir = join(root, '.codex')
  const baselineDir = join(root, 'benchmarks')
  mkdirSync(configDir)
  mkdirSync(baselineDir)
  const configPath = join(configDir, 'verification.json')
  writeFileSync(join(baselineDir, 'new.json'), JSON.stringify({ version: 2, metric: 10 }))
  writeFileSync(configPath, JSON.stringify({
    schemaVersion: 1,
    project: 'baseline-fixture',
    root: '..',
    profile: 'strict',
    contract: { intent: 'Validate the baseline fixture', outcomes: [{ id: 'metrics', statement: 'Metrics exist.', checks: ['metrics'] }] },
    surfaces: { logic: false, endpoint: false, database: false, cli: false, mcp: false, ui: false, docs: false },
    measurement: { required: true, checkId: 'metrics', baseline: 'benchmarks/baseline.json' },
    checks: [{ id: 'metrics', category: 'custom', command: 'true' }],
    tracking: { required: false, reason: 'fixture only' },
  }))
  assert.equal(await main(['baseline', 'replace', 'benchmarks/new.json', 'approved', '--by', 'human', '--config', configPath, '--json']), 0)
  assert.deepEqual(JSON.parse(readFileSync(join(baselineDir, 'baseline.json'), 'utf8')), { version: 2, metric: 10 })
  assert.equal(existsSync(join(root, '.codex/verification/baseline-audit.jsonl')), true)
})

test('fails closed until explicit UI approval is recorded', async () => {
  const root = mkdtempSync(join(tmpdir(), 'ak-verify-ui-'))
  const configDir = join(root, '.codex')
  mkdirSync(configDir)
  const screenshotPath = join(root, 'ui.png')
  writeFileSync(screenshotPath, 'browser screenshot')
  const screenshotHash = createHash('sha256').update(readFileSync(screenshotPath)).digest('hex')
  const configPath = join(configDir, 'verification.json')
  writeFileSync(configPath, JSON.stringify({
    schemaVersion: 1,
    project: 'ui-fixture',
    root: '..',
    profile: 'strict',
    contract: { intent: 'Validate the UI fixture', outcomes: [{ id: 'ui', statement: 'The UI check awaits approval.', checks: ['logic', 'ui'] }] },
    surfaces: { logic: true, ui: true },
    checks: [
      { id: 'logic', category: 'logic', command: 'true' },
      { id: 'ui', category: 'ui', execution: 'real', capabilities: ['real-browser', 'screenshot'], command: `node -e "console.log(JSON.stringify({status:'pending-human-review',capability:'real-browser',artifacts:[{type:'screenshot',path:'ui.png',sha256:'${screenshotHash}',viewport:'390x844'}],criteria:{ui:{status:'passed'}}}))"` },
    ],
    tracking: { required: false, reason: 'fixture only' },
  }))
  assert.equal(await main(['run', '--config', configPath, '--json']), 0)
  const latestPath = join(root, '.codex/verification/latest.json')
  const latest = JSON.parse(readFileSync(latestPath, 'utf8'))
  const run = JSON.parse(readFileSync(join(root, latest.path), 'utf8'))
  assert.equal(run.state, 'AWAITING_HUMAN_APPROVAL')
  assert.equal(await main(['approve', run.runId, 'approved', '--config', configPath, '--by', 'test']), 0)
  const approvedLatest = JSON.parse(readFileSync(latestPath, 'utf8'))
  const approvedRun = JSON.parse(readFileSync(join(root, approvedLatest.path), 'utf8'))
  assert.equal(approvedRun.state, 'COMPLETE')
  assert.equal(approvedRun.outcomes[0].status, 'passed')
})

test('rejects placeholder UI evidence without browser artifacts', async () => {
  const root = mkdtempSync(join(tmpdir(), 'ak-verify-pending-ui-'))
  const configDir = join(root, '.codex')
  mkdirSync(configDir)
  const configPath = join(configDir, 'verification.json')
  writeFileSync(configPath, JSON.stringify({
    schemaVersion: 1,
    project: 'pending-ui-fixture',
    root: '..',
    profile: 'strict',
    contract: { intent: 'Validate the pending UI fixture', outcomes: [{ id: 'ui', statement: 'The UI check awaits approval.', checks: ['logic', 'ui'] }] },
    surfaces: { logic: true, ui: true },
    checks: [
      { id: 'logic', category: 'logic', command: 'true' },
      { id: 'ui', category: 'ui', execution: 'real', capabilities: ['real-browser', 'screenshot'], command: 'node -e "console.log(JSON.stringify({status: \'pending-human-review\'}))"' },
    ],
    tracking: { required: false, reason: 'fixture only' },
  }))
  assert.equal(await main(['run', '--config', configPath, '--json']), 1)
  const latest = JSON.parse(readFileSync(join(root, '.codex/verification/latest.json'), 'utf8'))
  const run = JSON.parse(readFileSync(join(root, latest.path), 'utf8'))
  assert.equal(run.state, 'BLOCKED')
  assert.equal(run.checks.find((check) => check.id === 'ui').status, 'failed')
  assert.match(run.checks.find((check) => check.id === 'ui').verification.failures.join(' '), /screenshot artifacts/)
})

test('requires browser and screenshot capabilities for UI checks', () => {
  assert.throws(() => base({
    surfaces: { logic: true, ui: true, docs: true },
    checks: [
      { id: 'logic', category: 'logic', command: 'true' },
      { id: 'docs', category: 'docs', command: 'true' },
      { id: 'ui', category: 'ui', execution: 'real', command: 'true' },
    ],
  }), /requires capability "real-browser"/)
})

test('blocks when a check reports structured failure even with exit code zero', async () => {
  const root = mkdtempSync(join(tmpdir(), 'ak-verify-structured-failure-'))
  const configDir = join(root, '.codex')
  mkdirSync(configDir)
  const configPath = join(configDir, 'verification.json')
  writeFileSync(configPath, JSON.stringify({
    schemaVersion: 1,
    project: 'structured-failure-fixture',
    root: '..',
    profile: 'strict',
    contract: { intent: 'Validate the failure fixture', outcomes: [{ id: 'logic', statement: 'The logic check fails closed.', checks: ['logic'] }] },
    surfaces: { logic: true },
    checks: [{ id: 'logic', category: 'logic', command: 'node -e "console.log(JSON.stringify({status: \'failed\', failures: [\'bad evidence\']}))"' }],
    tracking: { required: false, reason: 'fixture only' },
  }))
  assert.equal(await main(['run', '--config', configPath, '--json']), 1)
  const latest = JSON.parse(readFileSync(join(root, '.codex/verification/latest.json'), 'utf8'))
  const run = JSON.parse(readFileSync(join(root, latest.path), 'utf8'))
  assert.equal(run.state, 'BLOCKED')
  assert.equal(run.checks[0].status, 'failed')
  assert.equal(run.checks[0].verificationStatus, 'failed')
})

test('blocks when required measurement evidence reports a regression', async () => {
  const root = mkdtempSync(join(tmpdir(), 'ak-verify-metrics-'))
  const configDir = join(root, '.codex')
  mkdirSync(configDir)
  const configPath = join(configDir, 'verification.json')
  writeFileSync(configPath, JSON.stringify({
    schemaVersion: 1,
    project: 'metrics-fixture',
    root: '..',
    profile: 'strict',
    contract: { intent: 'Validate measured efficiency', outcomes: [{ id: 'metrics', statement: 'The benchmark has no regressions.', checks: ['metrics'] }] },
    surfaces: { logic: false, endpoint: false, database: false, cli: false, mcp: false, ui: false, docs: false },
    measurement: { required: true, checkId: 'metrics', baseline: '.doc-bridge/benchmarks/baseline.json' },
    checks: [{ id: 'metrics', category: 'custom', command: 'node -e "console.log(JSON.stringify({status: \'passed\', metrics: {\'pipeline.totalMs\': 10}, baselineHash: \'a\'.repeat(64), regressions: [\'pipeline.totalMs regressed\']}))"' }],
    tracking: { required: false, reason: 'fixture only' },
  }))
  assert.equal(await main(['run', '--config', configPath, '--json']), 1)
  const latest = JSON.parse(readFileSync(join(root, '.codex/verification/latest.json'), 'utf8'))
  const run = JSON.parse(readFileSync(join(root, latest.path), 'utf8'))
  assert.equal(run.state, 'BLOCKED')
  assert.equal(run.outcomes[0].status, 'failed')
  assert.match(run.checks[0].verification.failures.join(' '), /regressions detected/)
})
