export type ScorecardStatus = 'pass' | 'partial' | 'not-analyzed' | 'fail'

export type ScorecardCriterion = {
  readonly id: string
  readonly dimension: string
  readonly status: ScorecardStatus
  readonly observed: number | null
  readonly threshold: number | null
  readonly unit: string
  readonly required: boolean
  readonly evidence: readonly string[]
  readonly reason: string
}

export type ScorecardDimension = {
  readonly id: string
  readonly status: ScorecardStatus
  readonly criteria: readonly string[]
}

export type QualityScorecard = {
  readonly type: 'doc-bridge-quality-scorecard'
  readonly schemaVersion: 1
  readonly decision: 'ready' | 'not-ready'
  readonly criteria: readonly ScorecardCriterion[]
  readonly dimensions: readonly ScorecardDimension[]
  readonly summary: {
    readonly pass: number
    readonly partial: number
    readonly notAnalyzed: number
    readonly fail: number
  }
}

export type QualityScorecardInput = {
  readonly semanticFixture: {
    readonly precision: number
    readonly recall: number
    readonly evidenceRatio: number
  }
  readonly semanticTask: {
    readonly repositoryOnlySuccessRate: number
    readonly docBridgeSuccessRate: number
  }
  readonly acceptanceInstrumentation: {
    readonly observations: number
    readonly complete: number
  }
  readonly tokenPilot: {
    readonly reductionPct: number
    readonly replicates: number
  }
  readonly cost: {
    readonly observedUsd: number | null
  }
  readonly generalization: {
    readonly populations: number
    readonly models: number
    readonly replicates: number
  }
  readonly documentation: {
    readonly titleRate: number
    readonly requiredSectionsRate: number
    readonly examplesRate: number
    readonly contradictions: number
    readonly stale: number
    readonly structureGaps: number
    readonly exactDuplicateGroups: number
    readonly criticalMetadataCoverage: number
    readonly semanticNotAnalyzed: number
    readonly semanticReviewed: number
    readonly semanticCorpus: number
    readonly semanticContradictionCandidates: number
    readonly semanticRedundancyCandidates: number
    readonly semanticMissingCandidates: number
    readonly semanticClaimCandidates: number
  }
  readonly evidence: {
    readonly contentHashes: number
    readonly requiredHashes: number
  }
  readonly latency: {
    readonly reductionPct: number
  }
  readonly thresholds: {
    readonly fixturePrecision: number
    readonly fixtureRecall: number
    readonly fixtureEvidenceRatio: number
    readonly taskSuccessRate: number
    readonly tokenReductionPct: number
    readonly tokenReplicates: number
    readonly populationCount: number
    readonly modelCount: number
    readonly generalizationReplicates: number
    readonly documentationRate: number
    readonly examplesRate: number
    readonly criticalMetadataCoverage: number
    readonly semanticNotAnalyzedMaximum: number
    readonly semanticReviewCoverage: number
    readonly acceptanceInstrumentationCoverage: number
    readonly latencyReductionPct: number
  }
}

const criterion = (
  id: string,
  dimension: string,
  status: ScorecardStatus,
  observed: number | null,
  threshold: number | null,
  unit: string,
  required: boolean,
  evidence: readonly string[],
  reason: string,
): ScorecardCriterion => ({ id, dimension, status, observed, threshold, unit, required, evidence, reason })

const dimensionStatus = (criteria: readonly ScorecardCriterion[]): ScorecardStatus => {
  if (criteria.some((item) => item.status === 'fail')) return 'fail'
  if (criteria.some((item) => item.status === 'not-analyzed')) return 'not-analyzed'
  if (criteria.some((item) => item.status === 'partial')) return 'partial'
  return 'pass'
}

export const evaluateQualityScorecard = (input: QualityScorecardInput): QualityScorecard => {
  const t = input.thresholds
  const criteria = [
    criterion('semantic-fixture-classification', 'semantic-correctness', input.semanticFixture.precision >= t.fixturePrecision && input.semanticFixture.recall >= t.fixtureRecall && input.semanticFixture.evidenceRatio >= t.fixtureEvidenceRatio ? 'pass' : 'fail', input.semanticFixture.precision, t.fixturePrecision, 'precision', true, ['tests/semantic-benchmark.test.ts'], 'Known structured reconciliation cases meet the fixture threshold.'),
    criterion('semantic-task-correctness', 'semantic-correctness', Math.min(input.semanticTask.repositoryOnlySuccessRate, input.semanticTask.docBridgeSuccessRate) >= t.taskSuccessRate ? 'pass' : 'fail', input.semanticTask.docBridgeSuccessRate, t.taskSuccessRate, 'success-rate', true, ['docs/study/ab-adjudicated-cost-result-v1.json'], 'Independent task adjudication must demonstrate the configured success threshold in both arms.'),
    criterion('acceptance-instrumentation', 'semantic-correctness', input.acceptanceInstrumentation.observations > 0 && input.acceptanceInstrumentation.complete / input.acceptanceInstrumentation.observations >= t.acceptanceInstrumentationCoverage ? 'pass' : 'fail', input.acceptanceInstrumentation.observations > 0 ? input.acceptanceInstrumentation.complete / input.acceptanceInstrumentation.observations : null, t.acceptanceInstrumentationCoverage, 'coverage', true, ['docs/study/phase4-public-pilot-ledger-v1.json', 'src/study/execution.ts'], 'Every study observation must record passed, total, and executed acceptance-check counts; the adjudicator separately blocks passes when execution is incomplete.'),
    criterion('token-reduction-positive', 'token-efficiency', input.tokenPilot.reductionPct >= t.tokenReductionPct ? 'pass' : 'fail', input.tokenPilot.reductionPct, t.tokenReductionPct, 'percent', true, ['docs/study/phase4-public-pilot-result-v1.json'], 'The observed paired token-equivalent delta is positive for the declared pilot.'),
    criterion('token-reduction-consistent', 'token-efficiency', input.tokenPilot.replicates >= t.tokenReplicates ? 'pass' : 'fail', input.tokenPilot.replicates, t.tokenReplicates, 'replicates', true, ['docs/study/phase4-public-pilot-result-v1.json'], 'A single pilot cannot establish consistent reduction; the configured replicate minimum is required.'),
    criterion('currency-cost', 'cost', input.cost.observedUsd === null ? 'not-analyzed' : 'pass', input.cost.observedUsd, 0, 'USD', true, ['docs/study/phase4-public-pilot-result-v1.json'], input.cost.observedUsd === null ? 'Provider pricing or observed USD cost is absent; no financial claim is allowed.' : 'Observed USD cost is available.'),
    criterion('population-generalization', 'generalization', input.generalization.populations >= t.populationCount ? 'pass' : 'fail', input.generalization.populations, t.populationCount, 'populations', true, ['docs/study/phase4-public-pilot-result-v1.json'], 'Enterprise generalization requires multiple independent populations.'),
    criterion('model-generalization', 'generalization', input.generalization.models >= t.modelCount ? 'pass' : 'fail', input.generalization.models, t.modelCount, 'models', true, ['docs/study/phase4-public-pilot-result-v1.json'], 'The minimum model diversity must be present before generalization claims.'),
    criterion('replicate-generalization', 'generalization', input.generalization.replicates >= t.generalizationReplicates ? 'pass' : 'fail', input.generalization.replicates, t.generalizationReplicates, 'replicates', true, ['docs/study/phase4-public-pilot-result-v1.json'], 'Each task needs repeated observations before generalization is promoted.'),
    criterion('documentation-deterministic-quality', 'documentation-quality', input.documentation.titleRate >= t.documentationRate && input.documentation.requiredSectionsRate >= t.documentationRate && input.documentation.contradictions === 0 && input.documentation.stale === 0 && input.documentation.structureGaps === 0 && input.documentation.criticalMetadataCoverage >= t.criticalMetadataCoverage ? 'pass' : 'fail', Math.min(input.documentation.titleRate, input.documentation.requiredSectionsRate, input.documentation.criticalMetadataCoverage), t.documentationRate, 'coverage', true, ['node bin/ak-docs.js audit documentation --json'], 'Structural quality, contradiction, stale-content, and critical metadata gates pass for the declared corpus.'),
    criterion('documentation-example-coverage', 'documentation-quality', input.documentation.examplesRate >= t.examplesRate ? 'pass' : input.documentation.examplesRate > 0 ? 'partial' : 'fail', input.documentation.examplesRate, t.examplesRate, 'coverage', false, ['node bin/ak-docs.js audit documentation --json'], 'Examples are measured as a quality signal; not every document requires an example, so this criterion is advisory until the corpus declares eligibility.'),
    criterion('documentation-exact-duplicates', 'documentation-quality', input.documentation.exactDuplicateGroups === 0 ? 'pass' : 'fail', input.documentation.exactDuplicateGroups, 0, 'groups', true, ['node bin/ak-docs.js audit documentation --json'], 'Exact duplicate documentation groups must be absent.'),
    criterion('documentation-semantic-candidates', 'documentation-quality', input.documentation.semanticContradictionCandidates + input.documentation.semanticRedundancyCandidates + input.documentation.semanticMissingCandidates + input.documentation.semanticClaimCandidates === 0 ? 'pass' : 'fail', input.documentation.semanticContradictionCandidates + input.documentation.semanticRedundancyCandidates + input.documentation.semanticMissingCandidates + input.documentation.semanticClaimCandidates, 0, 'candidates', true, ['semantic-documentation-review', 'semantic-adjudication'], 'Bounded semantic review candidates must be resolved before the reviewed scope is promoted.'),
    criterion('documentation-semantic-review-coverage', 'documentation-quality', input.documentation.semanticCorpus > 0 && input.documentation.semanticReviewed / input.documentation.semanticCorpus >= t.semanticReviewCoverage ? 'pass' : input.documentation.semanticReviewed > 0 ? 'partial' : 'not-analyzed', input.documentation.semanticCorpus > 0 ? input.documentation.semanticReviewed / input.documentation.semanticCorpus : null, t.semanticReviewCoverage, 'coverage', false, ['semantic-documentation-review', 'node bin/ak-docs.js audit documentation --json'], 'Semantic review coverage is reported separately from deterministic checks; bounded review does not prove full-corpus correctness.'),
    criterion('documentation-semantic-coverage', 'documentation-quality', input.documentation.semanticNotAnalyzed <= t.semanticNotAnalyzedMaximum ? 'pass' : 'partial', input.documentation.semanticNotAnalyzed, t.semanticNotAnalyzedMaximum, 'documents', false, ['.codex/verification semantic-documentation-review'], 'Natural-language semantics remain bounded to the configured review scope; unreviewed documents stay visible.'),
    criterion('evidence-reproducibility', 'evidence-quality', input.evidence.contentHashes >= input.evidence.requiredHashes ? 'pass' : 'fail', input.evidence.contentHashes, input.evidence.requiredHashes, 'hashes', true, ['docs/study/*result*.json'], 'All required study artifacts must expose reproducible content hashes.'),
    criterion('latency-improvement', 'agent-efficiency', input.latency.reductionPct >= t.latencyReductionPct ? 'pass' : 'partial', input.latency.reductionPct, t.latencyReductionPct, 'percent', false, ['docs/study/phase4-public-pilot-result-v1.json'], 'Latency is tracked separately from correctness and token cost.'),
  ]

  const dimensions = [...new Set(criteria.map((item) => item.dimension))].map((id) => {
    const items = criteria.filter((item) => item.dimension === id)
    return { id, status: dimensionStatus(items), criteria: items.map((item) => item.id) }
  })
  const summary = {
    pass: criteria.filter((item) => item.status === 'pass').length,
    partial: criteria.filter((item) => item.status === 'partial').length,
    notAnalyzed: criteria.filter((item) => item.status === 'not-analyzed').length,
    fail: criteria.filter((item) => item.status === 'fail').length,
  }
  return {
    type: 'doc-bridge-quality-scorecard',
    schemaVersion: 1,
    decision: criteria.some((item) => item.required && item.status !== 'pass') ? 'not-ready' : 'ready',
    criteria,
    dimensions,
    summary,
  }
}
