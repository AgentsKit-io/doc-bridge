import { z } from 'zod'

import { contentHashForArtifactV1 } from '../index-builder/content-hash.js'
import type { ControlledStudyObservationV1 } from './runner.js'

export const STUDY_METRICS_SCHEMA_VERSION = 1 as const

const RateIntervalSchema = z.object({ low: z.number().min(0).max(1), high: z.number().min(0).max(1) }).strict()
const StudyMetricSetSchema = z.object({
  observationCount: z.number().int().nonnegative(),
  completedRate: z.number().min(0).max(1),
  completedConfidence95: RateIntervalSchema,
  adjudicatedRate: z.number().min(0).max(1),
  successRate: z.number().min(0).max(1).nullable(),
  successConfidence95: RateIntervalSchema.nullable(),
  evidenceCitationRate: z.number().min(0).max(1),
  evidenceQualityRate: z.number().min(0).max(1).nullable(),
  searchHitRate: z.number().min(0).max(1).nullable(),
  acceptanceCheckRate: z.number().min(0).max(1).nullable(),
  errorRate: z.number().min(0).max(1).nullable(),
  safetyRate: z.number().min(0).max(1).nullable(),
  adjudicatedSuccessRate: z.number().min(0).max(1).nullable(),
  documentationFindingCount: z.number().int().nonnegative().nullable(),
  documentationExampleRate: z.number().min(0).max(1).nullable(),
  documentationFreshnessRate: z.number().min(0).max(1).nullable(),
  documentationCorrectnessRate: z.number().min(0).max(1).nullable(),
  documentationCompletenessRate: z.number().min(0).max(1).nullable(),
  documentationClarityRate: z.number().min(0).max(1).nullable(),
  documentationMaintainabilityRate: z.number().min(0).max(1).nullable(),
  providerTokens: z.number().int().nonnegative().nullable(),
  estimatedTokens: z.number().int().nonnegative().nullable(),
  tokensToCorrectAnswerP95: z.number().int().nonnegative().nullable(),
  latencyP95Ms: z.number().int().nonnegative(),
  timeToCorrectAnswerP95Ms: z.number().int().nonnegative().nullable(),
  contextBytesP95: z.number().int().nonnegative(),
  responseBytesP95: z.number().int().nonnegative(),
  averageToolCalls: z.number().nonnegative().nullable(),
  clarificationRate: z.number().min(0).max(1).nullable(),
  reworkRate: z.number().min(0).max(1).nullable(),
  analysisCostUsd: z.number().nonnegative().nullable(),
  agentCostUsd: z.number().nonnegative().nullable(),
  totalCostUsd: z.number().nonnegative().nullable(),
  providerTokenCostUnits: z.number().int().nonnegative().nullable(),
  missingMetrics: z.array(z.string().min(1).max(128)).max(32),
}).strict()

const MetricDeltaSchema = z.object({
  baseline: z.number().nullable(),
  current: z.number().nullable(),
  absoluteChange: z.number().nullable(),
  relativeChange: z.number().nullable(),
}).strict()

const StudyMetricGroupSchema = z.object({
  scope: z.enum(['task', 'repository', 'category', 'difficulty', 'model', 'scenario', 'replicate', 'aggregate']),
  key: z.string().min(1).max(256),
  round: z.string().min(1).max(128),
  metrics: StudyMetricSetSchema,
}).strict()

const StudyMetricComparisonSchema = z.object({
  scope: StudyMetricGroupSchema.shape.scope,
  key: z.string().min(1).max(256),
  baselineRound: z.string().min(1).max(128),
  currentRound: z.string().min(1).max(128),
  baselineSampleSize: z.number().int().nonnegative(),
  currentSampleSize: z.number().int().nonnegative(),
  metrics: z.object({
    completedRate: MetricDeltaSchema,
    successRate: MetricDeltaSchema,
    evidenceCitationRate: MetricDeltaSchema,
    evidenceQualityRate: MetricDeltaSchema,
    searchHitRate: MetricDeltaSchema,
    acceptanceCheckRate: MetricDeltaSchema,
    errorRate: MetricDeltaSchema,
    safetyRate: MetricDeltaSchema,
    adjudicatedSuccessRate: MetricDeltaSchema,
    documentationFindingCount: MetricDeltaSchema,
    documentationExampleRate: MetricDeltaSchema,
    documentationFreshnessRate: MetricDeltaSchema,
    documentationCorrectnessRate: MetricDeltaSchema,
    documentationCompletenessRate: MetricDeltaSchema,
    documentationClarityRate: MetricDeltaSchema,
    documentationMaintainabilityRate: MetricDeltaSchema,
    providerTokens: MetricDeltaSchema,
    estimatedTokens: MetricDeltaSchema,
    tokensToCorrectAnswerP95: MetricDeltaSchema,
    latencyP95Ms: MetricDeltaSchema,
    timeToCorrectAnswerP95Ms: MetricDeltaSchema,
    contextBytesP95: MetricDeltaSchema,
    responseBytesP95: MetricDeltaSchema,
    clarificationRate: MetricDeltaSchema,
    reworkRate: MetricDeltaSchema,
    analysisCostUsd: MetricDeltaSchema,
    agentCostUsd: MetricDeltaSchema,
    totalCostUsd: MetricDeltaSchema,
    providerTokenCostUnits: MetricDeltaSchema,
  }).strict(),
  status: z.enum(['improved', 'unchanged', 'regressed', 'inconclusive', 'not-analyzed']),
  regressions: z.array(z.string().min(1).max(256)).max(32),
  limitations: z.array(z.string().min(1).max(512)).max(16),
}).strict()

export const StudyMetricsReportV1Schema = z.object({
  type: z.literal('controlled-study-metrics'),
  schemaVersion: z.literal(STUDY_METRICS_SCHEMA_VERSION),
  metricsVersion: z.string().min(1).max(64),
  contentHash: z.string().regex(/^[a-f0-9]{64}$/),
  contentHashAlgo: z.literal('sha256-normalized-v1'),
  observationCount: z.number().int().nonnegative(),
  rounds: z.array(z.string().min(1).max(128)).max(256),
  baselineRound: z.string().min(1).max(128).nullable(),
  currentRound: z.string().min(1).max(128).nullable(),
  baselineRunId: z.string().min(1).max(256).nullable().optional(),
  currentRunId: z.string().min(1).max(256).nullable().optional(),
  groups: z.array(StudyMetricGroupSchema).max(100_000),
  comparisons: z.array(StudyMetricComparisonSchema).max(100_000),
  limitations: z.array(z.string().min(1).max(1_024)).max(32),
}).strict()

export type StudyMetricSetV1 = z.infer<typeof StudyMetricSetSchema>
export type StudyMetricGroupV1 = z.infer<typeof StudyMetricGroupSchema>
export type StudyMetricComparisonV1 = z.infer<typeof StudyMetricComparisonSchema>
export type StudyMetricsReportV1 = z.infer<typeof StudyMetricsReportV1Schema>

const ratio = (value: number, total: number): number => total === 0 ? 0 : value / total
const percentile95 = (values: readonly number[]): number => {
  if (!values.length) return 0
  const sorted = [...values].sort((a, b) => a - b)
  return sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * 0.95) - 1)] ?? 0
}
const wilson95 = (successes: number, total: number): { readonly low: number; readonly high: number } => {
  if (total === 0) return { low: 0, high: 0 }
  const z = 1.96
  const p = successes / total
  const denominator = 1 + (z * z) / total
  const center = (p + (z * z) / (2 * total)) / denominator
  const margin = (z / denominator) * Math.sqrt((p * (1 - p) / total) + (z * z) / (4 * total * total))
  return { low: Math.max(0, center - margin), high: Math.min(1, center + margin) }
}

type MetricName = keyof StudyMetricSetV1
type GroupScope = StudyMetricGroupV1['scope']
type GroupValue = { readonly scope: GroupScope; readonly key: string }

const roundOf = (observation: ControlledStudyObservationV1): string => observation.round ?? 'unassigned'
const groupValues = (observation: ControlledStudyObservationV1): readonly GroupValue[] => [
  { scope: 'task', key: observation.task.taskId },
  { scope: 'repository', key: observation.task.repositoryId },
  { scope: 'category', key: observation.task.category },
  { scope: 'difficulty', key: observation.task.difficulty ?? 'unassigned' },
  { scope: 'model', key: observation.model.id },
  { scope: 'scenario', key: observation.scenario.id },
  { scope: 'replicate', key: String(observation.task.replicate) },
  { scope: 'aggregate', key: 'all' },
]

const sumKnown = (values: readonly (number | undefined)[]): number | null => {
  const known = values.filter((value): value is number => value !== undefined)
  return known.length ? known.reduce((sum, value) => sum + value, 0) : null
}
const rateMetric = (values: readonly (number | undefined)[]): number | null => {
  const known = values.filter((value): value is number => value !== undefined)
  return known.length ? ratio(known.filter((value) => value > 0).length, known.length) : null
}

const measurementValues = (observations: readonly ControlledStudyObservationV1[], id: string): readonly number[] => observations.flatMap((observation) => {
  const value = observation.measurements?.[id]
  return value === undefined ? [] : [value]
})
const measurementRate = (observations: readonly ControlledStudyObservationV1[], id: string): number | null => {
  const values = measurementValues(observations, id)
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null
}
const measurementSum = (observations: readonly ControlledStudyObservationV1[], id: string): number | null => {
  const values = measurementValues(observations, id)
  return values.length ? values.reduce((sum, value) => sum + value, 0) : null
}
const measurementRatio = (observations: readonly ControlledStudyObservationV1[], numerator: string, denominator: string): number | null => {
  const values = observations.flatMap((observation) => {
    const numeratorValue = observation.measurements?.[numerator]
    const denominatorValue = observation.measurements?.[denominator]
    return numeratorValue !== undefined && denominatorValue !== undefined && denominatorValue > 0 ? [{ numerator: numeratorValue, denominator: denominatorValue }] : []
  })
  if (!values.length) return null
  return values.reduce((sum, value) => sum + value.numerator, 0) / values.reduce((sum, value) => sum + value.denominator, 0)
}

const metricsFor = (observations: readonly ControlledStudyObservationV1[]): StudyMetricSetV1 => {
  const completed = observations.filter((observation) => observation.execution.status === 'completed').length
  const adjudicated = observations.filter((observation) => observation.adjudication.status !== 'pending').length
  const outcomes = observations.filter((observation) => observation.taskOutcome !== undefined)
  const successes = outcomes.filter((observation) => observation.taskOutcome === 'success').length
  const adjudicatedOutcomes = observations.filter((observation) => observation.adjudication.outcome !== undefined)
  const adjudicatedSuccesses = adjudicatedOutcomes.filter((observation) => observation.adjudication.outcome === 'success').length
  const evidenceQuality = observations.filter((observation) => observation.evidenceQuality !== undefined)
  const highQualityEvidence = evidenceQuality.filter((observation) => observation.evidenceQuality === 'high').length
  const providerTokenValues = observations.map((observation) => observation.execution.tokenMethod === 'provider' && observation.execution.inputTokens !== undefined && observation.execution.outputTokens !== undefined ? observation.execution.inputTokens + observation.execution.outputTokens : undefined)
  const estimatedTokenValues = observations.map((observation) => observation.execution.tokenMethod === 'estimate' && observation.execution.inputTokens !== undefined && observation.execution.outputTokens !== undefined ? observation.execution.inputTokens + observation.execution.outputTokens : undefined)
  const providerTokens = sumKnown(providerTokenValues)
  const estimatedTokens = sumKnown(estimatedTokenValues)
  const knownTools = observations.map((observation) => observation.execution.toolCalls)
  const knownToolValues = knownTools.filter((value): value is number => value !== undefined)
  const knownClarifications = observations.map((observation) => observation.clarificationRequests)
  const knownRework = observations.map((observation) => observation.reworkCount)
  const successfulObservations = observations.filter((observation) => observation.taskOutcome === 'success')
  const successfulTokens = successfulObservations.map((observation) => observation.execution.inputTokens !== undefined && observation.execution.outputTokens !== undefined ? observation.execution.inputTokens + observation.execution.outputTokens : undefined).filter((value): value is number => value !== undefined)
  const successfulDurations = successfulObservations.map((observation) => observation.execution.durationMs)
  const safety = observations.map((observation) => observation.safetyOutcome === 'safe' ? 1 : observation.safetyOutcome === 'unsafe' ? 0 : undefined)
  const missingMetrics: string[] = []
  if (providerTokens === null) missingMetrics.push('providerTokens')
  else if (providerTokenValues.some((value) => value === undefined)) missingMetrics.push('providerTokens-partial')
  if (estimatedTokens === null) missingMetrics.push('estimatedTokens')
  else if (estimatedTokenValues.some((value) => value === undefined)) missingMetrics.push('estimatedTokens-partial')
  if (outcomes.length === 0) missingMetrics.push('taskOutcome')
  if (evidenceQuality.length === 0) missingMetrics.push('evidenceQuality')
  if (knownClarifications.every((value) => value === undefined)) missingMetrics.push('clarificationRequests')
  else if (knownClarifications.some((value) => value === undefined)) missingMetrics.push('clarificationRequests-partial')
  if (knownRework.every((value) => value === undefined)) missingMetrics.push('reworkCount')
  else if (knownRework.some((value) => value === undefined)) missingMetrics.push('reworkCount-partial')
  for (const name of ['searchHitRate', 'errorRate', 'documentationExampleRate', 'documentationFreshnessRate', 'documentationCorrectnessRate', 'documentationCompletenessRate', 'documentationClarityRate', 'documentationMaintainabilityRate', 'documentationFindingCount', 'analysisCostUsd', 'agentCostUsd']) if (measurementValues(observations, name).length === 0) missingMetrics.push(name)
  if (measurementRatio(observations, 'acceptanceChecksPassed', 'acceptanceChecksTotal') === null) missingMetrics.push('acceptanceChecks')
  if (safety.every((value) => value === undefined)) missingMetrics.push('safetyOutcome')
  else if (safety.some((value) => value === undefined)) missingMetrics.push('safetyOutcome-partial')
  if (knownTools.every((value) => value === undefined)) missingMetrics.push('toolCalls')
  else if (knownTools.some((value) => value === undefined)) missingMetrics.push('toolCalls-partial')
  const analysisCostUsd = measurementSum(observations, 'analysisCostUsd')
  const agentCostUsd = measurementSum(observations, 'agentCostUsd')
  const providerTokenCostUnits = measurementSum(observations, 'providerTokenCostUnits')
  if (providerTokenCostUnits === null) missingMetrics.push('providerTokenCostUnits')
  else if (observations.some((observation) => observation.execution.tokenMethod === 'provider' && observation.measurements?.providerTokenCostUnits === undefined)) missingMetrics.push('providerTokenCostUnits-partial')
  return {
    observationCount: observations.length,
    completedRate: ratio(completed, observations.length),
    completedConfidence95: wilson95(completed, observations.length),
    adjudicatedRate: ratio(adjudicated, observations.length),
    successRate: outcomes.length ? ratio(successes, outcomes.length) : null,
    successConfidence95: outcomes.length ? wilson95(successes, outcomes.length) : null,
    evidenceCitationRate: ratio(observations.filter((observation) => observation.evidenceIds.length > 0).length, observations.length),
    evidenceQualityRate: evidenceQuality.length ? ratio(highQualityEvidence, evidenceQuality.length) : null,
    searchHitRate: measurementRate(observations, 'searchHitRate'),
    acceptanceCheckRate: measurementRatio(observations, 'acceptanceChecksPassed', 'acceptanceChecksTotal'),
    errorRate: measurementRate(observations, 'errorRate'),
    safetyRate: rateMetric(safety),
    adjudicatedSuccessRate: adjudicatedOutcomes.length ? ratio(adjudicatedSuccesses, adjudicatedOutcomes.length) : null,
    documentationFindingCount: measurementSum(observations, 'documentationFindingCount'),
    documentationExampleRate: measurementRate(observations, 'documentationExampleRate'),
    documentationFreshnessRate: measurementRate(observations, 'documentationFreshnessRate'),
    documentationCorrectnessRate: measurementRate(observations, 'documentationCorrectnessRate'),
    documentationCompletenessRate: measurementRate(observations, 'documentationCompletenessRate'),
    documentationClarityRate: measurementRate(observations, 'documentationClarityRate'),
    documentationMaintainabilityRate: measurementRate(observations, 'documentationMaintainabilityRate'),
    providerTokens,
    estimatedTokens,
    tokensToCorrectAnswerP95: successfulTokens.length ? percentile95(successfulTokens) : null,
    latencyP95Ms: percentile95(observations.map((observation) => observation.execution.durationMs)),
    timeToCorrectAnswerP95Ms: successfulDurations.length ? percentile95(successfulDurations) : null,
    contextBytesP95: percentile95(observations.map((observation) => observation.contextBytes)),
    responseBytesP95: percentile95(observations.map((observation) => observation.execution.responseBytes)),
    averageToolCalls: knownToolValues.length ? ratio(knownToolValues.reduce((sum, value) => sum + value, 0), knownToolValues.length) : null,
    clarificationRate: rateMetric(knownClarifications.map((value) => value === undefined ? undefined : value > 0 ? 1 : 0)),
    reworkRate: rateMetric(knownRework.map((value) => value === undefined ? undefined : value > 0 ? 1 : 0)),
    analysisCostUsd,
    agentCostUsd,
    totalCostUsd: analysisCostUsd === null || agentCostUsd === null ? null : analysisCostUsd + agentCostUsd,
    providerTokenCostUnits,
    missingMetrics,
  }
}

const delta = (baseline: number | null, current: number | null) => ({
  baseline,
  current,
  absoluteChange: baseline === null || current === null ? null : current - baseline,
  relativeChange: baseline === null || current === null || baseline === 0 ? null : (current - baseline) / baseline,
})

const numeric = (metrics: StudyMetricSetV1, name: MetricName): number | null => {
  if (metrics.missingMetrics.includes(name) || metrics.missingMetrics.includes(`${name}-partial`)) return null
  const value = metrics[name]
  return typeof value === 'number' ? value : null
}

const comparisonFor = (baseline: StudyMetricGroupV1 | undefined, current: StudyMetricGroupV1 | undefined, baselineRound: string, currentRound: string): StudyMetricComparisonV1 => {
  const baselineMetrics = baseline?.metrics
  const currentMetrics = current?.metrics
  const sampleSizes = [baselineMetrics?.observationCount ?? 0, currentMetrics?.observationCount ?? 0]
  const metrics = {
    completedRate: delta(numeric(baselineMetrics ?? emptyMetrics(), 'completedRate'), numeric(currentMetrics ?? emptyMetrics(), 'completedRate')),
    successRate: delta(numeric(baselineMetrics ?? emptyMetrics(), 'successRate'), numeric(currentMetrics ?? emptyMetrics(), 'successRate')),
    evidenceCitationRate: delta(numeric(baselineMetrics ?? emptyMetrics(), 'evidenceCitationRate'), numeric(currentMetrics ?? emptyMetrics(), 'evidenceCitationRate')),
    evidenceQualityRate: delta(numeric(baselineMetrics ?? emptyMetrics(), 'evidenceQualityRate'), numeric(currentMetrics ?? emptyMetrics(), 'evidenceQualityRate')),
    searchHitRate: delta(numeric(baselineMetrics ?? emptyMetrics(), 'searchHitRate'), numeric(currentMetrics ?? emptyMetrics(), 'searchHitRate')),
    acceptanceCheckRate: delta(numeric(baselineMetrics ?? emptyMetrics(), 'acceptanceCheckRate'), numeric(currentMetrics ?? emptyMetrics(), 'acceptanceCheckRate')),
    errorRate: delta(numeric(baselineMetrics ?? emptyMetrics(), 'errorRate'), numeric(currentMetrics ?? emptyMetrics(), 'errorRate')),
    safetyRate: delta(numeric(baselineMetrics ?? emptyMetrics(), 'safetyRate'), numeric(currentMetrics ?? emptyMetrics(), 'safetyRate')),
    adjudicatedSuccessRate: delta(numeric(baselineMetrics ?? emptyMetrics(), 'adjudicatedSuccessRate'), numeric(currentMetrics ?? emptyMetrics(), 'adjudicatedSuccessRate')),
    documentationFindingCount: delta(numeric(baselineMetrics ?? emptyMetrics(), 'documentationFindingCount'), numeric(currentMetrics ?? emptyMetrics(), 'documentationFindingCount')),
    documentationExampleRate: delta(numeric(baselineMetrics ?? emptyMetrics(), 'documentationExampleRate'), numeric(currentMetrics ?? emptyMetrics(), 'documentationExampleRate')),
    documentationFreshnessRate: delta(numeric(baselineMetrics ?? emptyMetrics(), 'documentationFreshnessRate'), numeric(currentMetrics ?? emptyMetrics(), 'documentationFreshnessRate')),
    documentationCorrectnessRate: delta(numeric(baselineMetrics ?? emptyMetrics(), 'documentationCorrectnessRate'), numeric(currentMetrics ?? emptyMetrics(), 'documentationCorrectnessRate')),
    documentationCompletenessRate: delta(numeric(baselineMetrics ?? emptyMetrics(), 'documentationCompletenessRate'), numeric(currentMetrics ?? emptyMetrics(), 'documentationCompletenessRate')),
    documentationClarityRate: delta(numeric(baselineMetrics ?? emptyMetrics(), 'documentationClarityRate'), numeric(currentMetrics ?? emptyMetrics(), 'documentationClarityRate')),
    documentationMaintainabilityRate: delta(numeric(baselineMetrics ?? emptyMetrics(), 'documentationMaintainabilityRate'), numeric(currentMetrics ?? emptyMetrics(), 'documentationMaintainabilityRate')),
    providerTokens: delta(numeric(baselineMetrics ?? emptyMetrics(), 'providerTokens'), numeric(currentMetrics ?? emptyMetrics(), 'providerTokens')),
    estimatedTokens: delta(numeric(baselineMetrics ?? emptyMetrics(), 'estimatedTokens'), numeric(currentMetrics ?? emptyMetrics(), 'estimatedTokens')),
    tokensToCorrectAnswerP95: delta(numeric(baselineMetrics ?? emptyMetrics(), 'tokensToCorrectAnswerP95'), numeric(currentMetrics ?? emptyMetrics(), 'tokensToCorrectAnswerP95')),
    latencyP95Ms: delta(numeric(baselineMetrics ?? emptyMetrics(), 'latencyP95Ms'), numeric(currentMetrics ?? emptyMetrics(), 'latencyP95Ms')),
    timeToCorrectAnswerP95Ms: delta(numeric(baselineMetrics ?? emptyMetrics(), 'timeToCorrectAnswerP95Ms'), numeric(currentMetrics ?? emptyMetrics(), 'timeToCorrectAnswerP95Ms')),
    contextBytesP95: delta(numeric(baselineMetrics ?? emptyMetrics(), 'contextBytesP95'), numeric(currentMetrics ?? emptyMetrics(), 'contextBytesP95')),
    responseBytesP95: delta(numeric(baselineMetrics ?? emptyMetrics(), 'responseBytesP95'), numeric(currentMetrics ?? emptyMetrics(), 'responseBytesP95')),
    clarificationRate: delta(numeric(baselineMetrics ?? emptyMetrics(), 'clarificationRate'), numeric(currentMetrics ?? emptyMetrics(), 'clarificationRate')),
    reworkRate: delta(numeric(baselineMetrics ?? emptyMetrics(), 'reworkRate'), numeric(currentMetrics ?? emptyMetrics(), 'reworkRate')),
    analysisCostUsd: delta(numeric(baselineMetrics ?? emptyMetrics(), 'analysisCostUsd'), numeric(currentMetrics ?? emptyMetrics(), 'analysisCostUsd')),
    agentCostUsd: delta(numeric(baselineMetrics ?? emptyMetrics(), 'agentCostUsd'), numeric(currentMetrics ?? emptyMetrics(), 'agentCostUsd')),
    totalCostUsd: delta(numeric(baselineMetrics ?? emptyMetrics(), 'totalCostUsd'), numeric(currentMetrics ?? emptyMetrics(), 'totalCostUsd')),
    providerTokenCostUnits: delta(numeric(baselineMetrics ?? emptyMetrics(), 'providerTokenCostUnits'), numeric(currentMetrics ?? emptyMetrics(), 'providerTokenCostUnits')),
  }
  const regressions: string[] = []
  if (sampleSizes.every((size) => size >= 2)) {
    if (metrics.successRate.baseline !== null && metrics.successRate.current !== null && metrics.successRate.current < metrics.successRate.baseline) regressions.push('successRate')
    if (metrics.adjudicatedSuccessRate.baseline !== null && metrics.adjudicatedSuccessRate.current !== null && metrics.adjudicatedSuccessRate.current < metrics.adjudicatedSuccessRate.baseline) regressions.push('adjudicatedSuccessRate')
    if (metrics.evidenceCitationRate.baseline !== null && metrics.evidenceCitationRate.current !== null && metrics.evidenceCitationRate.current < metrics.evidenceCitationRate.baseline) regressions.push('evidenceCitationRate')
    if (metrics.evidenceQualityRate.baseline !== null && metrics.evidenceQualityRate.current !== null && metrics.evidenceQualityRate.current < metrics.evidenceQualityRate.baseline) regressions.push('evidenceQualityRate')
    if (metrics.safetyRate.baseline !== null && metrics.safetyRate.current !== null && metrics.safetyRate.current < metrics.safetyRate.baseline) regressions.push('safetyRate')
    if (metrics.acceptanceCheckRate.baseline !== null && metrics.acceptanceCheckRate.current !== null && metrics.acceptanceCheckRate.current < metrics.acceptanceCheckRate.baseline) regressions.push('acceptanceCheckRate')
    for (const name of ['providerTokens', 'estimatedTokens', 'tokensToCorrectAnswerP95', 'latencyP95Ms', 'timeToCorrectAnswerP95Ms', 'contextBytesP95', 'responseBytesP95', 'clarificationRate', 'reworkRate', 'analysisCostUsd', 'agentCostUsd', 'totalCostUsd', 'providerTokenCostUnits'] as const) {
      const change = metrics[name]
      if (change.baseline !== null && change.current !== null && change.current > change.baseline * 1.05) regressions.push(name)
    }
  }
  const comparable = Object.values(metrics).some((value) => value.baseline !== null && value.current !== null)
  const improved = ['providerTokens', 'estimatedTokens', 'tokensToCorrectAnswerP95', 'latencyP95Ms', 'timeToCorrectAnswerP95Ms', 'contextBytesP95', 'responseBytesP95', 'clarificationRate', 'reworkRate', 'analysisCostUsd', 'agentCostUsd', 'totalCostUsd', 'providerTokenCostUnits'].some((name) => {
    const change = metrics[name as keyof typeof metrics]
    return change.baseline !== null && change.current !== null && change.current < change.baseline * 0.95
  }) || ['successRate', 'adjudicatedSuccessRate', 'evidenceCitationRate', 'evidenceQualityRate'].some((name) => {
    const change = metrics[name as keyof typeof metrics]
    return change.baseline !== null && change.current !== null && change.current > change.baseline
  })
  const status = !baseline || !current || !comparable ? 'not-analyzed' : sampleSizes.some((size) => size < 2) ? 'inconclusive' : regressions.length ? 'regressed' : improved ? 'improved' : 'unchanged'
  return {
    scope: current?.scope ?? baseline?.scope ?? 'aggregate',
    key: current?.key ?? baseline?.key ?? 'all',
    baselineRound,
    currentRound,
    baselineSampleSize: sampleSizes[0] ?? 0,
    currentSampleSize: sampleSizes[1] ?? 0,
    metrics,
    status,
    regressions,
    limitations: sampleSizes.some((size) => size < 2) ? ['Samples smaller than two observations are inconclusive.'] : [],
  }
}

const emptyMetrics = (): StudyMetricSetV1 => ({
  observationCount: 0, completedRate: 0, completedConfidence95: { low: 0, high: 0 }, adjudicatedRate: 0, successRate: null, successConfidence95: null, evidenceCitationRate: 0, evidenceQualityRate: null, searchHitRate: null, acceptanceCheckRate: null, errorRate: null, safetyRate: null, adjudicatedSuccessRate: null, documentationFindingCount: null, documentationExampleRate: null, documentationFreshnessRate: null, documentationCorrectnessRate: null, documentationCompletenessRate: null, documentationClarityRate: null, documentationMaintainabilityRate: null, providerTokens: null, estimatedTokens: null, tokensToCorrectAnswerP95: null, latencyP95Ms: 0, timeToCorrectAnswerP95Ms: null, contextBytesP95: 0, responseBytesP95: 0, averageToolCalls: null, clarificationRate: null, reworkRate: null, analysisCostUsd: null, agentCostUsd: null, totalCostUsd: null, providerTokenCostUnits: null, missingMetrics: [],
})

export const calculateStudyMetrics = (observations: readonly ControlledStudyObservationV1[], options: { readonly baselineRound?: string; readonly currentRound?: string; readonly baselineRunId?: string; readonly currentRunId?: string } = {}): StudyMetricsReportV1 => {
  const allRounds = [...new Set(observations.map(roundOf))].sort()
  const baselineRound = options.baselineRound ?? (allRounds.includes('baseline') ? 'baseline' : allRounds[0] ?? null)
  const currentRound = options.currentRound ?? (allRounds.filter((round) => round !== baselineRound).at(-1) ?? null)
  const selectedObservations = options.baselineRunId || options.currentRunId
    ? observations.filter((observation) => {
      const round = roundOf(observation)
      if (baselineRound === currentRound) {
        if (round !== baselineRound) return false
        const selectedRunIds = [options.baselineRunId, options.currentRunId].filter((runId): runId is string => runId !== undefined)
        return selectedRunIds.length === 0 || selectedRunIds.includes(observation.runId)
      }
      if (round === baselineRound) return options.baselineRunId === undefined || observation.runId === options.baselineRunId
      if (round === currentRound) return options.currentRunId === undefined || observation.runId === options.currentRunId
      return false
    })
    : observations
  const rounds = [...new Set(selectedObservations.map(roundOf))].sort()
  const grouped = new Map<string, ControlledStudyObservationV1[]>()
  for (const observation of selectedObservations) for (const group of groupValues(observation)) {
    const key = `${group.scope}\u0000${group.key}\u0000${roundOf(observation)}`
    grouped.set(key, [...(grouped.get(key) ?? []), observation])
  }
  const groups = [...grouped.entries()].map(([key, values]) => {
    const [scope, groupKey, round] = key.split('\u0000') as [GroupScope, string, string]
    return { scope, key: groupKey, round, metrics: metricsFor(values) }
  }).sort((a, b) => `${a.scope}:${a.key}:${a.round}`.localeCompare(`${b.scope}:${b.key}:${b.round}`))
  const comparisonKeys = new Set(groups.filter((group) => group.round === baselineRound || group.round === currentRound).map((group) => `${group.scope}\u0000${group.key}`))
  const comparisons = [...comparisonKeys].map((key) => {
    const [scope, groupKey] = key.split('\u0000') as [GroupScope, string]
    return comparisonFor(groups.find((group) => group.scope === scope && group.key === groupKey && group.round === baselineRound), groups.find((group) => group.scope === scope && group.key === groupKey && group.round === currentRound), baselineRound ?? 'unassigned', currentRound ?? 'unassigned')
  }).sort((a, b) => `${a.scope}:${a.key}`.localeCompare(`${b.scope}:${b.key}`))
  const base = {
    type: 'controlled-study-metrics' as const,
    schemaVersion: STUDY_METRICS_SCHEMA_VERSION,
    metricsVersion: 'v1',
    contentHash: '0'.repeat(64),
    contentHashAlgo: 'sha256-normalized-v1' as const,
    observationCount: selectedObservations.length,
    rounds,
    baselineRound,
    currentRound,
    ...(options.baselineRunId === undefined ? {} : { baselineRunId: options.baselineRunId }),
    ...(options.currentRunId === undefined ? {} : { currentRunId: options.currentRunId }),
    groups,
    comparisons,
    limitations: [
      'Missing observation fields remain not-analyzed and are excluded from their metric denominator.',
      'A lower token or latency value is not an improvement when correctness, evidence quality, or rework regresses.',
      'Small samples are labeled inconclusive; this report does not establish causality from historical observations.',
    ],
  }
  return StudyMetricsReportV1Schema.parse({ ...base, contentHash: contentHashForArtifactV1(base) })
}

export const parseStudyMetrics = (input: unknown): StudyMetricsReportV1 => {
  const report = StudyMetricsReportV1Schema.parse(input)
  if (report.contentHash !== contentHashForArtifactV1(report)) throw new Error('Invalid controlled-study metrics content hash.')
  return report
}

export const formatStudyMetricsText = (report: StudyMetricsReportV1): readonly string[] => [
  `Study metrics: ${report.metricsVersion}`,
  `Observations: ${report.observationCount} | Rounds: ${report.rounds.length}`,
  `Baseline: ${report.baselineRound ?? 'not-analyzed'} | Current: ${report.currentRound ?? 'not-analyzed'}`,
  ...(report.baselineRunId || report.currentRunId ? [`Baseline run: ${report.baselineRunId ?? 'not-selected'} | Current run: ${report.currentRunId ?? 'not-selected'}`] : []),
  `Groups: ${report.groups.length} | Comparisons: ${report.comparisons.length}`,
  `Regressions: ${report.comparisons.filter((comparison) => comparison.status === 'regressed').length} | Inconclusive: ${report.comparisons.filter((comparison) => comparison.status === 'inconclusive').length}`,
  `Content hash: ${report.contentHash}`,
  ...report.groups.map((group) => `Group ${group.scope}/${group.key} @ ${group.round}: ${JSON.stringify(group.metrics)}`),
  ...report.comparisons.map((comparison) => `Comparison ${comparison.scope}/${comparison.key}: ${JSON.stringify({ status: comparison.status, metrics: comparison.metrics, regressions: comparison.regressions })}`),
]
