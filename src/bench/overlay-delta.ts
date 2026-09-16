import type { DocBridgeConfigV1 } from '../config/schema.js'
import { buildDocBridgeIndex } from '../index-builder/build-index.js'
import type { EnrichmentOverlayV1 } from '../schemas/enrichment.js'
import type { DiscoverySnapshotV1 } from '../schemas/knowledge.js'
import { runRetrievalBench, type RetrievalMetrics, type RetrievalSuite } from './retrieval.js'

/**
 * Does the overlay earn its cost?
 *
 * An enrichment stage that nobody measures is a stage nobody can defend. The question is narrow
 * and answerable: run the golden suite twice over the same snapshot — once with the accepted
 * overlay projected, once without it — and report the difference. Everything else about the
 * agent is opinion; this is the number.
 *
 * The rule is asymmetric on purpose. An overlay may leave retrieval unchanged, and it may improve
 * it, but it must not lower hit@3: aliases and summaries an agent proposed are supposed to help
 * an agent find things. A drop is reported as a regression of the overlay, never as a new
 * baseline — it is a finding about the agent, not about the benchmark.
 */

/** The metrics compared, in the order a reader wants them. */
export const OVERLAY_DELTA_METRICS = ['hitAt1', 'hitAt3', 'meanReciprocalRank', 'meanContextBytes', 'meanApproxTokens', 'zeroResultRate'] as const

/** Metrics where a lower value is the improvement. */
const LOWER_IS_BETTER = new Set<keyof RetrievalMetrics>(['meanContextBytes', 'meanApproxTokens', 'zeroResultRate'])

/** The one metric an overlay is not allowed to lower. */
export const OVERLAY_BLOCKING_METRIC: keyof RetrievalMetrics = 'hitAt3'

export type OverlayMetricDelta = {
  readonly metric: (typeof OVERLAY_DELTA_METRICS)[number]
  readonly withoutOverlay: number
  readonly withOverlay: number
  readonly delta: number
  readonly improved: boolean
  readonly worsened: boolean
}

export type OverlayRetrievalDelta = {
  readonly status: 'improved' | 'unchanged' | 'regressed'
  /** True when the overlay lowered hit@3. The caller fails the run on this. */
  readonly regression: boolean
  readonly overlayHash: string
  readonly suite: { readonly name: string; readonly caseCount: number; readonly contentHash: string }
  readonly withoutOverlay: RetrievalMetrics
  readonly withOverlay: RetrievalMetrics
  readonly deltas: readonly OverlayMetricDelta[]
  /** Case ids the overlay lost, and gained, at hit@3 — what a regression is actually made of. */
  readonly lostCases: readonly string[]
  readonly gainedCases: readonly string[]
  readonly messages: readonly string[]
}

export type MeasureOverlayRetrievalDeltaOptions = {
  readonly root: string
  readonly config: DocBridgeConfigV1
  readonly snapshot: DiscoverySnapshotV1
  readonly overlay: EnrichmentOverlayV1
  readonly suite: RetrievalSuite
  readonly limit?: number
}

const round = (value: number): number => Math.round(value * 1_000_000) / 1_000_000

const format = (metric: keyof RetrievalMetrics, value: number): string =>
  metric === 'meanContextBytes' || metric === 'meanApproxTokens' ? String(value) : value.toFixed(3)

/**
 * Measure the suite with and without the overlay.
 *
 * Both indexes are built from the one snapshot the caller passes, so the only difference between
 * the two runs is the overlay — not a re-scan, not a different revision, not a different
 * configuration.
 */
export const measureOverlayRetrievalDelta = (options: MeasureOverlayRetrievalDeltaOptions): OverlayRetrievalDelta => {
  const { root, config, snapshot, overlay, suite } = options
  const limit = options.limit === undefined ? {} : { limit: options.limit }
  const baseline = runRetrievalBench({
    index: buildDocBridgeIndex({ root, config, write: false, snapshot, overlay: 'ignore' }).index,
    suite,
    ...limit,
  })
  const enriched = runRetrievalBench({
    index: buildDocBridgeIndex({ root, config, write: false, snapshot, overlay }).index,
    suite,
    ...limit,
  })

  const deltas = OVERLAY_DELTA_METRICS.map((metric): OverlayMetricDelta => {
    const before = baseline.metrics[metric]
    const after = enriched.metrics[metric]
    const delta = round(after - before)
    return {
      metric,
      withoutOverlay: before,
      withOverlay: after,
      delta,
      improved: LOWER_IS_BETTER.has(metric) ? delta < 0 : delta > 0,
      worsened: LOWER_IS_BETTER.has(metric) ? delta > 0 : delta < 0,
    }
  })

  const hitBefore = new Map(baseline.cases.map((entry) => [entry.id, entry.hitAt3]))
  const lostCases = enriched.cases.filter((entry) => hitBefore.get(entry.id) === true && !entry.hitAt3).map((entry) => entry.id).sort()
  const gainedCases = enriched.cases.filter((entry) => hitBefore.get(entry.id) === false && entry.hitAt3).map((entry) => entry.id).sort()

  const blocking = deltas.find((entry) => entry.metric === OVERLAY_BLOCKING_METRIC)
  const regression = blocking?.worsened === true
  const status = regression ? 'regressed' : deltas.some((entry) => entry.improved) ? 'improved' : 'unchanged'

  return {
    status,
    regression,
    overlayHash: overlay.contentHash,
    suite: enriched.suite,
    withoutOverlay: baseline.metrics,
    withOverlay: enriched.metrics,
    deltas,
    lostCases,
    gainedCases,
    messages: [
      ...(regression
        ? [`The overlay lowered ${OVERLAY_BLOCKING_METRIC} from ${format(OVERLAY_BLOCKING_METRIC, blocking?.withoutOverlay ?? 0)} to ${format(OVERLAY_BLOCKING_METRIC, blocking?.withOverlay ?? 0)}. This is a finding about the agent, not a new baseline.`]
        : []),
      ...(lostCases.length ? [`Cases the overlay lost: ${lostCases.join(', ')}.`] : []),
      ...(gainedCases.length ? [`Cases the overlay gained: ${gainedCases.join(', ')}.`] : []),
    ],
  }
}

export const formatOverlayRetrievalDeltaText = (delta: OverlayRetrievalDelta): readonly string[] => [
  `Overlay retrieval delta: ${delta.status} (overlay ${delta.overlayHash.slice(0, 12)}, suite ${delta.suite.name}, ${delta.suite.caseCount} case(s))`,
  ...delta.deltas.map((entry) => {
    const sign = entry.delta > 0 ? '+' : ''
    const mark = entry.improved ? 'improved' : entry.worsened ? 'worse' : 'no change'
    return `  ${entry.metric}: ${format(entry.metric, entry.withoutOverlay)} → ${format(entry.metric, entry.withOverlay)} (${sign}${format(entry.metric, entry.delta)}, ${mark})`
  }),
  ...delta.messages.map((message) => `  ${message}`),
]
