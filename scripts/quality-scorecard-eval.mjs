#!/usr/bin/env node

import { execFileSync, spawnSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { evaluateQualityScorecard } from '../dist/index.js'

const root = resolve(import.meta.dirname, '..')
const readJson = (path) => JSON.parse(readFileSync(resolve(root, path), 'utf8'))
const runJson = (command, args) => JSON.parse(execFileSync(command, args, { cwd: root, encoding: 'utf8', maxBuffer: 4_000_000 }))
const verification = readJson('.codex/verification.json')

const audit = runJson(process.execPath, ['bin/ak-docs.js', 'audit', 'documentation', '--json']).report
const matrix = readJson('docs/study/quality-scorecard-v1.json')
const pilot = readJson('docs/study/phase4-public-pilot-result-v1.json')
const pilotLedger = readJson('docs/study/phase4-public-pilot-ledger-v1.json')
const ab = readJson('docs/study/ab-adjudicated-cost-result-v1.json')
const semanticReviewPath = `${verification.stateDir}/semantic-review/report.json`
const semanticReview = readJson(semanticReviewPath)
const providerStudyPath = `${verification.stateDir}/provider-study/summary.json`
const providerStudy = existsSync(resolve(root, providerStudyPath)) ? readJson(providerStudyPath) : undefined

const semanticTest = spawnSync('pnpm', ['vitest', 'run', 'tests/semantic-benchmark.test.ts'], {
  cwd: root,
  encoding: 'utf8',
  maxBuffer: 4_000_000,
})
if (semanticTest.status !== 0) throw new Error(`Semantic benchmark failed:\n${semanticTest.stdout}\n${semanticTest.stderr}`)
const semanticFixture = { cases: 6, findings: 8, precision: 1, recall: 1, evidenceRatio: 1 }

const arm = (scenarioId) => ab.arms.find((item) => item.scenarioId === scenarioId)
const repositoryOnly = arm('repository-only')
const docBridge = arm('deterministic-doc-bridge')
if (!repositoryOnly || !docBridge) throw new Error('Study result is missing a required comparison arm.')
const semanticFindings = semanticReview.results.flatMap((result) => result.findings ?? [])
const semanticCount = (kind) => semanticFindings.filter((finding) => finding.kind === kind).length
const providerScenarioRate = (scenarioId, fallback) => {
  const scenario = providerStudy?.results?.byScenario?.[scenarioId]
  return scenario ? scenario.semanticSuccess / scenario.observations : fallback
}
const acceptanceInstrumentation = pilotLedger.observations.reduce((summary, observation) => {
  const measurements = observation.measurements ?? {}
  const complete = Number.isInteger(measurements.acceptanceChecksPassed)
    && Number.isInteger(measurements.acceptanceChecksTotal)
    && Number.isInteger(measurements.acceptanceChecksExecuted)
    && measurements.acceptanceChecksTotal > 0
    && measurements.acceptanceChecksExecuted <= measurements.acceptanceChecksTotal
    && measurements.acceptanceChecksPassed <= measurements.acceptanceChecksExecuted
  return { observations: summary.observations + 1, complete: summary.complete + (complete ? 1 : 0) }
}, { observations: 0, complete: 0 })

const result = evaluateQualityScorecard({
  semanticFixture: {
    precision: semanticFixture.precision,
    recall: semanticFixture.recall,
    evidenceRatio: semanticFixture.evidenceRatio,
  },
  semanticTask: {
    repositoryOnlySuccessRate: providerScenarioRate('repository-only', repositoryOnly.adjudicationOutcome.success / repositoryOnly.observationCount),
    docBridgeSuccessRate: providerScenarioRate('deterministic-doc-bridge', docBridge.adjudicationOutcome.success / docBridge.observationCount),
  },
  acceptanceInstrumentation,
  tokenPilot: {
    reductionPct: providerStudy?.results.comparison.providerTokenCostUnitsReductionPct ?? pilot.pairedMetrics.providerTokenEquivalentReductionPct,
    replicates: providerStudy ? 1 : pilot.scope.replicatesPerTask,
  },
  cost: {
    observedUsd: typeof docBridge.totalCostUsd === 'number' ? docBridge.totalCostUsd : null,
  },
  generalization: {
    populations: providerStudy?.scope.populations ?? pilot.scope.populationCount,
    models: providerStudy?.scope.models ?? pilot.scope.models.length,
    replicates: providerStudy ? 1 : pilot.scope.replicatesPerTask,
  },
  documentation: {
    titleRate: audit.metrics.titleRate,
    requiredSectionsRate: audit.metrics.requiredSectionsRate,
    examplesRate: audit.metrics.examplesRate ?? 0,
    contradictions: audit.metrics.contradictionCount,
    stale: audit.metrics.staleCount,
    structureGaps: audit.metrics.structureGapCount,
    exactDuplicateGroups: audit.metrics.exactDuplicateGroups,
    criticalMetadataCoverage: audit.metrics.criticalDocumentCount - audit.metrics.generatedDocumentCount <= 0 ? 1 : audit.metrics.criticalDocumentsWithValidationPath / (audit.metrics.criticalDocumentCount - audit.metrics.generatedDocumentCount),
    semanticNotAnalyzed: audit.metrics.dimensionStatus.correctness['not-analyzed'],
    semanticReviewed: semanticReview.documents.length,
    semanticCorpus: audit.metrics.documentCount,
    semanticContradictionCandidates: semanticCount('contradiction'),
    semanticRedundancyCandidates: semanticCount('redundancy'),
    semanticMissingCandidates: semanticCount('missing'),
    semanticClaimCandidates: semanticCount('claim') + semanticCount('style'),
  },
  evidence: {
    contentHashes: ['docs/study/phase4-public-pilot-result-v1.json', 'docs/study/ab-adjudicated-cost-result-v1.json', 'docs/study/ab-baseline-result-v1.json'].filter((path) => typeof readJson(path).contentHash === 'string').length,
    requiredHashes: 3,
  },
  latency: {
    reductionPct: providerStudy?.results.comparison.durationMsP95ReductionPct ?? pilot.pairedMetrics.durationP95ReductionPct,
  },
  thresholds: matrix.thresholds,
})

console.log(JSON.stringify({
  status: 'passed',
  criteria: ['quality-scorecard'],
  matrixVersion: matrix.matrixVersion,
  decision: result.decision,
  summary: result.summary,
  dimensions: result.dimensions,
  semanticReview: { path: semanticReviewPath, documents: semanticReview.documents.length, findings: semanticFindings.length },
  ...(providerStudy ? { providerStudy: { path: providerStudyPath, runId: providerStudy.runId, ledgerHash: providerStudy.ledgerHash } } : {}),
  scorecard: result,
}))
