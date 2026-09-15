import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'

import { sha256NormalizedV1 } from '../index-builder/content-hash.js'
import type { RetrievalOverlayInput } from '../retrieval/project.js'
import {
  ENRICHMENT_POLICY,
  EnrichmentOverlayV1Schema,
  enrichmentOverlayContentHash,
  type AcceptedEnrichment,
  type EnrichmentOverlayV1,
  type EnrichmentProposalOf,
} from '../schemas/enrichment.js'
import type { DiscoverySnapshotV1, KnowledgeEntity, KnowledgeRelation } from '../schemas/knowledge.js'
import { entityContentHash } from './validate.js'

/**
 * The overlay on disk, and what the deterministic layer reads from it.
 *
 * The file is written by the enrich stage and by an approval; it is never written by a read.
 * `index`, `search`, `query` and MCP consult it through `projectEnrichmentOverlay`, which is a
 * pure function of the overlay and the snapshot: an accepted entry whose target hash no longer
 * matches its entity is expired *in the result*, not in the file, so a stale entry costs nothing
 * and a read leaves no trace.
 */

export const ENRICHMENT_DIR = '.doc-bridge/enrich'
export const ENRICHMENT_OVERLAY_FILE = 'overlay.json'

export const enrichmentDir = (root: string): string => join(resolve(root), ENRICHMENT_DIR)
export const enrichmentOverlayPath = (root: string): string => join(enrichmentDir(root), ENRICHMENT_OVERLAY_FILE)
export const enrichmentCacheDir = (root: string): string => join(enrichmentDir(root), 'cache')

/**
 * Read the overlay, or nothing.
 *
 * Missing, unreadable, malformed or failing its own hash all mean the same thing to a reader:
 * there is no overlay. Failing closed here is what keeps a corrupt file from changing a `check`
 * result — a reader that threw would make the deterministic layer depend on the enrichment one.
 */
export const readEnrichmentOverlay = (root: string): EnrichmentOverlayV1 | undefined => {
  const path = enrichmentOverlayPath(root)
  if (!existsSync(path)) return undefined
  try {
    const parsed = EnrichmentOverlayV1Schema.parse(JSON.parse(readFileSync(path, 'utf8')) as unknown)
    return parsed.contentHash === enrichmentOverlayContentHash(parsed) ? parsed : undefined
  } catch {
    return undefined
  }
}

/** Parse an overlay from memory with the same rules as a read: schema and hash, or nothing. */
export const parseEnrichmentOverlay = (value: unknown): EnrichmentOverlayV1 | undefined => {
  const parsed = EnrichmentOverlayV1Schema.safeParse(value)
  return parsed.success && parsed.data.contentHash === enrichmentOverlayContentHash(parsed.data) ? parsed.data : undefined
}

export const writeEnrichmentOverlay = (root: string, overlay: EnrichmentOverlayV1): string => {
  const path = enrichmentOverlayPath(root)
  mkdirSync(enrichmentDir(root), { recursive: true })
  const sealed = EnrichmentOverlayV1Schema.parse({ ...overlay, contentHash: enrichmentOverlayContentHash(overlay) })
  const temporary = `${path}.tmp-${process.pid}`
  writeFileSync(temporary, `${JSON.stringify(sealed, null, 2)}\n`, 'utf8')
  renameSync(temporary, path)
  return path
}

/** Seal an overlay: every list sorted, the hash recomputed. The shape every writer goes through. */
export const sealEnrichmentOverlay = (overlay: Omit<EnrichmentOverlayV1, 'contentHash'>): EnrichmentOverlayV1 => {
  const sorted = {
    ...overlay,
    accepted: [...overlay.accepted].sort((left, right) => left.proposal.proposalId.localeCompare(right.proposal.proposalId)),
    pending: [...overlay.pending].sort((left, right) => left.proposal.proposalId.localeCompare(right.proposal.proposalId)),
    rejected: [...overlay.rejected].sort((left, right) => left.proposalId.localeCompare(right.proposalId) || left.reason.localeCompare(right.reason)),
  }
  return EnrichmentOverlayV1Schema.parse({ ...sorted, contentHash: enrichmentOverlayContentHash(sorted) })
}

export type EffectiveOverlay = {
  /** Accepted entries whose target still has the hash they were made against. */
  readonly live: readonly AcceptedEnrichment[]
  /** Accepted entries whose target moved: excluded from every projection, left in the file. */
  readonly expired: readonly AcceptedEnrichment[]
}

/**
 * Per-entry staleness.
 *
 * An entry binds to the content hash of the entity it describes, not to the snapshot hash, so one
 * changed file expires one entry and its siblings survive. An entity that no longer exists expires
 * its entries too: there is nothing left to describe.
 */
export const effectiveEnrichment = (overlay: Pick<EnrichmentOverlayV1, 'accepted'>, snapshot: Pick<DiscoverySnapshotV1, 'entities'>): EffectiveOverlay => {
  const hashes = new Map(snapshot.entities.map((entity) => [entity.id, entityContentHash(entity)]))
  const live: AcceptedEnrichment[] = []
  const expired: AcceptedEnrichment[] = []
  for (const entry of overlay.accepted) {
    const current = hashes.get(entry.proposal.entity)
    const still = current !== undefined && current === entry.proposal.targetContentHash && endpointsPresent(entry, hashes)
    ;(still ? live : expired).push(entry)
  }
  return { live, expired }
}

/** A relation or a flag names a second entity; if that one is gone, the entry has nothing to point at. */
const endpointsPresent = (entry: AcceptedEnrichment, hashes: ReadonlyMap<string, string>): boolean => {
  const { proposal } = entry
  switch (proposal.kind) {
    case 'propose-relation':
      return hashes.has(proposal.payload.from) && hashes.has(proposal.payload.to)
    case 'mark-canonical':
      return hashes.has(proposal.payload.scope)
    case 'flag-contradiction':
      return hashes.has(proposal.payload.against)
    case 'flag-redundancy':
      return hashes.has(proposal.payload.with)
    case 'flag-gap':
      return hashes.has(proposal.payload.area)
    default:
      return true
  }
}

/** The hash of what an overlay contributes: the live accepted set. Empty when nothing is live. */
export const enrichmentOverlayHash = (live: readonly AcceptedEnrichment[]): string =>
  sha256NormalizedV1({
    accepted: [...live]
      .map((entry) => ({ proposalId: entry.proposal.proposalId, targetContentHash: entry.proposal.targetContentHash }))
      .sort((left, right) => left.proposalId.localeCompare(right.proposalId)),
  })

/** Signals are shares of the bounded weight: a strong hint is the full share, a canonical marker most of it, a weak hint half. */
const SIGNAL_STRONG = 1
const SIGNAL_CANONICAL = 0.8
const SIGNAL_WEAK = 0.5

const relationOf = (proposal: EnrichmentProposalOf<'propose-relation'>): KnowledgeRelation => ({
  id: `relation:${proposal.payload.from}|${proposal.payload.kind}|${proposal.payload.to}|proposed:${proposal.proposalId.slice(0, 12)}`,
  kind: proposal.payload.kind,
  from: proposal.payload.from,
  to: proposal.payload.to,
  provenance: 'proposed',
  evidence: proposal.evidence,
  metadata: { proposalId: proposal.proposalId, detection: proposal.payload.detection, confidence: 'proposed', agentId: proposal.origin.agentId },
})

/**
 * What the projection reads from an overlay: aliases, summaries, intents, canonical markers,
 * rank hints and relations, each already expired against the snapshot.
 *
 * Findings (`flag-*`) and area suggestions contribute nothing here on purpose. A gap is a thing to
 * review, not a fact to rank on; an area suggestion becomes configuration or nothing.
 */
export const projectEnrichmentOverlay = (
  overlay: EnrichmentOverlayV1 | undefined,
  snapshot: Pick<DiscoverySnapshotV1, 'entities'>,
): RetrievalOverlayInput | undefined => {
  if (!overlay) return undefined
  const { live } = effectiveEnrichment(overlay, snapshot)
  const signals = new Map<string, number>()
  const aliases = new Map<string, string[]>()
  const summaries = new Map<string, string>()
  const canonical = new Map<string, string>()
  const intents: { id: string; title: string; paths: string[]; language: string }[] = []
  const relations: KnowledgeRelation[] = []
  const paths = new Map(snapshot.entities.map((entity) => [entity.id, entity.path]))
  const bump = (id: string, share: number): void => {
    signals.set(id, Math.min(1, (signals.get(id) ?? 0) + share))
  }

  for (const entry of live) {
    const { proposal } = entry
    switch (proposal.kind) {
      case 'add-alias':
        aliases.set(proposal.entity, [...(aliases.get(proposal.entity) ?? []), proposal.payload.alias])
        break
      case 'summarize':
        if (!summaries.has(proposal.entity)) summaries.set(proposal.entity, proposal.payload.summary)
        break
      case 'add-intent':
        intents.push({
          id: `intent:proposed:${proposal.proposalId.slice(0, 16)}`,
          title: proposal.payload.phrase,
          paths: [paths.get(proposal.entity) ?? proposal.entity],
          language: proposal.payload.language,
        })
        break
      case 'mark-canonical':
        canonical.set(proposal.entity, proposal.payload.scope)
        bump(proposal.entity, SIGNAL_CANONICAL)
        break
      case 'rank-hint':
        bump(proposal.entity, proposal.payload.relevance === 'strong' ? SIGNAL_STRONG : SIGNAL_WEAK)
        break
      case 'propose-relation':
        relations.push(relationOf(proposal))
        break
      default:
        break
    }
  }
  for (const list of aliases.values()) list.sort()
  intents.sort((left, right) => left.id.localeCompare(right.id))
  relations.sort((left, right) => left.id.localeCompare(right.id))
  return {
    hash: enrichmentOverlayHash(live),
    ...(signals.size ? { signals } : {}),
    ...(aliases.size ? { aliases } : {}),
    ...(summaries.size ? { summaries } : {}),
    ...(canonical.size ? { canonical } : {}),
    ...(intents.length ? { intents } : {}),
    ...(relations.length ? { relations } : {}),
  }
}

/**
 * The snapshot plus the live accepted relations, for the graph, the report and the memory view.
 *
 * Additive only: every observed entity and relation is carried unchanged, and a proposed relation
 * whose id collides with an observed one is dropped rather than allowed to shadow it. The
 * assertion below is what the projection tests run; it is here so any consumer can run it.
 */
export const withAcceptedRelations = <T extends Pick<DiscoverySnapshotV1, 'entities' | 'relations'>>(
  snapshot: T,
  overlay: EnrichmentOverlayV1 | undefined,
): T => {
  if (!overlay) return snapshot
  const { live } = effectiveEnrichment(overlay, snapshot)
  const observedIds = new Set(snapshot.relations.map((relation) => relation.id))
  const proposed = live
    .flatMap((entry) => (entry.proposal.kind === 'propose-relation' ? [relationOf(entry.proposal as EnrichmentProposalOf<'propose-relation'>)] : []))
    .filter((relation) => !observedIds.has(relation.id))
    .sort((left, right) => left.id.localeCompare(right.id))
  if (!proposed.length) return snapshot
  const merged = { ...snapshot, relations: [...snapshot.relations, ...proposed] }
  assertObservedSurvive(snapshot, merged)
  return merged
}

/** Every observed entity and relation must be present, unchanged, after enrichment. */
export const assertObservedSurvive = (
  observed: Pick<DiscoverySnapshotV1, 'entities' | 'relations'>,
  enriched: Pick<DiscoverySnapshotV1, 'entities' | 'relations'>,
): void => {
  const entities = new Map(enriched.entities.map((entity) => [entity.id, entity]))
  const relations = new Map(enriched.relations.map((relation) => [relation.id, relation]))
  const same = (left: KnowledgeEntity | KnowledgeRelation, right: KnowledgeEntity | KnowledgeRelation | undefined): boolean =>
    right !== undefined && sha256NormalizedV1(left) === sha256NormalizedV1(right)
  for (const entity of observed.entities) if (!same(entity, entities.get(entity.id))) throw new Error(`Enrichment removed or altered observed entity ${entity.id}.`)
  for (const relation of observed.relations) if (!same(relation, relations.get(relation.id))) throw new Error(`Enrichment removed or altered observed relation ${relation.id}.`)
}

/** Accepted entries that are findings rather than facts, for a reviewer or a renderer. */
export const enrichmentFindings = (overlay: EnrichmentOverlayV1): readonly AcceptedEnrichment[] =>
  overlay.accepted.filter((entry) => ENRICHMENT_POLICY[entry.proposal.kind] === 'finding')
