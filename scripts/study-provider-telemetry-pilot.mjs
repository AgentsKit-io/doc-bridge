#!/usr/bin/env node

import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdirSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import {
  createControlledStudyRunPlan,
  createStudyProviderCliConfig,
  createStudyRepositoryConfig,
  measureProviderToolTelemetry,
  parseControlledStudyLedger,
  parseStudyTaskSuite,
  runControlledStudy,
} from '../dist/index.js'

const root = resolve(import.meta.dirname, '..')
const outputDir = resolve(root, '.codex/verification/tmp/provider-telemetry-pilot')
const ledgerPath = resolve(outputDir, 'ledger.json')
const dryRun = process.argv.includes('--dry-run')
const readJson = (path) => JSON.parse(readFileSync(resolve(root, path), 'utf8'))
const sha = (value) => createHash('sha256').update(value, 'utf8').digest('hex')

const historicalPlan = readJson('docs/study/phase4-public-pilot-run-plan-v1.json')
const suite = parseStudyTaskSuite(readJson('docs/study/phase4-public-pilot-task-suite-v1.json'))
const { contentHash: _planHash, contentHashAlgo: _planHashAlgo, ...planPayload } = historicalPlan
const providerConfig = createStudyProviderCliConfig({
  type: 'study-provider-cli-config',
  schemaVersion: 1,
  configVersion: 'phase5-provider-telemetry-v1',
  providers: historicalPlan.models.map((model) => ({
    modelId: model.id,
    scenarioIds: ['repository-only', 'deterministic-doc-bridge'],
    command: resolve(root, 'scripts/study-codex-provider.mjs'),
    args: ['--model', model.model],
    envAllowlist: ['CODEX_HOME'],
    providerNetwork: true,
    maxInputBytes: 1_000_000,
    maxOutputBytes: 256_000,
  })),
})
const repositoryConfig = createStudyRepositoryConfig({
  type: 'controlled-study-repository-config',
  schemaVersion: 1,
  configVersion: 'phase5-provider-telemetry-v1',
  repositories: [{ id: 'public-fixture', root: resolve(root, 'tests/fixtures/sample-project') }],
})
const plan = createControlledStudyRunPlan({
  ...planPayload,
  planVersion: 'phase5-provider-telemetry-v1',
  sourceRevisionHash: sha(execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim()),
  configurationHash: providerConfig.contentHash,
  sampling: { strategy: 'pairwise-task-strata', sampleSize: 8, scenarioIds: ['repository-only', 'deterministic-doc-bridge'] },
  budget: { ...historicalPlan.budget, maxTokens: 96_000, maxRuntimeMs: 600_000 },
  runId: 'phase5-provider-telemetry-pilot-01',
})

mkdirSync(outputDir, { recursive: true })
const run = await runControlledStudy({
  plan,
  suite,
  providers: providerConfig,
  repositories: repositoryConfig,
  ledgerPath,
  round: 'phase5-provider-telemetry-v1',
  dryRun,
})

if (dryRun) {
  console.log(JSON.stringify({ status: 'dry-run', criteria: ['provider-context-pilot'], runId: run.runId, planned: run.planned }))
  process.exit(0)
}

const ledger = parseControlledStudyLedger(readJson('.codex/verification/tmp/provider-telemetry-pilot/ledger.json'))
const observations = ledger.observations.filter((observation) => observation.runId === plan.runId)
const completed = observations.filter((observation) => observation.execution.status === 'completed')
const telemetry = completed.map((observation) => observation.measurements ?? {})
const missingTelemetry = telemetry.filter((measurement) => measurement.observedContextBytes === undefined).length
if (missingTelemetry > 0) throw new Error(`Provider telemetry missing from ${missingTelemetry} completed observations.`)

const sum = (name) => telemetry.reduce((total, measurement) => total + (measurement[name] ?? 0), 0)
const byScenario = Object.fromEntries(['repository-only', 'deterministic-doc-bridge'].map((scenarioId) => {
  const values = telemetry.filter((_measurement, index) => completed[index]?.scenario.id === scenarioId)
  return [scenarioId, {
    observations: values.length,
    providerTokens: completed.filter((observation) => observation.scenario.id === scenarioId).reduce((total, observation) => total + (observation.measurements?.providerTokenCostUnits ?? 0), 0),
    observedContextBytes: values.reduce((total, measurement) => total + (measurement.observedContextBytes ?? 0), 0),
  }]
}))

console.log(JSON.stringify({
  status: 'passed',
  criteria: ['provider-context-pilot'],
  runId: run.runId,
  planned: run.planned,
  executed: run.executed,
  completed: completed.length,
  failed: observations.length - completed.length,
  providerTokenObservations: completed.filter((observation) => observation.measurements?.providerTokenCostUnits !== undefined).length,
  observedToolEvents: sum('observedToolEventCount'),
  observedToolInputBytes: sum('observedToolInputBytes'),
  observedToolOutputBytes: sum('observedToolOutputBytes'),
  observedContextBytes: sum('observedContextBytes'),
  byScenario,
}))
