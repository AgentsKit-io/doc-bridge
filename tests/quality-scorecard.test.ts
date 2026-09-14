import { describe, expect, it } from 'vitest'

import { evaluateQualityScorecard, type QualityScorecardInput } from '../src/study/quality-scorecard.js'

const input = (overrides: Partial<QualityScorecardInput> = {}): QualityScorecardInput => ({
  semanticFixture: { precision: 1, recall: 1, evidenceRatio: 1 },
  semanticTask: { repositoryOnlySuccessRate: 1, docBridgeSuccessRate: 1 },
  acceptanceInstrumentation: { observations: 16, complete: 16 },
  tokenPilot: { reductionPct: 5, replicates: 3 },
  cost: { observedUsd: 10 },
  generalization: { populations: 3, models: 2, replicates: 3 },
  documentation: { titleRate: 1, requiredSectionsRate: 1, examplesRate: 1, contradictions: 0, stale: 0, structureGaps: 0, exactDuplicateGroups: 0, criticalMetadataCoverage: 1, semanticNotAnalyzed: 0, semanticReviewed: 10, semanticCorpus: 10, semanticContradictionCandidates: 0, semanticRedundancyCandidates: 0, semanticMissingCandidates: 0, semanticClaimCandidates: 0 },
  evidence: { contentHashes: 3, requiredHashes: 3 },
  latency: { reductionPct: 5 },
  thresholds: { fixturePrecision: 1, fixtureRecall: 1, fixtureEvidenceRatio: 1, taskSuccessRate: 0.95, tokenReductionPct: 0, tokenReplicates: 3, populationCount: 3, modelCount: 2, generalizationReplicates: 3, documentationRate: 0.95, examplesRate: 0.8, criticalMetadataCoverage: 1, semanticNotAnalyzedMaximum: 0, semanticReviewCoverage: 1, acceptanceInstrumentationCoverage: 1, latencyReductionPct: 0 },
  ...overrides,
})

describe('quality scorecard', () => {
  it('does not promote the current inconclusive study to ready', () => {
    const result = evaluateQualityScorecard(input({
      semanticTask: { repositoryOnlySuccessRate: 0, docBridgeSuccessRate: 0 },
      acceptanceInstrumentation: { observations: 16, complete: 16 },
      tokenPilot: { reductionPct: 3.1525, replicates: 1 },
      cost: { observedUsd: null },
      generalization: { populations: 1, models: 2, replicates: 1 },
      documentation: { titleRate: 1, requiredSectionsRate: 1, examplesRate: 0.54, contradictions: 0, stale: 0, structureGaps: 0, exactDuplicateGroups: 0, criticalMetadataCoverage: 1, semanticNotAnalyzed: 99, semanticReviewed: 10, semanticCorpus: 99, semanticContradictionCandidates: 0, semanticRedundancyCandidates: 0, semanticMissingCandidates: 0, semanticClaimCandidates: 0 },
    }))

    expect(result.decision).toBe('not-ready')
    expect(result.summary.fail).toBeGreaterThan(0)
    expect(result.criteria.find((criterion) => criterion.id === 'currency-cost')?.status).toBe('not-analyzed')
    expect(result.criteria.find((criterion) => criterion.id === 'token-reduction-consistent')?.status).toBe('fail')
    expect(result.criteria.find((criterion) => criterion.id === 'documentation-example-coverage')?.status).toBe('partial')
    expect(result.criteria.find((criterion) => criterion.id === 'documentation-semantic-review-coverage')?.status).toBe('partial')
  })

  it('requires every required criterion before promoting the matrix to ready', () => {
    expect(evaluateQualityScorecard(input()).decision).toBe('ready')
    expect(evaluateQualityScorecard(input({ evidence: { contentHashes: 2, requiredHashes: 3 } })).decision).toBe('not-ready')
  })

  it('fails closed when semantic candidates or duplicate groups remain', () => {
    const result = evaluateQualityScorecard(input({
      documentation: { ...input().documentation, exactDuplicateGroups: 1, semanticClaimCandidates: 1 },
    }))
    expect(result.decision).toBe('not-ready')
    expect(result.criteria.find((criterion) => criterion.id === 'documentation-exact-duplicates')?.status).toBe('fail')
    expect(result.criteria.find((criterion) => criterion.id === 'documentation-semantic-candidates')?.status).toBe('fail')
  })

  it('fails closed when acceptance execution is not fully instrumented', () => {
    const result = evaluateQualityScorecard(input({ acceptanceInstrumentation: { observations: 16, complete: 15 } }))
    expect(result.decision).toBe('not-ready')
    expect(result.criteria.find((criterion) => criterion.id === 'acceptance-instrumentation')?.status).toBe('fail')
  })
})
