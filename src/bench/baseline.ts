import { z } from 'zod'

import { contentHashForArtifactV1 } from '../index-builder/content-hash.js'
import { RETRIEVAL_BENCH_SCHEMA_VERSION, type RetrievalBenchResultV1, type RetrievalMetrics } from './retrieval.js'

const hash = z.string().regex(/^[a-f0-9]{64}$/)

const BaselineMetricsSchema = z
  .object({
    caseCount: z.number().int().nonnegative(),
    hitAt1: z.number().min(0).max(1),
    hitAt3: z.number().min(0).max(1),
    meanReciprocalRank: z.number().min(0).max(1),
    meanContextBytes: z.number().int().nonnegative(),
    meanApproxTokens: z.number().int().nonnegative(),
    zeroResultRate: z.number().min(0).max(1),
    tokenMethod: z.literal('approximate'),
  })
  .strict()

export const RetrievalBaselineV1Schema = z
  .object({
    type: z.literal('retrieval-benchmark-baseline'),
    schemaVersion: z.literal(RETRIEVAL_BENCH_SCHEMA_VERSION),
    contentHash: hash,
    contentHashAlgo: z.literal('sha256-normalized-v1'),
    suite: z
      .object({
        name: z.string().min(1).max(128),
        caseCount: z.number().int().positive(),
        contentHash: hash,
      })
      .strict(),
    metrics: BaselineMetricsSchema,
    /**
     * A baseline exists only as the result of an explicit human action. A normal
     * `ak-docs bench retrieval` run compares against it and never writes it, so the number
     * a gate defends cannot drift by accident.
     */
    approval: z
      .object({
        approvedAt: z.string().datetime(),
        approvedBy: z.string().min(1).max(256),
        reason: z.string().min(1).max(1_024).optional(),
        /** Result the approved figures were measured from, for provenance. */
        resultHash: hash,
        /** Index the approved figures were measured on. */
        indexHash: hash,
      })
      .strict(),
  })
  .strict()

export type RetrievalBaselineV1 = z.infer<typeof RetrievalBaselineV1Schema>

export const parseRetrievalBaseline = (raw: unknown): RetrievalBaselineV1 => {
  const baseline = RetrievalBaselineV1Schema.parse(raw)
  if (contentHashForArtifactV1(baseline) !== baseline.contentHash) {
    throw new Error('Invalid retrieval benchmark baseline content hash.')
  }
  return baseline
}

export type CreateRetrievalBaselineOptions = {
  readonly result: RetrievalBenchResultV1
  readonly approvedBy: string
  readonly reason?: string
  readonly approvedAt?: string
}

/** Record a measured result as the figure future runs are gated against. */
export const createRetrievalBaseline = (options: CreateRetrievalBaselineOptions): RetrievalBaselineV1 => {
  const approvedBy = options.approvedBy.trim()
  if (!approvedBy) throw new Error('A retrieval baseline requires an approver. Pass --by <name>.')
  const base = {
    type: 'retrieval-benchmark-baseline' as const,
    schemaVersion: RETRIEVAL_BENCH_SCHEMA_VERSION,
    contentHash: '0'.repeat(64),
    contentHashAlgo: 'sha256-normalized-v1' as const,
    suite: options.result.suite,
    metrics: options.result.metrics,
    approval: {
      approvedAt: options.approvedAt ?? new Date().toISOString(),
      approvedBy,
      ...(options.reason ? { reason: options.reason } : {}),
      resultHash: options.result.contentHash,
      indexHash: options.result.index.contentHash,
    },
  }
  return RetrievalBaselineV1Schema.parse({ ...base, contentHash: contentHashForArtifactV1(base) })
}

export type RetrievalComparisonStatus = 'pass' | 'regressed' | 'suite-changed'

export type RetrievalMetricDelta = {
  readonly metric: keyof RetrievalMetrics
  readonly baseline: number
  readonly current: number
  readonly delta: number
}

export type RetrievalComparison = {
  readonly status: RetrievalComparisonStatus
  readonly blocking: boolean
  readonly tolerance: number
  readonly suiteChanged: boolean
  /** Reasons the gate fails. Empty when it passes. */
  readonly regressions: readonly string[]
  /** Non-blocking movements worth reading before merging. */
  readonly warnings: readonly string[]
  readonly improvements: readonly string[]
  readonly deltas: readonly RetrievalMetricDelta[]
}

/** Metrics where a lower value is the improvement. */
const LOWER_IS_BETTER = new Set<keyof RetrievalMetrics>(['meanContextBytes', 'meanApproxTokens', 'zeroResultRate'])
/** The one metric whose regression blocks. Everything else is reported, not enforced. */
const BLOCKING_METRIC: keyof RetrievalMetrics = 'hitAt3'
const COMPARED: readonly (keyof RetrievalMetrics)[] = [
  'hitAt1',
  'hitAt3',
  'meanReciprocalRank',
  'meanContextBytes',
  'meanApproxTokens',
  'zeroResultRate',
]

const format = (metric: keyof RetrievalMetrics, value: number): string =>
  metric === 'meanContextBytes' || metric === 'meanApproxTokens' ? String(value) : value.toFixed(3)

export type CompareRetrievalBaselineOptions = {
  /** Slack allowed on the blocking metric before a drop counts as a regression. Default 0. */
  readonly tolerance?: number
}

/**
 * Compare a fresh result with an approved baseline.
 *
 * A changed suite fails the gate rather than being silently compared: the figures were
 * measured over different questions, so neither a pass nor a regression would mean
 * anything. Resolving it is an explicit baseline update.
 */
export const compareRetrievalBaseline = (
  result: RetrievalBenchResultV1,
  baseline: RetrievalBaselineV1,
  options: CompareRetrievalBaselineOptions = {},
): RetrievalComparison => {
  const tolerance = options.tolerance ?? 0
  if (tolerance < 0) throw new Error('Retrieval baseline tolerance must not be negative.')
  const suiteChanged = baseline.suite.contentHash !== result.suite.contentHash

  const deltas = COMPARED.map((metric) => ({
    metric,
    baseline: baseline.metrics[metric] as number,
    current: result.metrics[metric] as number,
    delta: Number(((result.metrics[metric] as number) - (baseline.metrics[metric] as number)).toFixed(6)),
  }))

  const regressions: string[] = []
  const warnings: string[] = []
  const improvements: string[] = []

  if (suiteChanged) {
    regressions.push(
      `Suite "${result.suite.name}" changed since the baseline was approved (${baseline.suite.caseCount} case(s) at ${baseline.suite.contentHash.slice(0, 12)}, now ${result.suite.caseCount} at ${result.suite.contentHash.slice(0, 12)}). Re-approve the baseline with --update-baseline --by <name>.`,
    )
  }

  for (const entry of deltas) {
    const improved = LOWER_IS_BETTER.has(entry.metric) ? entry.delta < 0 : entry.delta > 0
    const worsened = LOWER_IS_BETTER.has(entry.metric) ? entry.delta > 0 : entry.delta < 0
    const message = `${entry.metric} ${format(entry.metric, entry.baseline)} → ${format(entry.metric, entry.current)}`
    if (improved) improvements.push(message)
    if (!worsened) continue
    if (entry.metric === BLOCKING_METRIC && Math.abs(entry.delta) > tolerance) regressions.push(`${message} (tolerance ${tolerance})`)
    else warnings.push(message)
  }

  const status: RetrievalComparisonStatus = suiteChanged ? 'suite-changed' : regressions.length ? 'regressed' : 'pass'
  return {
    status,
    blocking: regressions.length > 0,
    tolerance,
    suiteChanged,
    regressions,
    warnings,
    improvements,
    deltas,
  }
}

export const formatRetrievalComparisonText = (comparison: RetrievalComparison): readonly string[] => [
  `Baseline comparison: ${comparison.status}`,
  ...comparison.regressions.map((entry) => `  regression: ${entry}`),
  ...comparison.warnings.map((entry) => `  warning: ${entry}`),
  ...comparison.improvements.map((entry) => `  improved: ${entry}`),
  ...(comparison.regressions.length || comparison.warnings.length || comparison.improvements.length ? [] : ['  no change']),
]
