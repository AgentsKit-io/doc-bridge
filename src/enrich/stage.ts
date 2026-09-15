import { basename, resolve } from 'node:path'

import { DEFAULT_REGISTRY_AGENT_ID, createRegistryAgentAdapter, loadRegistryAgentMetadata, loadRegistryAgentRunner, type RegistryAgentAdapter, type RegistryAgentRunner } from '../agents/registry-adapter.js'
import type { DocBridgeConfigV1 } from '../config/schema.js'
import { sha256NormalizedV1 } from '../index-builder/content-hash.js'
import {
  ENRICHMENT_POLICY,
  ENRICHMENT_SCHEMA_VERSION,
  type AcceptedEnrichment,
  type EnrichmentOverlayV1,
  type EnrichmentStats,
  type PendingEnrichment,
  type RejectedEnrichment,
} from '../schemas/enrichment.js'
import type { DiscoverySnapshotV1, ReconciliationReportV1 } from '../schemas/knowledge.js'
import { approvalsDir, createFileApprovalStore, enrichmentApprovalId, loadApprovalGate, ENRICHMENT_APPROVAL_GATE, type ApprovalGate } from './approvals.js'
import { createEnrichmentCache, type EnrichmentCache } from './cache.js'
import { batchContextPacks, buildContextPacks, type ContextPack, type EnrichmentTask } from './context-pack.js'
import { effectiveEnrichment, readEnrichmentOverlay, sealEnrichmentOverlay, writeEnrichmentOverlay } from './overlay.js'
import { applyEnrichmentAdjudication, partitionEnrichmentProposals, validateEnrichmentAdjudication } from './validate.js'

/**
 * The enrich stage: packs out, proposals in, validators between, an overlay at the end.
 *
 * It runs only when asked — `ak-docs enrich`, `check --enrich` — and never sits on the path of
 * `check`, `index`, `search` or `query`. What it writes is advisory until a validator or a person
 * accepts it, expires with the entity it describes, and adds to the observed graph without ever
 * subtracting from it. Its cost is proportional to what changed: a pack whose hash has not moved
 * is answered by the cache, so an unchanged repository makes no agent call at all.
 */

export type EnrichmentRole = 'curator' | 'reviewer' | 'adjudicator'

export const ROLE_TASK: Readonly<Record<EnrichmentRole, EnrichmentTask>> = { curator: 'curate', reviewer: 'review', adjudicator: 'adjudicate' }

/** What each role is for. The curator reads documents; the reviewer reads structure. */
export const ROLE_TARGET_KINDS: Readonly<Record<Exclude<EnrichmentRole, 'adjudicator'>, readonly string[]>> = {
  curator: ['document'],
  reviewer: ['document', 'area'],
}

export type ResolvedRole = { readonly role: EnrichmentRole; readonly agentId: string; readonly promptVersion: string }

/**
 * Roles from configuration. The default is the configured agent as curator only — the existing
 * corpus scanner, doing the one job it did before, over packs instead of the snapshot.
 */
export const resolveEnrichmentRoles = (config: DocBridgeConfigV1): readonly ResolvedRole[] => {
  const registry = config.intelligence?.registry
  const defaultAgent = registry?.agentId ?? DEFAULT_REGISTRY_AGENT_ID
  const configured = registry?.roles
  const roles: ResolvedRole[] = []
  const add = (role: EnrichmentRole, enabledByDefault: boolean): void => {
    const setting = configured?.[role]
    const enabled = setting?.enabled ?? (setting ? true : enabledByDefault)
    if (!enabled) return
    roles.push({ role, agentId: setting?.agentId ?? defaultAgent, promptVersion: setting?.promptVersion ?? '1' })
  }
  add('curator', true)
  add('reviewer', false)
  add('adjudicator', false)
  const adjudicator = roles.find((item) => item.role === 'adjudicator')
  if (adjudicator && roles.some((item) => item.role !== 'adjudicator' && item.agentId === adjudicator.agentId)) {
    throw new Error(`The adjudicator must be a different agent identity from the curator and the reviewer; "${adjudicator.agentId}" plays both.`)
  }
  return roles
}

/** The seam the stage calls an agent through. The CLI wires the Registry adapter; a test wires a function. */
export type EnrichmentAgent = (input: { readonly role: ResolvedRole; readonly task: EnrichmentTask; readonly packs: readonly ContextPack[]; readonly agentVersion: string }) => Promise<readonly unknown[]>

export type EnrichmentRunOptions = {
  readonly root: string
  readonly config: DocBridgeConfigV1
  readonly snapshot: DiscoverySnapshotV1
  readonly report: ReconciliationReportV1
  /** Replaces the Registry adapter. `agentVersion` is what the cache and the origin check use. */
  readonly agent?: { readonly call: EnrichmentAgent; readonly version: (role: ResolvedRole) => string }
  readonly cache?: EnrichmentCache
  readonly gate?: ApprovalGate
  /** File contents by path, for packs. Defaults to reading under `root`. */
  readonly readFile?: (path: string) => string | undefined
  readonly now?: () => string
  /** Persist the overlay under `.doc-bridge/enrich/`. Default true. */
  readonly write?: boolean
}

export type EnrichmentRunResult = {
  readonly overlay: EnrichmentOverlayV1
  readonly overlayPath?: string
  readonly agentCalls: number
  readonly cacheHits: number
  readonly packs: number
  /** Target ids whose packs were sent to an agent this run. */
  readonly rerun: readonly string[]
  readonly expired: number
  readonly roles: readonly ResolvedRole[]
}

const emptyStats = (): EnrichmentStats => ({ byKind: {}, rejectionReasons: {}, agentRuns: 0, cacheHits: 0, packs: 0, inputBytes: 0, outputBytes: 0, expired: 0 })

const configWithAgent = (config: DocBridgeConfigV1, agentId: string): DocBridgeConfigV1 => ({
  ...config,
  intelligence: { ...(config.intelligence ?? {}), registry: { ...(config.intelligence?.registry ?? {}), agentId } },
})

/** One adapter per role, each loading its own installed agent. Created lazily: a role with nothing to do costs nothing. */
const registryAgent = async (root: string, config: DocBridgeConfigV1): Promise<NonNullable<EnrichmentRunOptions['agent']>> => {
  const adapters = new Map<string, RegistryAgentAdapter>()
  const adapterFor = async (agentId: string): Promise<RegistryAgentAdapter> => {
    const known = adapters.get(agentId)
    if (known) return known
    const scoped = configWithAgent(config, agentId)
    const runner: RegistryAgentRunner | undefined = scoped.intelligence?.registry?.cli ? undefined : await loadRegistryAgentRunner(root, scoped)
    const adapter = createRegistryAgentAdapter(root, scoped, runner)
    adapters.set(agentId, adapter)
    return adapter
  }
  return {
    call: async ({ role, task, packs }) => (await adapterFor(role.agentId)).enrich(task, packs, { role: role.role, promptVersion: role.promptVersion }),
    version: (role) => loadRegistryAgentMetadata(resolve(root), configWithAgent(config, role.agentId)).version,
  }
}

const overlayBase = (options: EnrichmentRunOptions): Omit<EnrichmentOverlayV1, 'contentHash' | 'accepted' | 'pending' | 'rejected' | 'stats'> => ({
  type: 'enrichment-overlay',
  schemaVersion: ENRICHMENT_SCHEMA_VERSION,
  contentHashAlgo: 'sha256-normalized-v1',
  project: options.snapshot.project,
  sourceRevision: options.snapshot.sourceRevision,
  sourceRevisionKind: options.snapshot.sourceRevisionKind,
  configurationHash: options.snapshot.configurationHash,
  pipelineVersion: options.snapshot.pipelineVersion,
  analyzerVersions: options.snapshot.analyzerVersions,
  baseSnapshotHash: options.snapshot.contentHash,
})

/** Which pack a proposal belongs to: the one whose target it names. Anything else was not asked about. */
const attribute = (proposals: readonly unknown[], packs: readonly ContextPack[]): { readonly byPack: Map<string, unknown[]>; readonly stray: unknown[] } => {
  const byPack = new Map<string, unknown[]>(packs.map((pack) => [pack.target.id, []]))
  const stray: unknown[] = []
  for (const proposal of proposals) {
    const entity = proposal && typeof proposal === 'object' ? (proposal as { entity?: unknown }).entity : undefined
    const list = typeof entity === 'string' ? byPack.get(entity) : undefined
    if (list) list.push(proposal)
    else stray.push(proposal)
  }
  return { byPack, stray }
}

/**
 * Run enrichment over a snapshot and report.
 *
 * 1. Build packs for every role's target kinds; batch by area.
 * 2. Answer each pack from the cache or from the agent, caching what the agent said per pack —
 *    including nothing, so silence is not asked for twice.
 * 3. Validate everything through the partition, against the snapshot, the report and the
 *    overlay already on disk; policy kinds are accepted, human kinds requested from the gate.
 * 4. Adjudicate what two roles could not settle, if a third identity is configured.
 * 5. Merge with the stored overlay — decisions people made survive while their target does —
 *    seal, write.
 */
export const runEnrichment = async (options: EnrichmentRunOptions): Promise<EnrichmentRunResult> => {
  const { root, config, snapshot, report } = options
  if (!config.intelligence?.registry?.enabled) throw new Error('Registry agents are disabled. Set intelligence.registry.enabled: true to run enrichment.')
  const roles = resolveEnrichmentRoles(config)
  const now = options.now ?? (() => new Date().toISOString())
  const cache = options.cache ?? createEnrichmentCache(root)
  const agent = options.agent ?? (await registryAgent(root, config))
  const gate = options.gate ?? (await loadApprovalGate(createFileApprovalStore(approvalsDir(root)))).gate
  const previous = readEnrichmentOverlay(root)

  // What the stored overlay still says about this snapshot. Expired entries leave here, never on a read.
  const { live, expired } = previous ? effectiveEnrichment(previous, snapshot) : { live: [], expired: [] }
  const existingAccepted: AcceptedEnrichment[] = [...live]
  const existingPending: PendingEnrichment[] = (previous?.pending ?? []).filter((entry) => {
    const entity = snapshot.entities.find((item) => item.id === entry.proposal.entity)
    return entity !== undefined && effectiveEnrichment({ accepted: [{ ...entry, acceptedAt: now(), acceptedBy: 'policy' }] }, snapshot).live.length === 1
  })
  // A decision that settled a proposal — a person's, or an adjudicator's — is not reopened by the cache replaying it.
  const settled = (previous?.rejected ?? []).filter((entry) => entry.reason === 'human-rejected' || entry.reason === 'adjudicated')
  const humanRejected = new Set(settled.map((entry) => entry.proposalId))

  const stats = emptyStats()
  stats.expired = expired.length
  const rerun: string[] = []
  const raw: unknown[] = []
  const strayRejections: RejectedEnrichment[] = []
  const versions = new Map<string, string>()
  const versionOf = (role: ResolvedRole): string => {
    const known = versions.get(role.agentId)
    if (known) return known
    const version = agent.version(role)
    versions.set(role.agentId, version)
    return version
  }

  for (const role of roles) {
    if (role.role === 'adjudicator') continue
    const task = ROLE_TASK[role.role]
    const packs = buildContextPacks({ snapshot, report, config, kinds: ROLE_TARGET_KINDS[role.role], root, ...(options.readFile ? { readFile: options.readFile } : {}) })
    stats.packs += packs.length
    const agentVersion = versionOf(role)
    for (const batch of batchContextPacks(packs)) {
      const keyFor = (pack: ContextPack) => ({ task, agentId: role.agentId, agentVersion, promptVersion: role.promptVersion, packHash: pack.packHash })
      const needed: ContextPack[] = []
      for (const pack of batch.packs) {
        const cached = cache.read(keyFor(pack))
        if (cached) {
          stats.cacheHits += 1
          raw.push(...cached)
        } else needed.push(pack)
      }
      if (!needed.length) continue
      stats.agentRuns += 1
      stats.inputBytes += Buffer.byteLength(JSON.stringify(needed), 'utf8')
      const answered = await agent.call({ role, task, packs: needed, agentVersion })
      stats.outputBytes += Buffer.byteLength(JSON.stringify(answered), 'utf8')
      const { byPack, stray } = attribute(answered, needed)
      for (const pack of needed) {
        const proposals = byPack.get(pack.target.id) ?? []
        cache.write(keyFor(pack), proposals)
        raw.push(...proposals)
        rerun.push(pack.target.id)
      }
      for (const proposal of stray) {
        const record = proposal && typeof proposal === 'object' ? (proposal as Record<string, unknown>) : {}
        strayRejections.push({
          proposalId: typeof record.proposalId === 'string' && record.proposalId ? record.proposalId : sha256NormalizedV1(proposal ?? null),
          kind: typeof record.kind === 'string' && record.kind ? record.kind : 'unknown',
          ...(typeof record.entity === 'string' && record.entity ? { entity: record.entity } : {}),
          reason: 'entity-outside-pack',
        })
      }
    }
  }

  /*
   * Origin must be a role that was asked: a proposal claiming another agent's identity is that
   * agent's to make. A proposal with no origin at all goes on to the validators, which name what
   * is wrong with it — an unknown kind is `invalid-kind` before it is anything else.
   */
  const roleIds = new Set(roles.map((role) => role.agentId))
  const identityChecked = raw.filter((proposal) => {
    const origin = proposal && typeof proposal === 'object' ? (proposal as { origin?: { agentId?: unknown } }).origin : undefined
    const claimed = typeof origin?.agentId === 'string' ? origin.agentId : undefined
    if (claimed === undefined || roleIds.has(claimed)) return true
    strayRejections.push({ proposalId: sha256NormalizedV1(proposal ?? null), kind: 'unknown', reason: 'schema', detail: `origin.agentId "${claimed}" is not a configured role` })
    return false
  })

  const partition = partitionEnrichmentProposals(identityChecked, { snapshot, report, existing: { accepted: existingAccepted, pending: existingPending } })

  const acceptedAt = now()
  const accepted: AcceptedEnrichment[] = [
    ...existingAccepted,
    ...partition.accepted.filter((proposal) => !humanRejected.has(proposal.proposalId)).map((proposal) => ({ proposal, acceptedAt, acceptedBy: 'policy' })),
  ]
  let pending: PendingEnrichment[] = [
    ...existingPending,
    ...partition.pending
      .filter((entry) => !humanRejected.has(entry.proposal.proposalId))
      .map((entry) => ({ proposal: entry.proposal, approvalId: enrichmentApprovalId(entry.proposal.proposalId, entry.proposal.targetContentHash), ...(entry.note ? { note: entry.note } : {}) })),
  ]
  const rejected: RejectedEnrichment[] = [
    ...partition.rejected,
    ...strayRejections,
    ...settled,
    ...expired.map((entry) => ({ proposalId: entry.proposal.proposalId, kind: entry.proposal.kind, entity: entry.proposal.entity, reason: 'expired' as const, origin: entry.proposal.origin })),
  ]

  // Every pending entry has an approval record waiting for a person. Requesting is idempotent.
  for (const entry of pending) {
    await gate.request({
      id: entry.approvalId,
      name: ENRICHMENT_APPROVAL_GATE,
      payload: { proposalId: entry.proposal.proposalId, targetContentHash: entry.proposal.targetContentHash, kind: entry.proposal.kind, entity: entry.proposal.entity, policy: ENRICHMENT_POLICY[entry.proposal.kind] },
    })
  }

  // Adjudication: only for what two roles could not settle, only by a third identity.
  const adjudicator = roles.find((role) => role.role === 'adjudicator')
  const disputed = pending.filter((entry) => entry.note !== undefined)
  if (adjudicator && disputed.length) {
    const targets = new Set(disputed.map((entry) => entry.proposal.entity))
    const packs = buildContextPacks({ snapshot, report, config, kinds: ['document', 'area', 'module', 'package'], targets, root, ...(options.readFile ? { readFile: options.readFile } : {}) })
    const disputes = disputed.map((entry) => ({ proposal: entry.proposal, note: entry.note }))
    const packHash = sha256NormalizedV1({ packs: packs.map((pack) => pack.packHash), disputes: disputes.map((item) => item.proposal.proposalId) })
    const key = { task: 'adjudicate' as const, agentId: adjudicator.agentId, agentVersion: versionOf(adjudicator), promptVersion: adjudicator.promptVersion, packHash }
    let verdicts = cache.read(key)
    if (verdicts) stats.cacheHits += 1
    else {
      stats.agentRuns += 1
      const payload = [...packs, { type: 'adjudication-request', disputes }] as unknown as readonly ContextPack[]
      verdicts = await agent.call({ role: adjudicator, task: 'adjudicate', packs: payload, agentVersion: key.agentVersion })
      cache.write(key, verdicts)
    }
    for (const verdict of verdicts) {
      const checked = validateEnrichmentAdjudication(verdict, pending)
      if (checked.status === 'rejected') {
        rejected.push({ proposalId: sha256NormalizedV1(verdict ?? null), kind: 'enrichment-adjudication', reason: checked.reason, ...(checked.detail ? { detail: checked.detail } : {}) })
        continue
      }
      const applied = applyEnrichmentAdjudication(pending, checked.adjudication)
      pending = applied.pending
      rejected.push(...applied.rejected)
    }
  }

  for (const entry of accepted) count(stats, entry.proposal.kind, 'accepted')
  for (const entry of pending) count(stats, entry.proposal.kind, 'pending')
  for (const entry of rejected) {
    count(stats, entry.kind, 'rejected')
    stats.rejectionReasons[entry.reason] = (stats.rejectionReasons[entry.reason] ?? 0) + 1
  }
  stats.byKind = Object.fromEntries(Object.entries(stats.byKind).sort(([left], [right]) => left.localeCompare(right)))
  stats.rejectionReasons = Object.fromEntries(Object.entries(stats.rejectionReasons).sort(([left], [right]) => left.localeCompare(right)))

  const overlay = sealEnrichmentOverlay({ ...overlayBase(options), accepted, pending, rejected, stats })
  const overlayPath = options.write === false ? undefined : writeEnrichmentOverlay(root, overlay)
  return { overlay, ...(overlayPath ? { overlayPath } : {}), agentCalls: stats.agentRuns, cacheHits: stats.cacheHits, packs: stats.packs, rerun: [...new Set(rerun)].sort(), expired: expired.length, roles }
}

const count = (stats: EnrichmentStats, kind: string, bucket: 'accepted' | 'pending' | 'rejected'): void => {
  const current = stats.byKind[kind] ?? { proposed: 0, accepted: 0, pending: 0, rejected: 0 }
  current[bucket] += 1
  current.proposed += 1
  stats.byKind[kind] = current
}

/** A human-readable line per stat, for `--text`. */
export const formatEnrichmentText = (result: EnrichmentRunResult): string[] => {
  const { overlay } = result
  return [
    `Roles: ${result.roles.map((role) => `${role.role}=${role.agentId}`).join(', ')}`,
    `Packs: ${result.packs} (agent calls ${result.agentCalls}, cache hits ${result.cacheHits}, re-run ${result.rerun.length})`,
    `Accepted: ${overlay.accepted.length}  Pending: ${overlay.pending.length}  Rejected: ${overlay.rejected.length}  Expired: ${result.expired}`,
    ...Object.entries(overlay.stats.byKind).map(([kind, counts]) => `  ${kind}: accepted ${counts.accepted}, pending ${counts.pending}, rejected ${counts.rejected}`),
    `Overlay: ${overlay.contentHash}${result.overlayPath ? ` (${basename(result.overlayPath)})` : ''}`,
  ]
}
