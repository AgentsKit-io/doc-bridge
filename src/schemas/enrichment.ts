import { z } from 'zod'

import { sha256NormalizedV1 } from '../index-builder/content-hash.js'
import { EvidenceSchema, ProjectIdentitySchema, type Evidence } from './knowledge.js'

/**
 * Typed enrichment proposals and the overlay that stores what became of them.
 *
 * `AgentProposalV1` could say "review this finding"; it could not say that a document is
 * canonical for an area, that an alias should resolve to an entity, or that a relation exists
 * with a given confidence. Each of those is a different claim with a different validator and a
 * different acceptance policy, so each is its own kind here, and the union is closed: a kind
 * this file does not know is rejected as `invalid-kind` rather than carried along.
 *
 * Nothing in an overlay is authority. An accepted entry is layered over the observed snapshot
 * at projection time, bound to the content hash of the entity it describes, and expires the
 * moment that hash moves. No entry can delete or alter an observed fact.
 */

export const ENRICHMENT_SCHEMA_VERSION = 1 as const

const hash = z.string().regex(/^[a-f0-9]{64}$/)
const boundedString = (max: number) => z.string().min(1).max(max)
const entityRef = boundedString(256)
/** A BCP 47-shaped language tag: `en`, `pt-BR`. Presence is what the validators check; this keeps it a tag. */
const languageTag = z.string().regex(/^[a-z]{2,3}(?:-[A-Za-z0-9]{2,8})*$/)

export const ENRICHMENT_KINDS = [
  'classify-document',
  'summarize',
  'add-alias',
  'add-intent',
  'mark-canonical',
  'propose-relation',
  'flag-contradiction',
  'flag-redundancy',
  'flag-gap',
  'rank-hint',
  'suggest-area',
] as const
export type EnrichmentKind = (typeof ENRICHMENT_KINDS)[number]

/**
 * What acceptance means per kind.
 *
 * `policy`: low-risk, reversible, and expiring with its target — accepted by the validators.
 * `human`: structural — a relation, a canonical marker, a conflict — held for a person.
 * `finding`: accepted by policy, but only ever as a finding to review, never as a fact the
 * projection ranks on.
 */
export type EnrichmentPolicy = 'policy' | 'human' | 'finding'

export const ENRICHMENT_POLICY: Readonly<Record<EnrichmentKind, EnrichmentPolicy>> = {
  'classify-document': 'policy',
  summarize: 'policy',
  'add-alias': 'policy',
  'add-intent': 'policy',
  'mark-canonical': 'human',
  'propose-relation': 'human',
  'flag-contradiction': 'human',
  'flag-redundancy': 'human',
  'flag-gap': 'finding',
  'rank-hint': 'policy',
  'suggest-area': 'human',
}

export const isEnrichmentKind = (value: unknown): value is EnrichmentKind =>
  typeof value === 'string' && (ENRICHMENT_KINDS as readonly string[]).includes(value)

/** Relation kinds an agent may propose. Structural kinds the analyzers observe are not for an agent to assert. */
export const PROPOSABLE_RELATION_KINDS = ['covers', 'mentions', 'links-to', 'depends-on', 'related-to', 'documents'] as const

export const EnrichmentOriginSchema = z
  .object({
    agentId: boundedString(256),
    agentVersion: boundedString(64),
    promptVersion: boundedString(64),
    model: boundedString(256).optional(),
    provider: boundedString(128).optional(),
  })
  .strict()
export type EnrichmentOrigin = z.infer<typeof EnrichmentOriginSchema>

export const DocumentTypeSchema = z.enum(['guide', 'reference', 'runbook', 'adr', 'spec', 'index', 'changelog', 'policy', 'other'])
export const DocumentAudienceSchema = z.enum(['agent', 'human', 'human-and-agent'])
export const DocumentLifecycleSchema = z.enum(['draft', 'active', 'deprecated', 'archived'])
export const DocumentCriticalitySchema = z.enum(['tier-0', 'tier-1', 'tier-2'])

export const SUMMARY_MAX = 400
export const ALIAS_MAX = 64
export const INTENT_MAX = 120

const payloads = {
  'classify-document': z
    .object({ type: DocumentTypeSchema, audience: DocumentAudienceSchema, lifecycle: DocumentLifecycleSchema, criticality: DocumentCriticalitySchema })
    .strict(),
  summarize: z.object({ summary: boundedString(SUMMARY_MAX), language: languageTag }).strict(),
  'add-alias': z.object({ alias: boundedString(ALIAS_MAX) }).strict(),
  'add-intent': z.object({ phrase: boundedString(INTENT_MAX), language: languageTag }).strict(),
  'mark-canonical': z.object({ scope: entityRef }).strict(),
  'propose-relation': z
    .object({ from: entityRef, to: entityRef, kind: z.enum(PROPOSABLE_RELATION_KINDS), detection: boundedString(512) })
    .strict(),
  'flag-contradiction': z.object({ against: entityRef, claim: boundedString(1_000), observed: boundedString(1_000) }).strict(),
  'flag-redundancy': z.object({ with: entityRef }).strict(),
  'flag-gap': z.object({ area: entityRef, missing: boundedString(1_000) }).strict(),
  'rank-hint': z.object({ relevance: z.enum(['strong', 'weak']) }).strict(),
  'suggest-area': z.object({ directories: z.array(boundedString(512)).min(1).max(32), name: boundedString(128) }).strict(),
} as const

export type EnrichmentPayloads = { readonly [K in EnrichmentKind]: z.infer<(typeof payloads)[K]> }

const envelope = {
  type: z.literal('enrichment-proposal'),
  schemaVersion: z.literal(ENRICHMENT_SCHEMA_VERSION),
  /** Content-derived: see `enrichmentProposalId`. A re-run over the same inputs produces the same id. */
  proposalId: hash,
  /** The entity the claim is about. It must exist in the snapshot the proposal was made against. */
  entity: entityRef,
  /** The entity's content hash when the proposal was made. The entry expires when this moves. */
  targetContentHash: hash,
  confidence: z.number().min(0).max(1),
  reason: boundedString(1_000),
  /** At least one item, and every item must be present in the supplied snapshot or report. */
  evidence: z.array(EvidenceSchema).min(1).max(32),
  relatedDiagnosticIds: z.array(boundedString(256)).max(32).optional(),
  origin: EnrichmentOriginSchema,
  baseSnapshotHash: hash,
}

const proposalOf = <K extends EnrichmentKind>(kind: K) => z.object({ ...envelope, kind: z.literal(kind), payload: payloads[kind] }).strict()

export const EnrichmentProposalV1Schema = z.discriminatedUnion('kind', [
  proposalOf('classify-document'),
  proposalOf('summarize'),
  proposalOf('add-alias'),
  proposalOf('add-intent'),
  proposalOf('mark-canonical'),
  proposalOf('propose-relation'),
  proposalOf('flag-contradiction'),
  proposalOf('flag-redundancy'),
  proposalOf('flag-gap'),
  proposalOf('rank-hint'),
  proposalOf('suggest-area'),
])
export type EnrichmentProposalV1 = z.infer<typeof EnrichmentProposalV1Schema>
export type EnrichmentProposalOf<K extends EnrichmentKind> = Extract<EnrichmentProposalV1, { kind: K }>

/**
 * The part of a payload that makes two proposals of one kind about one entity different things.
 *
 * A summary, a classification, a canonical marker and a rank hint are slots: one per entity per
 * agent and prompt, so a re-run replaces rather than accumulates. An alias, an intent, a relation
 * or a flag can legitimately exist several times for one entity, so the field that tells them
 * apart is part of the identity.
 */
export const enrichmentProposalKey = (kind: EnrichmentKind, payload: unknown): unknown => {
  const record = (payload && typeof payload === 'object' ? payload : {}) as Record<string, unknown>
  switch (kind) {
    case 'add-alias':
      return { alias: record.alias }
    case 'add-intent':
      return { phrase: record.phrase, language: record.language }
    case 'propose-relation':
      return { from: record.from, to: record.to, kind: record.kind }
    case 'flag-contradiction':
      return { against: record.against }
    case 'flag-redundancy':
      return { with: record.with }
    case 'flag-gap':
      return { area: record.area, missing: record.missing }
    case 'suggest-area':
      return { directories: record.directories }
    default:
      return null
  }
}

export type EnrichmentIdentity = {
  readonly kind: EnrichmentKind
  readonly entity: string
  readonly targetContentHash: string
  readonly origin: Pick<EnrichmentOrigin, 'agentId' | 'promptVersion'>
  readonly payload?: unknown
}

/** The proposal id: kind, entity, target hash, agent identity, prompt version — and the payload key. */
export const enrichmentProposalId = (identity: EnrichmentIdentity): string =>
  sha256NormalizedV1({
    kind: identity.kind,
    entity: identity.entity,
    targetContentHash: identity.targetContentHash,
    agentId: identity.origin.agentId,
    promptVersion: identity.origin.promptVersion,
    key: enrichmentProposalKey(identity.kind, identity.payload),
  })

/** Why a proposal was not accepted. A closed list, so the histogram in `stats` is comparable across runs. */
export const ENRICHMENT_REJECTION_REASONS = [
  'invalid-kind',
  'schema',
  'no-evidence',
  'unknown-entity',
  'stale-target',
  'base-snapshot-mismatch',
  'unknown-diagnostic',
  'evidence-outside-artifacts',
  'proposal-id-mismatch',
  'entity-outside-pack',
  'entity-kind',
  'redaction',
  'summary-unchanged',
  'alias-collision',
  'unknown-scope',
  'canonical-conflict',
  'unknown-endpoint',
  'relation-already-observed',
  'evidence-outside-endpoints',
  'evidence-missing-for-endpoint',
  'already-duplicate',
  'already-covered',
  'unknown-directory',
  'area-overlap',
  'self-approval',
  'self-adjudication',
  'adjudicated',
  'human-rejected',
  'expired',
] as const
export type EnrichmentRejectionReason = (typeof ENRICHMENT_REJECTION_REASONS)[number]

export const AcceptedEnrichmentSchema = z
  .object({
    proposal: EnrichmentProposalV1Schema,
    acceptedAt: z.string().datetime(),
    /** `policy` for accept-by-policy kinds; otherwise the person who approved it. Never an agent. */
    acceptedBy: boundedString(256),
    approvalId: hash.optional(),
  })
  .strict()
  .superRefine((value, context) => {
    const policy = ENRICHMENT_POLICY[value.proposal.kind]
    if (value.acceptedBy === 'policy' && policy === 'human') {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ['acceptedBy'], message: `${value.proposal.kind} requires human approval; acceptedBy cannot be "policy"` })
    }
    if (value.acceptedBy === value.proposal.origin.agentId) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ['acceptedBy'], message: 'a proposal cannot be accepted by its own author' })
    }
  })
export type AcceptedEnrichment = z.infer<typeof AcceptedEnrichmentSchema>

export const PendingEnrichmentSchema = z
  .object({
    proposal: EnrichmentProposalV1Schema,
    /** The approval record this entry waits on: the hash of the proposal id and the target hash. */
    approvalId: hash,
    /** Why it is more than merely pending: a canonical conflict, a disputed contradiction. */
    note: z.enum(['canonical-conflict', 'disputed-contradiction']).optional(),
  })
  .strict()
export type PendingEnrichment = z.infer<typeof PendingEnrichmentSchema>

export const RejectedEnrichmentSchema = z
  .object({
    proposalId: boundedString(128),
    kind: boundedString(128),
    entity: boundedString(256).optional(),
    reason: z.enum(ENRICHMENT_REJECTION_REASONS),
    detail: z.string().max(1_024).optional(),
    origin: EnrichmentOriginSchema.optional(),
  })
  .strict()
export type RejectedEnrichment = z.infer<typeof RejectedEnrichmentSchema>

const count = z.number().int().nonnegative()

export const EnrichmentStatsSchema = z
  .object({
    byKind: z.record(z.string().max(128), z.object({ proposed: count, accepted: count, pending: count, rejected: count }).strict()),
    rejectionReasons: z.record(z.string().max(128), count),
    agentRuns: count,
    cacheHits: count,
    packs: count,
    inputBytes: count,
    outputBytes: count,
    expired: count,
  })
  .strict()
export type EnrichmentStats = z.infer<typeof EnrichmentStatsSchema>

export const EnrichmentOverlayV1Schema = z
  .object({
    type: z.literal('enrichment-overlay'),
    schemaVersion: z.literal(ENRICHMENT_SCHEMA_VERSION),
    contentHash: hash,
    contentHashAlgo: z.literal('sha256-normalized-v1'),
    project: ProjectIdentitySchema,
    sourceRevision: boundedString(128),
    sourceRevisionKind: z.enum(['git', 'content']),
    configurationHash: hash,
    pipelineVersion: boundedString(64),
    analyzerVersions: z.record(boundedString(128), boundedString(64)),
    baseSnapshotHash: hash,
    accepted: z.array(AcceptedEnrichmentSchema).max(10_000),
    pending: z.array(PendingEnrichmentSchema).max(10_000),
    rejected: z.array(RejectedEnrichmentSchema).max(10_000),
    stats: EnrichmentStatsSchema,
  })
  .strict()
export type EnrichmentOverlayV1 = z.infer<typeof EnrichmentOverlayV1Schema>

/**
 * The overlay's own hash, over what it decided and not over when or at what cost.
 *
 * `acceptedAt` is a fact about a person's action, and `stats` describe the run that produced the
 * file — how many agent calls, how many cache hits. Neither is a fact about the repository, and
 * two runs over one unchanged repository must produce one overlay hash, so both are outside it.
 * What is inside: every accepted, pending and rejected entry and the hashes they bind to.
 */
export const enrichmentOverlayContentHash = (overlay: Omit<EnrichmentOverlayV1, 'contentHash'> & { readonly contentHash?: string }): string => {
  const { contentHash: _contentHash, stats: _stats, ...rest } = overlay
  return sha256NormalizedV1({ ...rest, accepted: rest.accepted.map(({ acceptedAt: _acceptedAt, ...entry }) => entry) })
}

/**
 * An adjudication: a third agent's verdict on proposals two others could not settle — a canonical
 * conflict, a disputed contradiction. It judges; it never approves. The agent that made a
 * proposal cannot be the agent that judges it, which the validator enforces by identity.
 */
export const EnrichmentAdjudicationV1Schema = z
  .object({
    type: z.literal('enrichment-adjudication'),
    schemaVersion: z.literal(ENRICHMENT_SCHEMA_VERSION),
    adjudicationId: hash,
    /** The proposals judged, by id. Every one must be pending. */
    judges: z.array(hash).min(1).max(16),
    /** Which of the judged proposals survive; the rest are rejected as `adjudicated`. */
    keep: z.array(hash).max(16),
    reason: boundedString(1_000),
    origin: EnrichmentOriginSchema,
  })
  .strict()
  .superRefine((value, context) => {
    if (value.keep.some((id) => !value.judges.includes(id))) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ['keep'], message: 'keep may only name judged proposals' })
    }
  })
export type EnrichmentAdjudicationV1 = z.infer<typeof EnrichmentAdjudicationV1Schema>

export const enrichmentAdjudicationId = (input: Pick<EnrichmentAdjudicationV1, 'judges' | 'keep' | 'origin'>): string =>
  sha256NormalizedV1({ judges: [...input.judges].sort(), keep: [...input.keep].sort(), agentId: input.origin.agentId, promptVersion: input.origin.promptVersion })

export type { Evidence as EnrichmentEvidence }
