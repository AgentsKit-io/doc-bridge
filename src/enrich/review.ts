import { ENRICHMENT_POLICY, type AcceptedEnrichment, type EnrichmentOverlayV1, type PendingEnrichment, type RejectedEnrichment } from '../schemas/enrichment.js'
import type { DiscoverySnapshotV1 } from '../schemas/knowledge.js'
import { approvalsDir, createFileApprovalStore, enrichmentApprovalId, loadApprovalGate, ENRICHMENT_APPROVAL_GATE, type ApprovalGate } from './approvals.js'
import { effectiveEnrichment, readEnrichmentOverlay, sealEnrichmentOverlay, writeEnrichmentOverlay } from './overlay.js'
import { entityContentHash } from './validate.js'

/**
 * Reviewing the overlay: what a person does with it.
 *
 * Shared by `ak-docs enrich list|approve|reject`, the MCP `docbridge.proposals` tool and a
 * rendered review page, so there is one way to decide and one record of the decision. A
 * decision goes through the approval gate first and the overlay second: if the gate refuses —
 * already decided, unknown — the overlay is untouched.
 */

export type EnrichmentReview = {
  readonly overlayHash: string
  readonly baseSnapshotHash: string
  readonly accepted: readonly AcceptedEnrichment[]
  readonly pending: readonly PendingEnrichment[]
  readonly rejected: readonly RejectedEnrichment[]
  readonly stats: EnrichmentOverlayV1['stats']
}

export const listEnrichment = (root: string): EnrichmentReview | undefined => {
  const overlay = readEnrichmentOverlay(root)
  if (!overlay) return undefined
  return { overlayHash: overlay.contentHash, baseSnapshotHash: overlay.baseSnapshotHash, accepted: overlay.accepted, pending: overlay.pending, rejected: overlay.rejected, stats: overlay.stats }
}

export type DecideEnrichmentOptions = {
  readonly root: string
  readonly proposalId: string
  readonly decision: 'approved' | 'rejected'
  /** Who decided. Must not be the proposal's author, and must not be `policy`. */
  readonly by: string
  readonly reason?: string
  /** When given, the proposal must still describe the entity as it is now. */
  readonly snapshot?: Pick<DiscoverySnapshotV1, 'entities'>
  readonly gate?: ApprovalGate
  readonly now?: () => string
}

export type DecideEnrichmentResult = {
  readonly overlay: EnrichmentOverlayV1
  readonly approvalId: string
  readonly entry: AcceptedEnrichment | RejectedEnrichment
  readonly gateSource: 'ecosystem' | 'mirror' | 'supplied'
}

/**
 * Approve or reject one pending proposal.
 *
 * Binding is to both the proposal id and the target content hash: the approval record's id is
 * their hash, so an approval given for one version of a document cannot be replayed against the
 * next one. A person approving their own agent's output is refused by identity, and `policy` is
 * not a person.
 */
export const decideEnrichment = async (options: DecideEnrichmentOptions): Promise<DecideEnrichmentResult> => {
  const overlay = readEnrichmentOverlay(options.root)
  if (!overlay) throw new Error('No enrichment overlay to review. Run `ak-docs enrich` first.')
  const entry = overlay.pending.find((item) => item.proposal.proposalId === options.proposalId || item.proposal.proposalId.startsWith(options.proposalId))
  if (!entry) throw new Error(`No pending enrichment proposal "${options.proposalId}".`)
  const { proposal } = entry
  if (options.by === 'policy') throw new Error(`${proposal.kind} requires a person; "policy" cannot approve it.`)
  if (options.by === proposal.origin.agentId) throw new Error(`Rejected: "${options.by}" proposed ${proposal.proposalId} and cannot approve its own output.`)
  if (options.snapshot) {
    const entity = options.snapshot.entities.find((item) => item.id === proposal.entity)
    if (!entity || entityContentHash(entity) !== proposal.targetContentHash) throw new Error(`Proposal ${proposal.proposalId} is stale: ${proposal.entity} changed since it was made. Re-run enrichment.`)
    if (effectiveEnrichment({ accepted: [{ proposal, acceptedAt: '1970-01-01T00:00:00.000Z', acceptedBy: options.by }] }, options.snapshot).live.length !== 1) throw new Error(`Proposal ${proposal.proposalId} names an entity that no longer exists.`)
  }

  const approvalId = enrichmentApprovalId(proposal.proposalId, proposal.targetContentHash)
  const loaded = options.gate ? { gate: options.gate, source: 'supplied' as const } : await loadApprovalGate(createFileApprovalStore(approvalsDir(options.root)))
  const existing = await loaded.gate.request({
    id: approvalId,
    name: ENRICHMENT_APPROVAL_GATE,
    payload: { proposalId: proposal.proposalId, targetContentHash: proposal.targetContentHash, kind: proposal.kind, entity: proposal.entity, policy: ENRICHMENT_POLICY[proposal.kind] },
  })
  if (existing.status !== 'pending') throw new Error(`Approval ${approvalId} was already ${existing.status}.`)
  const approval = await loaded.gate.decide(approvalId, options.decision, { by: options.by, proposalId: proposal.proposalId, targetContentHash: proposal.targetContentHash, ...(options.reason ? { reason: options.reason } : {}) })

  const pending = overlay.pending.filter((item) => item.proposal.proposalId !== proposal.proposalId)
  const decided: AcceptedEnrichment | RejectedEnrichment =
    options.decision === 'approved'
      ? { proposal, acceptedAt: approval.decidedAt ?? (options.now ?? (() => new Date().toISOString()))(), acceptedBy: options.by, approvalId }
      : { proposalId: proposal.proposalId, kind: proposal.kind, entity: proposal.entity, reason: 'human-rejected', detail: `${options.by}${options.reason ? `: ${options.reason}` : ''}`.slice(0, 1_024), origin: proposal.origin }
  const stats = { ...overlay.stats, byKind: { ...overlay.stats.byKind }, rejectionReasons: { ...overlay.stats.rejectionReasons } }
  const counts = { ...(stats.byKind[proposal.kind] ?? { proposed: 0, accepted: 0, pending: 0, rejected: 0 }) }
  counts.pending = Math.max(0, counts.pending - 1)
  if (options.decision === 'approved') counts.accepted += 1
  else {
    counts.rejected += 1
    stats.rejectionReasons['human-rejected'] = (stats.rejectionReasons['human-rejected'] ?? 0) + 1
  }
  stats.byKind[proposal.kind] = counts
  const next = sealEnrichmentOverlay({
    ...overlay,
    pending,
    accepted: options.decision === 'approved' ? [...overlay.accepted, decided as AcceptedEnrichment] : overlay.accepted,
    rejected: options.decision === 'rejected' ? [...overlay.rejected, decided as RejectedEnrichment] : overlay.rejected,
    stats,
  })
  writeEnrichmentOverlay(options.root, next)
  return { overlay: next, approvalId, entry: decided, gateSource: loaded.source }
}
