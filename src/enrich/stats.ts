import {
  INVENTED_RELATION_REASONS,
  type EnrichmentOverlayV1,
  type EnrichmentStats,
  type RejectedEnrichment,
} from '../schemas/enrichment.js'

/**
 * What the overlay cost and whether it can be trusted.
 *
 * An enrichment stage that reports only what it accepted is unauditable: an agent that proposes
 * a hundred things and has ninety rejected looks the same as one that proposes ten good ones. So
 * the overlay carries the whole shape of the run — per kind, per rejection reason, what it
 * invented, what it cost — and two numbers that say whether the thing is stable at all.
 */

/** Rejections that named something the repository does not contain. */
export const inventedReferenceCount = (rejected: readonly RejectedEnrichment[]): number =>
  rejected.filter((entry) => (INVENTED_RELATION_REASONS as readonly string[]).includes(entry.reason)).length

const round = (value: number): number => Math.round(value * 1_000_000) / 1_000_000

export const cacheHitRate = (cacheHits: number, agentRuns: number): number =>
  cacheHits + agentRuns === 0 ? 0 : round(cacheHits / (cacheHits + agentRuns))

export type EnrichmentStability = {
  /**
   * Whether the two runs decided identically. A deterministic agent must reach this; a live model
   * usually will not, which is why the proposal-identifier share is reported next to it.
   */
  readonly overlayHashIdentical: boolean
  readonly previousOverlayHash?: string
  readonly overlayHash: string
  /** Proposal identifiers present in both runs, over the identifiers of the union. */
  readonly proposalIdShare: number
  readonly sharedProposalIds: number
  readonly proposalIds: number
  readonly previousProposalIds: number
}

/** Every proposal identifier an overlay decided on, whatever the decision was. */
export const overlayProposalIds = (overlay: Pick<EnrichmentOverlayV1, 'accepted' | 'pending' | 'rejected'>): ReadonlySet<string> =>
  new Set([
    ...overlay.accepted.map((entry) => entry.proposal.proposalId),
    ...overlay.pending.map((entry) => entry.proposal.proposalId),
    ...overlay.rejected.map((entry) => entry.proposalId),
  ])

/**
 * Compare this run with the one before it.
 *
 * Both halves of the issue's stability requirement fall out of the same comparison: two
 * deterministic runs over an unchanged repository produce one overlay hash, and two live-model
 * runs produce a share of identical proposal identifiers. The share is over the union, so a run
 * that merely proposes fewer things does not score as more stable.
 */
export const enrichmentStability = (
  current: EnrichmentOverlayV1,
  previous: EnrichmentOverlayV1 | undefined,
): EnrichmentStability => {
  const currentIds = overlayProposalIds(current)
  const previousIds = previous ? overlayProposalIds(previous) : new Set<string>()
  const union = new Set([...currentIds, ...previousIds])
  const shared = [...currentIds].filter((id) => previousIds.has(id)).length
  return {
    overlayHashIdentical: previous !== undefined && previous.contentHash === current.contentHash,
    ...(previous ? { previousOverlayHash: previous.contentHash } : {}),
    overlayHash: current.contentHash,
    proposalIdShare: union.size === 0 ? (previous === undefined ? 0 : 1) : round(shared / union.size),
    sharedProposalIds: shared,
    proposalIds: currentIds.size,
    previousProposalIds: previousIds.size,
  }
}

/** The cost side of `stats`, as its own object for a reader that only wants the bill. */
export const enrichmentCost = (stats: EnrichmentStats): {
  readonly agentRuns: number
  readonly inputBytes: number
  readonly outputBytes: number
  readonly cacheHits: number
  readonly cacheHitRate: number
  readonly wallTimeMs: number
} => ({
  agentRuns: stats.agentRuns,
  inputBytes: stats.inputBytes,
  outputBytes: stats.outputBytes,
  cacheHits: stats.cacheHits,
  cacheHitRate: stats.cacheHitRate,
  wallTimeMs: stats.wallTimeMs,
})

export const formatEnrichmentStatsText = (stats: EnrichmentStats, stability: EnrichmentStability): readonly string[] => [
  `Cost: ${stats.agentRuns} agent run(s), ${stats.inputBytes} bytes in, ${stats.outputBytes} bytes out, cache ${(stats.cacheHitRate * 100).toFixed(1)}% (${stats.cacheHits} hit(s)), ${stats.wallTimeMs} ms`,
  `Invented references: ${stats.inventedReferences}`,
  `Stability: overlay hash ${stability.overlayHashIdentical ? 'identical to the previous run' : stability.previousOverlayHash ? 'changed' : 'first run'}, proposal ids ${(stability.proposalIdShare * 100).toFixed(1)}% shared (${stability.sharedProposalIds} of ${stability.proposalIds})`,
  ...(Object.keys(stats.rejectionReasons).length
    ? [`Rejections: ${Object.entries(stats.rejectionReasons).map(([reason, value]) => `${reason}=${value}`).join(', ')}`]
    : []),
]
