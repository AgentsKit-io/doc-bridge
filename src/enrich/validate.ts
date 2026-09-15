import { z } from 'zod'

import { sha256NormalizedV1 } from '../index-builder/content-hash.js'
import { jaroWinkler } from '../lib/fuzzy-match.js'
import { redactSecrets } from '../safety/repository.js'
import {
  ENRICHMENT_POLICY,
  EnrichmentAdjudicationV1Schema,
  EnrichmentOriginSchema,
  EnrichmentProposalV1Schema,
  enrichmentAdjudicationId,
  enrichmentProposalId,
  isEnrichmentKind,
  type AcceptedEnrichment,
  type EnrichmentAdjudicationV1,
  type EnrichmentProposalV1,
  type EnrichmentRejectionReason,
  type PendingEnrichment,
  type RejectedEnrichment,
} from '../schemas/enrichment.js'
import type { DiscoverySnapshotV1, Evidence, KnowledgeEntity, ReconciliationReportV1 } from '../schemas/knowledge.js'

/**
 * Deterministic validators: what a proposal must prove before anything stores it.
 *
 * The agent is untrusted by design. It may be wrong, it may be inventing, and it may be the
 * same model on a different day; the only thing that makes its output usable is that every
 * claim is checked against the artifacts it was given and against the kind's own rules, with no
 * judgement call anywhere in the path. Every check here has a name in the rejection list, so a
 * run can be graded — how many proposals were invented, how many collided — and two runs of the
 * validators over one stored overlay produce one partition.
 */

/** An alias closer than this to an existing name is a collision, not a synonym. */
export const ALIAS_COLLISION_THRESHOLD = 0.95

export type EnrichmentSnapshot = Pick<DiscoverySnapshotV1, 'contentHash' | 'entities' | 'relations'>

export type EnrichmentValidationContext = {
  readonly snapshot: EnrichmentSnapshot
  readonly report?: Pick<ReconciliationReportV1, 'diagnostics'>
  /** Entries already in the overlay: what a new proposal must not collide with. */
  readonly existing?: { readonly accepted?: readonly AcceptedEnrichment[]; readonly pending?: readonly PendingEnrichment[] }
}

export type EnrichmentVerdict =
  | { readonly status: 'accepted'; readonly proposal: EnrichmentProposalV1 }
  | { readonly status: 'pending'; readonly proposal: EnrichmentProposalV1; readonly note?: PendingEnrichment['note'] }
  | { readonly status: 'rejected'; readonly rejection: RejectedEnrichment }

export type EnrichmentPartition = {
  readonly accepted: readonly EnrichmentProposalV1[]
  readonly pending: readonly { readonly proposal: EnrichmentProposalV1; readonly note?: PendingEnrichment['note'] }[]
  readonly rejected: readonly RejectedEnrichment[]
}

const evidenceKey = (item: Evidence): string => `${item.source}:${item.path}:${item.lineStart ?? ''}:${item.lineEnd ?? ''}`

/**
 * The hash an entry binds to: the entity's file hash when it has one, otherwise a hash of the
 * entity as recorded — an area has no file, but it still has a content the proposal was about.
 */
export const entityContentHash = (entity: KnowledgeEntity): string =>
  entity.evidence[0]?.contentHash ?? sha256NormalizedV1({ id: entity.id, kind: entity.kind, path: entity.path ?? null, name: entity.name, metadata: entity.metadata ?? {} })

type Prepared = {
  readonly entities: ReadonlyMap<string, KnowledgeEntity>
  readonly evidenceKeys: ReadonlySet<string>
  readonly diagnosticIds: ReadonlySet<string>
  readonly observedRelations: ReadonlySet<string>
  readonly names: readonly { readonly entity: string; readonly value: string }[]
}

const prepared = new WeakMap<EnrichmentSnapshot, Prepared>()

const prepare = (context: EnrichmentValidationContext): Prepared => {
  const cached = prepared.get(context.snapshot)
  if (cached && !context.report) return cached
  const { snapshot } = context
  const entities = new Map(snapshot.entities.map((entity) => [entity.id, entity]))
  const evidenceKeys = new Set<string>()
  for (const entity of snapshot.entities) for (const item of entity.evidence) evidenceKeys.add(evidenceKey(item))
  for (const relation of snapshot.relations) for (const item of relation.evidence) evidenceKeys.add(evidenceKey(item))
  const diagnosticIds = new Set<string>()
  for (const diagnostic of context.report?.diagnostics ?? []) {
    diagnosticIds.add(diagnostic.id)
    for (const item of diagnostic.evidence) evidenceKeys.add(evidenceKey(item))
  }
  const observedRelations = new Set(snapshot.relations.map((relation) => `${relation.from}|${relation.kind}|${relation.to}`))
  const names: { entity: string; value: string }[] = []
  for (const entity of snapshot.entities) {
    names.push({ entity: entity.id, value: entity.id }, { entity: entity.id, value: entity.name })
    for (const alias of entity.aliases ?? []) names.push({ entity: entity.id, value: alias })
    // A title and a filename are names a reader already uses: an alias that shadows one resolves nothing new.
    if (typeof entity.metadata?.title === 'string') names.push({ entity: entity.id, value: entity.metadata.title })
    const stem = entity.path?.split('/').pop()?.replace(/\.[A-Za-z0-9]+$/, '')
    if (stem) names.push({ entity: entity.id, value: stem })
  }
  const value: Prepared = { entities, evidenceKeys, diagnosticIds, observedRelations, names }
  if (!context.report) prepared.set(context.snapshot, value)
  return value
}

const rejection = (raw: unknown, reason: EnrichmentRejectionReason, detail?: string): EnrichmentVerdict => {
  const record = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
  const origin = record.origin
  const parsedOrigin = origin && typeof origin === 'object' ? EnrichmentOriginSchema.safeParse(origin) : undefined
  return {
    status: 'rejected',
    rejection: {
      // A proposal that failed before it had an id still needs a stable one, so the same bad
      // output is the same rejection on the next run rather than a new line in the histogram.
      proposalId: typeof record.proposalId === 'string' && record.proposalId ? record.proposalId.slice(0, 128) : sha256NormalizedV1(raw ?? null),
      kind: typeof record.kind === 'string' && record.kind ? record.kind.slice(0, 128) : 'unknown',
      ...(typeof record.entity === 'string' && record.entity ? { entity: record.entity.slice(0, 256) } : {}),
      reason,
      ...(detail ? { detail: detail.slice(0, 1_024) } : {}),
      ...(parsedOrigin?.success ? { origin: parsedOrigin.data } : {}),
    },
  }
}

const pathInside = (path: string, entity: KnowledgeEntity): boolean =>
  entity.path !== undefined && (path === entity.path || path.startsWith(`${entity.path.replace(/\/$/, '')}/`))

const normalizeText = (value: string): string => value.trim().replace(/\s+/g, ' ').toLowerCase()

/** The per-kind rule. Returns a rejection, or the verdict the policy dictates. */
const validateKind = (proposal: EnrichmentProposalV1, ready: Prepared, context: EnrichmentValidationContext): EnrichmentVerdict => {
  const entity = ready.entities.get(proposal.entity) as KnowledgeEntity
  const accepted = context.existing?.accepted ?? []
  const pending = context.existing?.pending ?? []
  const decided = (verdict: 'accepted' | 'pending', note?: PendingEnrichment['note']): EnrichmentVerdict =>
    verdict === 'accepted' ? { status: 'accepted', proposal } : { status: 'pending', proposal, ...(note ? { note } : {}) }
  const byPolicy = ENRICHMENT_POLICY[proposal.kind] === 'human' ? 'pending' : 'accepted'

  switch (proposal.kind) {
    case 'classify-document': {
      if (entity.kind !== 'document') return rejection(proposal, 'entity-kind', `${proposal.entity} is a ${entity.kind}, not a document`)
      return decided(byPolicy)
    }
    case 'summarize': {
      if (redactSecrets(proposal.payload.summary) !== proposal.payload.summary) return rejection(proposal, 'redaction', 'summary contains a secret-shaped token')
      const current = typeof entity.metadata?.summary === 'string' ? entity.metadata.summary : undefined
      if (current !== undefined && normalizeText(current) === normalizeText(proposal.payload.summary)) return rejection(proposal, 'summary-unchanged')
      return decided(byPolicy)
    }
    case 'add-alias': {
      const alias = normalizeText(proposal.payload.alias)
      const candidates = [
        ...ready.names,
        ...accepted.filter((entry) => entry.proposal.kind === 'add-alias').map((entry) => ({ entity: entry.proposal.entity, value: (entry.proposal.payload as { alias: string }).alias })),
      ]
      const collision = candidates.find((candidate) => {
        const value = normalizeText(candidate.value)
        return value === alias || jaroWinkler(value, alias) >= ALIAS_COLLISION_THRESHOLD
      })
      if (collision) return rejection(proposal, 'alias-collision', `"${proposal.payload.alias}" collides with "${collision.value}" (${collision.entity})`)
      return decided(byPolicy)
    }
    case 'add-intent':
      return decided(byPolicy)
    case 'mark-canonical': {
      if (entity.kind !== 'document') return rejection(proposal, 'entity-kind', `${proposal.entity} is a ${entity.kind}, not a document`)
      if (!ready.entities.has(proposal.payload.scope)) return rejection(proposal, 'unknown-scope', proposal.payload.scope)
      const acceptedForScope = accepted.find(
        (entry) => entry.proposal.kind === 'mark-canonical' && (entry.proposal.payload as { scope: string }).scope === proposal.payload.scope && entry.proposal.entity !== proposal.entity,
      )
      if (acceptedForScope) return rejection(proposal, 'canonical-conflict', `${acceptedForScope.proposal.entity} is already canonical for ${proposal.payload.scope}`)
      const pendingForScope = pending.some(
        (entry) => entry.proposal.kind === 'mark-canonical' && (entry.proposal.payload as { scope: string }).scope === proposal.payload.scope && entry.proposal.entity !== proposal.entity,
      )
      return decided('pending', pendingForScope ? 'canonical-conflict' : undefined)
    }
    case 'propose-relation': {
      const { from, to, kind } = proposal.payload
      const fromEntity = ready.entities.get(from)
      const toEntity = ready.entities.get(to)
      if (!fromEntity || !toEntity) return rejection(proposal, 'unknown-endpoint', !fromEntity ? from : to)
      if (proposal.entity !== from && proposal.entity !== to) return rejection(proposal, 'unknown-endpoint', `${proposal.entity} is neither endpoint`)
      if (ready.observedRelations.has(`${from}|${kind}|${to}`)) return rejection(proposal, 'relation-already-observed')
      if (!proposal.evidence.every((item) => pathInside(item.path, fromEntity) || pathInside(item.path, toEntity))) return rejection(proposal, 'evidence-outside-endpoints')
      return decided(byPolicy)
    }
    case 'flag-contradiction': {
      const against = ready.entities.get(proposal.payload.against)
      if (!against) return rejection(proposal, 'unknown-endpoint', proposal.payload.against)
      const inEntity = proposal.evidence.some((item) => pathInside(item.path, entity))
      const inAgainst = proposal.evidence.some((item) => pathInside(item.path, against))
      if (!inEntity || !inAgainst) return rejection(proposal, 'evidence-missing-for-endpoint', !inEntity ? proposal.entity : proposal.payload.against)
      const disputed = pending.some(
        (entry) =>
          entry.proposal.kind === 'flag-contradiction' &&
          entry.proposal.entity === proposal.entity &&
          (entry.proposal.payload as { against: string }).against === proposal.payload.against &&
          entry.proposal.origin.agentId !== proposal.origin.agentId,
      )
      return decided('pending', disputed ? 'disputed-contradiction' : undefined)
    }
    case 'flag-redundancy': {
      const other = ready.entities.get(proposal.payload.with)
      if (!other) return rejection(proposal, 'unknown-endpoint', proposal.payload.with)
      if (entity.kind !== 'document' || other.kind !== 'document') return rejection(proposal, 'entity-kind', 'both entities must be documents')
      if (entityContentHash(entity) === entityContentHash(other)) return rejection(proposal, 'already-duplicate')
      return decided(byPolicy)
    }
    case 'flag-gap': {
      const area = ready.entities.get(proposal.payload.area)
      if (!area || area.kind !== 'area') return rejection(proposal, 'unknown-scope', proposal.payload.area)
      const covered = accepted.some(
        (entry) =>
          entry.proposal.kind === 'flag-gap' &&
          (entry.proposal.payload as { area: string }).area === proposal.payload.area &&
          normalizeText((entry.proposal.payload as { missing: string }).missing) === normalizeText(proposal.payload.missing),
      )
      if (covered) return rejection(proposal, 'already-covered')
      return decided(byPolicy)
    }
    case 'rank-hint':
      return decided(byPolicy)
    case 'suggest-area': {
      const paths = [...ready.entities.values()].flatMap((item) => (item.path ? [item.path] : []))
      const areas = [...ready.entities.values()].filter((item) => item.kind === 'area' && item.path)
      for (const directory of proposal.payload.directories) {
        const clean = directory.replace(/\/$/, '')
        if (!paths.some((path) => path === clean || path.startsWith(`${clean}/`))) return rejection(proposal, 'unknown-directory', directory)
        const overlap = areas.find((area) => area.path === clean || area.path?.startsWith(`${clean}/`) || clean.startsWith(`${area.path}/`))
        if (overlap) return rejection(proposal, 'area-overlap', `${directory} overlaps ${overlap.id}`)
      }
      return decided(byPolicy)
    }
  }
}

/**
 * Validate one raw proposal at the boundary.
 *
 * Envelope first — kind, schema, evidence, entity, hashes, identity — then the kind's own rule.
 * A rejection names the first thing that failed; a proposal that fails the envelope never
 * reaches a kind validator, so a kind validator can assume its entity exists.
 */
export const validateEnrichmentProposal = (raw: unknown, context: EnrichmentValidationContext): EnrichmentVerdict => {
  const record = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : undefined
  if (!record) return rejection(raw, 'schema', 'proposal is not an object')
  if (!isEnrichmentKind(record.kind)) return rejection(raw, 'invalid-kind', typeof record.kind === 'string' ? record.kind : 'missing kind')
  if (!Array.isArray(record.evidence) || record.evidence.length === 0) return rejection(raw, 'no-evidence')
  const parsed = EnrichmentProposalV1Schema.safeParse(raw)
  if (!parsed.success) return rejection(raw, 'schema', parsed.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`).join('; '))
  const proposal = parsed.data
  const ready = prepare(context)

  if (proposal.baseSnapshotHash !== context.snapshot.contentHash) return rejection(proposal, 'base-snapshot-mismatch')
  const entity = ready.entities.get(proposal.entity)
  if (!entity) return rejection(proposal, 'unknown-entity', proposal.entity)
  if (entityContentHash(entity) !== proposal.targetContentHash) return rejection(proposal, 'stale-target', `${proposal.entity} changed since the proposal was made`)
  const unknownDiagnostic = (proposal.relatedDiagnosticIds ?? []).find((id) => !ready.diagnosticIds.has(id))
  if (unknownDiagnostic) return rejection(proposal, 'unknown-diagnostic', unknownDiagnostic)
  const outside = proposal.evidence.find((item) => !ready.evidenceKeys.has(evidenceKey(item)))
  if (outside) return rejection(proposal, 'evidence-outside-artifacts', evidenceKey(outside))
  if (proposal.proposalId !== enrichmentProposalId(proposal)) return rejection(proposal, 'proposal-id-mismatch')

  return validateKind(proposal, ready, context)
}

/**
 * Validate a batch and partition it.
 *
 * Each verdict is made against the context plus what the batch has already decided, in a fixed
 * order (by proposal id), so two proposals for the same slot resolve the same way every run: the
 * first survives, the second collides. A proposal already decided in the stored overlay keeps its
 * decision — an accepted entry is not re-accepted, a pending one not re-requested.
 */
export const partitionEnrichmentProposals = (raws: readonly unknown[], context: EnrichmentValidationContext): EnrichmentPartition => {
  const ordered = [...raws].sort((left, right) => sha256NormalizedV1(left ?? null).localeCompare(sha256NormalizedV1(right ?? null)))
  const accepted: EnrichmentProposalV1[] = []
  const pending: { proposal: EnrichmentProposalV1; note?: PendingEnrichment['note'] }[] = []
  const rejected: RejectedEnrichment[] = []
  const seen = new Set<string>([
    ...(context.existing?.accepted ?? []).map((entry) => entry.proposal.proposalId),
    ...(context.existing?.pending ?? []).map((entry) => entry.proposal.proposalId),
  ])
  // Verdicts inside the batch see earlier verdicts in the batch: the merge is what must be consistent.
  const running = {
    accepted: [...(context.existing?.accepted ?? [])],
    pending: [...(context.existing?.pending ?? [])],
  }
  for (const raw of ordered) {
    // The same proposal twice — a cached pack next to a fresh one — is one proposal, decided once.
    const claimedId = raw && typeof raw === 'object' ? (raw as { proposalId?: unknown }).proposalId : undefined
    if (typeof claimedId === 'string' && seen.has(claimedId)) continue
    const verdict = validateEnrichmentProposal(raw, { ...context, existing: running })
    if (verdict.status === 'rejected') {
      rejected.push(verdict.rejection)
      continue
    }
    if (seen.has(verdict.proposal.proposalId)) continue
    seen.add(verdict.proposal.proposalId)
    if (verdict.status === 'accepted') {
      accepted.push(verdict.proposal)
      running.accepted.push({ proposal: verdict.proposal, acceptedAt: '1970-01-01T00:00:00.000Z', acceptedBy: 'policy' })
    } else {
      pending.push({ proposal: verdict.proposal, ...(verdict.note ? { note: verdict.note } : {}) })
      running.pending.push({ proposal: verdict.proposal, approvalId: '0'.repeat(64), ...(verdict.note ? { note: verdict.note } : {}) })
      /*
       * A second canonical marker for one scope makes the first one conflicted too: the
       * conflict is a property of the pair, and the adjudicator must see both.
       */
      if (verdict.note === 'canonical-conflict') {
        const scope = (verdict.proposal.payload as { scope: string }).scope
        for (const entry of pending) {
          if (entry.proposal.kind === 'mark-canonical' && (entry.proposal.payload as { scope: string }).scope === scope) entry.note = 'canonical-conflict'
        }
      }
    }
  }
  const byId = (left: { proposalId: string }, right: { proposalId: string }): number => left.proposalId.localeCompare(right.proposalId)
  return {
    accepted: accepted.sort(byId),
    pending: pending.sort((left, right) => byId(left.proposal, right.proposal)),
    rejected: rejected.sort(byId),
  }
}

/**
 * Re-run the validators over a stored overlay.
 *
 * Reproducibility is the guardrail: the partition an overlay records must be the partition the
 * validators produce from its proposals against the same snapshot. Anything else means the
 * overlay was edited by hand, or the validators changed under it, and either way the file is
 * not evidence of a decision any more.
 */
export const revalidateEnrichmentOverlay = (
  overlay: { readonly accepted: readonly AcceptedEnrichment[]; readonly pending: readonly PendingEnrichment[] },
  context: Omit<EnrichmentValidationContext, 'existing'>,
): { readonly accepted: readonly string[]; readonly pending: readonly string[]; readonly rejected: readonly RejectedEnrichment[] } => {
  const partition = partitionEnrichmentProposals(
    [...overlay.accepted.map((entry) => entry.proposal), ...overlay.pending.map((entry) => entry.proposal)],
    context,
  )
  return {
    accepted: partition.accepted.map((proposal) => proposal.proposalId),
    pending: partition.pending.map((entry) => entry.proposal.proposalId),
    rejected: partition.rejected,
  }
}

export type AdjudicationVerdict =
  | { readonly status: 'accepted'; readonly adjudication: EnrichmentAdjudicationV1 }
  | { readonly status: 'rejected'; readonly reason: EnrichmentRejectionReason; readonly detail?: string }

/**
 * Validate an adjudication against the pending entries it claims to judge.
 *
 * The one rule that cannot be configured away: an agent may not judge its own proposal. An
 * adjudication whose origin matches any judged proposal's origin is rejected outright, whatever
 * the roles say — a different role name over the same identity is still the same agent.
 */
export const validateEnrichmentAdjudication = (raw: unknown, pending: readonly PendingEnrichment[]): AdjudicationVerdict => {
  const parsed = EnrichmentAdjudicationV1Schema.safeParse(raw)
  if (!parsed.success) return { status: 'rejected', reason: 'schema', detail: parsed.error.issues.map((issue) => issue.message).join('; ') }
  const adjudication = parsed.data
  if (adjudication.adjudicationId !== enrichmentAdjudicationId(adjudication)) return { status: 'rejected', reason: 'proposal-id-mismatch' }
  const byId = new Map(pending.map((entry) => [entry.proposal.proposalId, entry]))
  for (const id of adjudication.judges) {
    const entry = byId.get(id)
    if (!entry) return { status: 'rejected', reason: 'unknown-entity', detail: `${id} is not pending` }
    if (entry.proposal.origin.agentId === adjudication.origin.agentId) return { status: 'rejected', reason: 'self-adjudication', detail: `${adjudication.origin.agentId} judged its own proposal ${id}` }
  }
  return { status: 'accepted', adjudication }
}

/**
 * Apply an adjudication to the pending set: the losers are rejected as `adjudicated`, the
 * survivors stay pending with their conflict note cleared. Nothing an agent decides becomes
 * accepted — the winner still waits for the person the kind's policy requires.
 */
export const applyEnrichmentAdjudication = (
  pending: readonly PendingEnrichment[],
  adjudication: EnrichmentAdjudicationV1,
): { readonly pending: PendingEnrichment[]; readonly rejected: RejectedEnrichment[] } => {
  const keep = new Set(adjudication.keep)
  const judged = new Set(adjudication.judges)
  const next: PendingEnrichment[] = []
  const rejected: RejectedEnrichment[] = []
  for (const entry of pending) {
    if (!judged.has(entry.proposal.proposalId)) {
      next.push(entry)
      continue
    }
    if (keep.has(entry.proposal.proposalId)) {
      const { note: _note, ...rest } = entry
      next.push(rest)
      continue
    }
    rejected.push({
      proposalId: entry.proposal.proposalId,
      kind: entry.proposal.kind,
      entity: entry.proposal.entity,
      reason: 'adjudicated',
      detail: `${adjudication.origin.agentId}: ${adjudication.reason}`.slice(0, 1_024),
      origin: entry.proposal.origin,
    })
  }
  return { pending: next, rejected }
}

/** Shared by the schema tests: the strict parser for one proposal, for callers that already know the kind. */
export const parseEnrichmentProposal = (raw: unknown): EnrichmentProposalV1 => EnrichmentProposalV1Schema.parse(raw)

export const EnrichmentProposalListSchema = z.array(z.unknown()).max(1_024)
