import { z } from 'zod'

import { ProvenanceSchema } from './knowledge.js'

/**
 * The retrieval index: what ranking reads.
 *
 * It is a projection of the discovery snapshot — a pure function of the snapshot, the accepted
 * enrichment overlay and the configuration — and nothing else. It has no scanner of its own,
 * which is the invariant that makes "the index" and "the snapshot" describe the same repository:
 * an entity retrieval can find is an entity discovery observed, with the same id, the same
 * content hash and the same evidence.
 */

export const RETRIEVAL_INDEX_SCHEMA_VERSION = 1 as const

const hash = z.string().regex(/^[a-f0-9]{64}$/)

export const RetrievalKindSchema = z.enum(['document', 'module', 'area', 'package', 'intent', 'change'])
export type RetrievalKind = z.infer<typeof RetrievalKindSchema>

/**
 * How much to trust a result, from most to least.
 *
 * `observed` came from code or a manifest; `declared` from a documentation declaration or the
 * configuration; `fuzzy` from a reference that resolved by similarity rather than by name;
 * `proposed` from an agent whose proposal has not been accepted. A result's confidence is the
 * weakest link between the entry and the relation that surfaced it.
 */
export const ConfidenceSchema = z.enum(['observed', 'declared', 'fuzzy', 'proposed'])
export type Confidence = z.infer<typeof ConfidenceSchema>

export const AudienceSchema = z.enum(['agent', 'human', 'human-and-agent'])
export type Audience = z.infer<typeof AudienceSchema>

/** Text the lexical ranker indexes, one string per field, already bounded. */
export const RetrievalFieldsSchema = z
  .object({
    title: z.string().max(512),
    headings: z.string().max(4_096),
    path: z.string().max(1_024),
    symbols: z.string().max(8_192),
    summary: z.string().max(2_048),
    body: z.string().max(16_000),
    aliases: z.string().max(2_048),
  })
  .strict()
export type RetrievalFields = z.infer<typeof RetrievalFieldsSchema>

/** One edge into or out of an entry, with the confidence of the relation it came from. */
export const RetrievalEdgeSchema = z
  .object({
    kind: z.string().min(1).max(64),
    id: z.string().min(1).max(256),
    confidence: ConfidenceSchema,
  })
  .strict()
export type RetrievalEdge = z.infer<typeof RetrievalEdgeSchema>

export const RetrievalGraphSchema = z
  .object({
    /** Canonicality: PageRank over `links-to` and `covers`. */
    pagerank: z.number().min(0).max(1),
    inboundLinks: z.number().int().nonnegative(),
    coveredBy: z.array(z.string().min(1).max(256)).max(64),
    mentionedBy: z.array(z.string().min(1).max(256)).max(64),
    areaId: z.string().min(1).max(256).optional(),
    packageId: z.string().min(1).max(256).optional(),
    /** Documentation edges into this entry, with their confidence. The explain view reads these. */
    inbound: z.array(RetrievalEdgeSchema).max(64),
    /** Where a document's own links go, and which internal modules a module imports. */
    outbound: z.array(RetrievalEdgeSchema).max(64),
  })
  .strict()
export type RetrievalGraph = z.infer<typeof RetrievalGraphSchema>

export const RetrievalEntrySchema = z
  .object({
    id: z.string().min(1).max(256),
    kind: RetrievalKindSchema,
    path: z.string().min(1).max(512),
    title: z.string().min(1).max(256),
    summary: z.string().max(2_048).optional(),
    audience: AudienceSchema.optional(),
    /** Names this entry also answers to: an ownership id, a sidecar id, a package's short name. */
    aliases: z.array(z.string().min(1).max(256)).max(32),
    /** A module's exported names, kept as a list so an exact-symbol match is exact. */
    symbols: z.array(z.string().min(1).max(128)).max(256).optional(),
    tags: z.array(z.string().min(1).max(64)).max(32),
    fields: RetrievalFieldsSchema,
    graph: RetrievalGraphSchema,
    contentHash: hash,
    provenance: ProvenanceSchema,
    confidence: ConfidenceSchema,
    /** The ownership record this entry stands for, when one is attached to it. */
    ownershipId: z.string().min(1).max(256).optional(),
    /**
     * The accepted enrichment overlay's share of the bounded agent weight for this entry, 0..1.
     * Absent when no live accepted entry names it; the ranker treats absent as zero.
     */
    agentSignal: z.number().min(0).max(1).optional(),
  })
  .strict()
export type RetrievalEntry = z.infer<typeof RetrievalEntrySchema>

/**
 * What the lexical ranker needs beyond the entries themselves.
 *
 * The postings are not stored: `fields` already is the serialised index, because tokenisation is
 * versioned (`lexiconVersion`) and deterministic, so the postings a reader rebuilds are the
 * postings the writer would have stored. What is recorded is the shape of the collection —
 * enough to check that a reader rebuilt the same index, and to score against it.
 */
export const RetrievalLexicalSchema = z
  .object({
    version: z.number().int().nonnegative().max(1_000),
    documentCount: z.number().int().nonnegative(),
    fieldNames: z.array(z.string().min(1).max(64)).max(32),
    averageFieldLength: z.record(z.string().min(1).max(64), z.number().nonnegative()),
  })
  .strict()

/**
 * The most entries one index can carry.
 *
 * A bound, because an unbounded artifact is not an artifact: a reader has to be able to refuse a
 * file before parsing it all. It is deliberately above what a large monorepo produces — the
 * repository that first exceeded the previous bound projects about eleven thousand entries — so the
 * limit reports a corpus nobody meant to index rather than a corpus that is merely big.
 */
export const RETRIEVAL_MAX_ENTRIES = 50_000

export const RetrievalIndexV1Schema = z
  .object({
    type: z.literal('retrieval-index'),
    schemaVersion: z.literal(RETRIEVAL_INDEX_SCHEMA_VERSION),
    contentHash: hash,
    contentHashAlgo: z.literal('sha256-normalized-v1'),
    /** The three inputs the projection is a function of. Same three hashes, same projection. */
    snapshotHash: hash,
    overlayHash: hash,
    configurationHash: hash,
    lexiconVersion: z.number().int().nonnegative().max(1_000),
    graphMetricsVersion: z.string().min(1).max(64),
    weights: z.record(z.string().min(1).max(64), z.number().min(0).max(1_000)),
    params: z.object({ k1: z.number().min(0).max(100), b: z.number().min(0).max(1) }).strict(),
    lexical: RetrievalLexicalSchema,
    entries: z.array(RetrievalEntrySchema).max(RETRIEVAL_MAX_ENTRIES),
  })
  .strict()

export type RetrievalIndexV1 = z.infer<typeof RetrievalIndexV1Schema>
