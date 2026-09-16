import { basename, extname } from 'node:path'

import type { DocBridgeConfigV1 } from '../config/schema.js'
import { GRAPH_ANALYZER_VERSION, canonicality } from '../graph/build.js'
import { indexConfigurationHash } from '../index-builder/project-corpus.js'
import { sha256NormalizedV1 } from '../index-builder/content-hash.js'
import { extractSearchBody } from '../lib/markdown.js'
import { SEARCH_LEXICON_VERSION } from '../query/text.js'
import type { KnowledgeEntry } from '../schemas/doc-bridge-index.js'
import type { DiscoverySnapshotV1, KnowledgeEntity, KnowledgeRelation, Provenance } from '../schemas/knowledge.js'
import {
  RetrievalIndexV1Schema,
  type Audience,
  type Confidence,
  type RetrievalEdge,
  type RetrievalEntry,
  type RetrievalFields,
  type RetrievalIndexV1,
  type RetrievalKind,
} from '../schemas/retrieval-index.js'
import { BM25_VERSION, buildBm25Index } from './bm25.js'
import { resolveSearchParams, resolveSearchWeights } from './weights.js'

/**
 * Project the snapshot into the index retrieval reads.
 *
 * Retrieval used to run a scanner of its own: it walked the repository, parsed every module and
 * document a second time, and produced records that shared nothing with the snapshot but a file
 * path. Two views of one repository, built by two pipelines, could disagree — and did, which is
 * how a search could return a module the snapshot said did not exist.
 *
 * This is a function, not a scan. Every entry is a snapshot entity (or a route the configuration
 * declares); every content hash is the entity's own; every graph number is computed from the
 * snapshot's relations. The one thing read from disk is the body text of a document the snapshot
 * already names, because a 4 KB search excerpt does not belong in a snapshot — and that read is
 * verified against the entity's content hash, so a file that changed since the scan is projected
 * from what the snapshot says about it rather than from what is on disk now.
 */

export const RETRIEVAL_PROJECTION_VERSION = 2 as const

/** Documentation body kept for search. Long enough to answer a question, short enough to ship. */
export const DOCUMENT_BODY_LIMIT = 4_000
const MAX_EDGES = 64
const MAX_ALIASES = 32
const MAX_TAGS = 32
const MAX_SYMBOLS = 256
/** A summary is what a result carries into an agent's context; the cap is a token budget, not a display limit. */
const MAX_SUMMARY = 400

/** The overlay hash when there is no overlay: the hash of an empty accepted set. */
export const EMPTY_OVERLAY_HASH = sha256NormalizedV1({ accepted: [] })

/**
 * What the snapshot observed, without the revision it observed it at.
 *
 * `snapshot.contentHash` seals the whole artifact, `sourceRevision` included — the commit SHA when
 * the working tree is clean, a digest of the scanned files when it is not. That is right for an
 * artifact whose job is to say what one revision looked like, and wrong as a projection input: the
 * projection is a function of what was found, not of where it was found. Sealing the revision into
 * it made an index that any commit invalidates without one thing it describes having changed — so
 * an index committed to a repository was stale the moment it landed, because landing it is a
 * commit, and a freshness gate could never pass twice.
 *
 * Entities and relations are the projection's whole input; the analyzer identity comes with them,
 * because two analyzer versions that observe the same entities and relations have nothing left to
 * disagree about, and one that observes different ones is caught by the entities.
 */
export const snapshotObservationHash = (
  snapshot: Pick<DiscoverySnapshotV1, 'entities' | 'relations' | 'pipelineVersion' | 'analyzerVersions'>,
): string =>
  sha256NormalizedV1({
    pipelineVersion: snapshot.pipelineVersion,
    analyzerVersions: snapshot.analyzerVersions,
    entities: snapshot.entities,
    relations: snapshot.relations,
  })

const CONFIDENCE_RANK: Readonly<Record<Confidence, number>> = { observed: 0, declared: 1, fuzzy: 2, proposed: 3 }

/** The weaker of two confidences: a chain is as trustworthy as its least trustworthy link. */
export const weakerConfidence = (a: Confidence, b: Confidence): Confidence =>
  CONFIDENCE_RANK[a] >= CONFIDENCE_RANK[b] ? a : b

/** What a relation's confidence is: its provenance, unless it resolved by similarity. */
export const relationConfidence = (relation: Pick<KnowledgeRelation, 'provenance' | 'metadata'>): Confidence =>
  relation.metadata?.confidence === 'fuzzy' ? 'fuzzy' : relation.provenance

/** The routes the configuration declares. Passed in rather than re-read, so the projection stays a function. */
export type RetrievalRoutes = {
  readonly ownership?: Readonly<
    Record<
      string,
      {
        readonly id: string
        readonly path: string
        readonly group?: string
        readonly layer?: string
        readonly purpose?: string
        readonly agentDoc?: string
        readonly humanDoc?: string
      }
    >
  >
  readonly intents?: Readonly<Record<string, { readonly id: string; readonly title: string; readonly paths: readonly string[] }>>
  readonly changes?: Readonly<
    Record<string, { readonly id: string; readonly title: string; readonly startHere: string; readonly relatedPackages?: readonly string[] }>
  >
}

/** A curated sidecar the corpus scan found: it lends its id and summary to the document it is. */
export type CuratedDocument = {
  readonly id: string
  readonly path: string
  readonly title?: string
  readonly description?: string
}

/**
 * The accepted enrichment overlay, as the projection reads it.
 *
 * Already expired against the snapshot by `projectEnrichmentOverlay`: every map here names an
 * entity whose content hash still matches the entry that describes it. The hash is part of the
 * projection's identity; everything else is additive — an alias joins the entity's own, a
 * summary fills a gap, a relation is one more edge with `provenance: proposed` — and nothing
 * here can remove or rewrite what the snapshot observed.
 */
export type RetrievalOverlayInput = {
  readonly hash: string
  /** Per-entry share of the bounded agent weight, 0..1. */
  readonly signals?: ReadonlyMap<string, number>
  readonly aliases?: ReadonlyMap<string, readonly string[]>
  /** Used only when the entity has no summary of its own; ranked in either case. */
  readonly summaries?: ReadonlyMap<string, string>
  /** Entity id → the scope it is canonical for. */
  readonly canonical?: ReadonlyMap<string, string>
  readonly intents?: readonly { readonly id: string; readonly title: string; readonly paths: readonly string[] }[]
  /** Accepted relations, `provenance: proposed`. Added next to the observed ones, never in place of any. */
  readonly relations?: readonly KnowledgeRelation[]
}

export type ProjectRetrievalOptions = {
  readonly snapshot: Pick<DiscoverySnapshotV1, 'contentHash' | 'entities' | 'relations' | 'pipelineVersion' | 'analyzerVersions'>
  readonly config: DocBridgeConfigV1 | undefined
  readonly routes?: RetrievalRoutes
  readonly curated?: readonly CuratedDocument[]
  readonly overlay?: RetrievalOverlayInput
  /** Body text of a document entity, by path. Return `undefined` when the file is not readable. */
  readonly readDocument?: (path: string) => string | undefined
}

const stringList = (value: unknown): readonly string[] =>
  Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : []

const unique = (values: readonly (string | undefined)[], limit: number): string[] =>
  [...new Set(values.filter((value): value is string => Boolean(value)))].slice(0, limit)

const audienceOf = (entity: KnowledgeEntity): Audience | undefined => {
  const classification = entity.metadata?.classification
  if (classification === 'human-and-agent' || classification === 'agent' || classification === 'human') return classification
  if (classification === 'project') return 'human'
  return undefined
}

const headingTexts = (entity: KnowledgeEntity): readonly string[] =>
  Array.isArray(entity.metadata?.headings)
    ? entity.metadata.headings
        .map((heading) => (heading && typeof heading === 'object' && 'text' in heading ? (heading as { text: unknown }).text : undefined))
        .filter((text): text is string => typeof text === 'string')
    : []

const TEST_MODULE_PATTERN = /(?:\.test|\.spec|__tests__)/

/** The tags the legacy index carried per projected entry, so its readers see the same record. */
const tagsFor = (kind: RetrievalKind, entity: KnowledgeEntity | undefined, path: string, extra: readonly (string | undefined)[]): string[] =>
  unique(
    [
      kind,
      ...(kind === 'document' ? [String(entity?.metadata?.classification ?? '') || undefined, String(entity?.metadata?.frontmatter && typeof entity.metadata.frontmatter === 'object' && 'type' in entity.metadata.frontmatter ? (entity.metadata.frontmatter as { type?: unknown }).type ?? '' : '') || undefined] : []),
      ...(kind === 'module'
        ? [extname(path).replace('.', '') || undefined, TEST_MODULE_PATTERN.test(path) ? 'test' : undefined, path.split('/').slice(0, -1).pop()]
        : []),
      ...extra,
    ],
    MAX_TAGS,
  )

type EntryDraft = Omit<RetrievalEntry, 'fields' | 'graph' | 'confidence'> & { readonly bodyText: string; readonly headingText: string }

const fieldsFor = (draft: EntryDraft): RetrievalFields => ({
  title: draft.title.slice(0, 512),
  headings: draft.headingText.slice(0, 4_096),
  path: draft.path.slice(0, 1_024),
  symbols: (draft.symbols ?? []).join(' ').slice(0, 8_192),
  summary: (draft.summary ?? '').slice(0, 2_048),
  body: draft.bodyText.slice(0, 16_000),
  aliases: [...draft.aliases, ...draft.tags].join(' ').slice(0, 2_048),
})

/** A hash for an entry the repository does not store as one file: the entity itself, canonically. */
const derivedHash = (value: unknown): string => sha256NormalizedV1(value)

/**
 * Build the retrieval index.
 *
 * Entries are emitted in id order and every list inside them is sorted, so the artifact — and
 * its content hash — is a function of its inputs and not of the order the snapshot arrived in.
 */
export const projectRetrievalIndex = (options: ProjectRetrievalOptions): RetrievalIndexV1 => {
  const { snapshot, config } = options
  const routes = options.routes ?? {}
  const overlayHash = options.overlay?.hash ?? EMPTY_OVERLAY_HASH
  const overlay = options.overlay
  // Proposed relations sit next to the observed ones: one more edge each, with its own confidence.
  const relations = overlay?.relations?.length ? [...snapshot.relations, ...overlay.relations] : snapshot.relations
  const entities = new Map(snapshot.entities.map((entity) => [entity.id, entity]))
  const byPath = new Map<string, KnowledgeEntity>()
  for (const entity of snapshot.entities) if (entity.path && !byPath.has(entity.path)) byPath.set(entity.path, entity)
  const curatedByPath = new Map((options.curated ?? []).map((document) => [document.path, document]))

  /*
   * Ownership records attach to the entity at their path — an area, a package, a module or a
   * document — and lend it their id as an alias. A record that matches no entity still has to be
   * findable, because a query for it has an answer (the record), so it becomes a declared entry.
   */
  const ownershipByEntity = new Map<string, NonNullable<RetrievalRoutes['ownership']>[string]>()
  /** Further records at the same path: the same unit under another name, so aliases, not entries. */
  const ownershipAliases = new Map<string, string[]>()
  const orphanOwnership: NonNullable<RetrievalRoutes['ownership']>[string][] = []
  for (const record of Object.values(routes.ownership ?? {}).sort((a, b) => a.id.localeCompare(b.id))) {
    const entity = byPath.get(record.path.replace(/\/$/, ''))
    if (!entity) orphanOwnership.push(record)
    else if (!ownershipByEntity.has(entity.id)) ownershipByEntity.set(entity.id, record)
    else ownershipAliases.set(entity.id, [...(ownershipAliases.get(entity.id) ?? []), record.id])
  }

  // Containment, for area and package ids.
  const parentOf = new Map<string, string>()
  const packageOfArea = new Map<string, string>()
  for (const relation of relations) {
    if (relation.kind !== 'contains') continue
    const parent = entities.get(relation.from)
    const child = entities.get(relation.to)
    if (!parent || !child) continue
    if (parent.kind === 'area' && child.kind === 'module') parentOf.set(child.id, parent.id)
    if (parent.kind === 'package' && child.kind === 'module' && !parentOf.has(child.id)) parentOf.set(child.id, parent.id)
    if (parent.kind === 'package' && child.kind === 'area') packageOfArea.set(child.id, parent.id)
    if (parent.kind === 'area' && child.kind === 'area') parentOf.set(child.id, parent.id)
  }
  const areaOf = (id: string): string | undefined => {
    const parent = parentOf.get(id)
    return parent && entities.get(parent)?.kind === 'area' ? parent : undefined
  }
  const packageOf = (id: string): string | undefined => {
    const entity = entities.get(id)
    if (entity?.kind === 'package') return id
    if (entity?.kind === 'area') {
      let current: string | undefined = id
      while (current && entities.get(current)?.kind === 'area') {
        const owner = packageOfArea.get(current)
        if (owner) return owner
        current = parentOf.get(current)
      }
      return undefined
    }
    const parent = parentOf.get(id)
    return parent ? packageOf(parent) : undefined
  }

  // Documentation edges, per endpoint, with the confidence of the relation that made them.
  const inbound = new Map<string, RetrievalEdge[]>()
  const outbound = new Map<string, RetrievalEdge[]>()
  const push = (map: Map<string, RetrievalEdge[]>, key: string, edge: RetrievalEdge): void => {
    const list = map.get(key)
    if (list) list.push(edge)
    else map.set(key, [edge])
  }
  for (const relation of relations) {
    const confidence = relationConfidence(relation)
    if (relation.kind === 'covers' || relation.kind === 'mentions' || relation.kind === 'mentions-symbol' || relation.kind === 'links-to') {
      push(inbound, relation.to, { kind: relation.kind, id: relation.from, confidence })
      push(outbound, relation.from, { kind: relation.kind, id: relation.to, confidence })
    }
    if ((relation.kind === 'imports' || relation.kind === 're-exports') && entities.get(relation.to)?.kind === 'module') {
      push(outbound, relation.from, { kind: relation.kind, id: relation.to, confidence })
      push(inbound, relation.to, { kind: relation.kind, id: relation.from, confidence })
    }
  }
  const sortedEdges = (list: readonly RetrievalEdge[] | undefined): RetrievalEdge[] =>
    [...(list ?? [])]
      .sort((a, b) => a.kind.localeCompare(b.kind) || a.id.localeCompare(b.id) || a.confidence.localeCompare(b.confidence))
      .filter((edge, index, all) => index === 0 || edge.kind !== all[index - 1]?.kind || edge.id !== all[index - 1]?.id)
      .slice(0, MAX_EDGES)

  const pagerank = canonicality({ entities: snapshot.entities, relations })

  const drafts: EntryDraft[] = []

  for (const entity of snapshot.entities) {
    if (entity.kind !== 'document' && entity.kind !== 'module' && entity.kind !== 'area' && entity.kind !== 'package') continue
    if (!entity.path) continue
    const kind = entity.kind as RetrievalKind
    const ownership = ownershipByEntity.get(entity.id)
    const curated = kind === 'document' ? curatedByPath.get(entity.path) : undefined
    const hash = entity.evidence[0]?.contentHash
    const symbols = kind === 'module' ? unique(stringList(entity.metadata?.exports).filter((name) => name !== '*'), MAX_SYMBOLS) : undefined

    let bodyText = ''
    if (kind === 'document') {
      const raw = options.readDocument?.(entity.path)
      // A body that no longer matches the entity is not this entity's body.
      if (raw !== undefined && (!hash || sha256NormalizedV1(raw.replace(/^﻿/, '')) === hash)) bodyText = extractSearchBody(raw, DOCUMENT_BODY_LIMIT)
    }

    /*
     * An ownership record's agent document is the documentation of the unit it owns. The unit
     * inherits that text — title, headings, summary, body — so a query the document answers
     * routes to the unit, which is what an agent asking "who owns X" needs, and what the record
     * carried before the projection existed.
     */
    const agentDoc = ownership?.agentDoc ? byPath.get(ownership.agentDoc) : undefined
    const agentDocCurated = ownership?.agentDoc ? curatedByPath.get(ownership.agentDoc) : undefined
    if (agentDoc && !bodyText) {
      const raw = options.readDocument?.(ownership?.agentDoc ?? '')
      const docHash = agentDoc.evidence[0]?.contentHash
      if (raw !== undefined && (!docHash || sha256NormalizedV1(raw.replace(/^\uFEFF/, '')) === docHash)) bodyText = extractSearchBody(raw, DOCUMENT_BODY_LIMIT)
    }

    const title =
      curated?.title ??
      agentDocCurated?.title ??
      (typeof entity.metadata?.title === 'string' ? entity.metadata.title : undefined) ??
      (typeof agentDoc?.metadata?.title === 'string' ? agentDoc.metadata.title : undefined) ??
      (kind === 'document' || kind === 'module' ? basename(entity.path) : entity.name)
    const summary =
      ownership?.purpose ??
      curated?.description ??
      agentDocCurated?.description ??
      (typeof entity.metadata?.summary === 'string' ? entity.metadata.summary : undefined) ??
      (typeof agentDoc?.metadata?.summary === 'string' ? agentDoc.metadata.summary : undefined) ??
      overlay?.summaries?.get(entity.id)
    const shortName = kind === 'package' ? entity.name.split('/').pop() : undefined

    drafts.push({
      id: entity.id,
      kind,
      path: entity.path,
      title: title.slice(0, 256),
      ...(summary ? { summary: summary.slice(0, MAX_SUMMARY) } : {}),
      ...(() => {
        const audience = kind === 'document' ? audienceOf(entity) : agentDoc ? audienceOf(agentDoc) : undefined
        return audience ? { audience } : {}
      })(),
      aliases: unique(
        [ownership?.id, ...(ownershipAliases.get(entity.id) ?? []), curated?.id, shortName, kind === 'package' ? entity.name : undefined, ...(entity.aliases ?? []), ...(overlay?.aliases?.get(entity.id) ?? [])],
        MAX_ALIASES,
      ),
      ...(symbols?.length ? { symbols } : {}),
      tags: tagsFor(kind, entity, entity.path, [ownership ? 'ownership' : undefined, ownership?.group, ownership?.layer, overlay?.canonical?.has(entity.id) ? 'canonical' : undefined]),
      contentHash: hash ?? derivedHash({ id: entity.id, kind, path: entity.path, name: entity.name, metadata: entity.metadata ?? {} }),
      provenance: entity.provenance,
      ...(ownership ? { ownershipId: ownership.id } : {}),
      bodyText,
      headingText: [...headingTexts(entity), ...(agentDoc ? headingTexts(agentDoc) : [])].join(' '),
    })
  }

  for (const record of orphanOwnership) {
    drafts.push({
      id: `ownership:${record.id}`,
      kind: 'package',
      path: record.path,
      title: record.id,
      ...(record.purpose ? { summary: record.purpose } : {}),
      aliases: unique([record.id, record.agentDoc, record.humanDoc], MAX_ALIASES),
      tags: unique(['package', 'ownership', record.group, record.layer], MAX_TAGS),
      contentHash: derivedHash(record),
      provenance: 'declared',
      ownershipId: record.id,
      bodyText: '',
      headingText: '',
    })
  }

  for (const intent of Object.values(routes.intents ?? {})) {
    drafts.push({
      id: intent.id,
      kind: 'intent',
      path: intent.paths[0] ?? intent.id,
      title: intent.title,
      summary: intent.title,
      aliases: [intent.id],
      tags: ['intent'],
      contentHash: derivedHash(intent),
      provenance: 'declared',
      bodyText: intent.paths.join(' '),
      headingText: '',
    })
  }

  // An accepted intent is a route an agent proposed and a validator let through: declared by it, not observed.
  for (const intent of overlay?.intents ?? []) {
    drafts.push({
      id: intent.id,
      kind: 'intent',
      path: intent.paths[0] ?? intent.id,
      title: intent.title,
      summary: intent.title,
      aliases: [intent.id],
      tags: ['intent', 'proposed'],
      contentHash: derivedHash(intent),
      provenance: 'proposed',
      bodyText: intent.paths.join(' '),
      headingText: '',
    })
  }

  for (const change of Object.values(routes.changes ?? {})) {
    drafts.push({
      id: change.id,
      kind: 'change',
      path: change.startHere,
      title: change.title,
      summary: change.title,
      aliases: unique([change.id, ...(change.relatedPackages ?? [])], MAX_ALIASES),
      tags: unique(['change', ...(change.relatedPackages ?? [])], MAX_TAGS),
      contentHash: derivedHash(change),
      provenance: 'declared',
      bodyText: '',
      headingText: '',
    })
  }

  const entries: RetrievalEntry[] = drafts
    .sort((a, b) => a.id.localeCompare(b.id))
    .map((draft) => {
      const { bodyText: _body, headingText: _headings, ...rest } = draft
      const into = sortedEdges(inbound.get(draft.id))
      const out = sortedEdges(outbound.get(draft.id))
      const areaId = areaOf(draft.id)
      const packageId = packageOf(draft.id)
      const confidence: Confidence = draft.provenance as Provenance
      const agentSignal = overlay?.signals?.get(draft.id)
      return {
        ...rest,
        fields: fieldsFor(draft),
        ...(agentSignal ? { agentSignal: Math.min(1, Math.max(0, Math.round(agentSignal * 1_000) / 1_000)) } : {}),
        graph: {
          pagerank: pagerank.get(draft.id) ?? 0,
          inboundLinks: into.filter((edge) => edge.kind === 'links-to' || edge.kind === 'covers' || edge.kind === 'mentions' || edge.kind === 'mentions-symbol').length,
          coveredBy: into.filter((edge) => edge.kind === 'covers').map((edge) => edge.id),
          mentionedBy: into.filter((edge) => edge.kind === 'mentions' || edge.kind === 'mentions-symbol').map((edge) => edge.id),
          ...(areaId ? { areaId } : {}),
          ...(packageId ? { packageId } : {}),
          inbound: into,
          outbound: out,
        },
        confidence,
      }
    })

  const weights = resolveSearchWeights(config?.retrieval?.weights)
  const params = resolveSearchParams(config?.retrieval?.params)
  const lexical = buildBm25Index(entries.map((entry) => ({ ref: entry.id, fields: entry.fields })), weights, params)

  const base = {
    type: 'retrieval-index' as const,
    schemaVersion: 1 as const,
    contentHash: '0'.repeat(64),
    contentHashAlgo: 'sha256-normalized-v1' as const,
    snapshotHash: snapshot.contentHash,
    overlayHash,
    configurationHash: indexConfigurationHash(config),
    lexiconVersion: SEARCH_LEXICON_VERSION,
    graphMetricsVersion: GRAPH_ANALYZER_VERSION,
    weights,
    params,
    lexical: {
      version: BM25_VERSION,
      documentCount: lexical.documents.length,
      fieldNames: Object.keys(weights).sort(),
      averageFieldLength: Object.fromEntries([...lexical.averageFieldLength.entries()].sort(([a], [b]) => a.localeCompare(b))),
    },
    entries,
  }
  /*
   * The hash is over the inputs, not the output: the projection is a function, so equal input
   * hashes mean an equal artifact, and a reader checking freshness compares hashes instead of
   * re-projecting. `snapshotHash` stays on the artifact as provenance — which snapshot this came
   * from — but the seal uses the observation, so the same repository projects to the same hash
   * whatever revision it was scanned at.
   */
  const contentHash = sha256NormalizedV1({
    projectionVersion: RETRIEVAL_PROJECTION_VERSION,
    observationHash: snapshotObservationHash(snapshot),
    overlayHash: base.overlayHash,
    configurationHash: base.configurationHash,
    lexiconVersion: base.lexiconVersion,
    graphMetricsVersion: base.graphMetricsVersion,
    weights,
    params,
  })
  return RetrievalIndexV1Schema.parse({ ...base, contentHash })
}

/**
 * The legacy record for a projected entry.
 *
 * `knowledge[]` is what the harness, llms.txt, the doctor and every older reader consume, so it
 * keeps carrying every document and module — but without the body, which now lives once in the
 * projection. A document projected here and a document ranked there are the same entry.
 */
export const toKnowledgeEntry = (entry: RetrievalEntry): KnowledgeEntry => ({
  id: entry.id,
  type: entry.kind,
  title: entry.title,
  path: entry.path,
  ...(entry.summary ? { description: entry.summary } : {}),
  ...(entry.symbols?.length ? { symbols: entry.symbols } : {}),
  tags: entry.tags,
  contentHash: entry.contentHash,
})
