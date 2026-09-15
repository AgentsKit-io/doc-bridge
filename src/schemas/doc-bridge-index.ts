import { z } from 'zod'

import { AgentHandoffLegacySchema } from './agent-handoff.js'
import { RetrievalIndexV1Schema } from './retrieval-index.js'

export const INDEX_SCHEMA_VERSION = 1 as const

export const ContentHashAlgoSchema = z.literal('sha256-normalized-v1')

export const EcosystemPropertySchema = z
  .object({
    id: z.string().min(1).max(64),
    name: z.string().min(1).max(128),
    url: z.string().url().optional(),
    llms: z.string().url().optional(),
  })
  .strict()

export const KnowledgeEntrySchema = z
  .object({
    id: z.string().min(1).max(256),
    type: z.string().min(1).max(128),
    title: z.string().min(1).max(256),
    path: z.string().min(1).max(512),
    description: z.string().max(2_048).optional(),
    /** Flattened body excerpt for full-text search (not for display). */
    body: z.string().max(8_000).optional(),
    links: z.array(z.string().min(1).max(512)).max(64).optional(),
    tags: z.array(z.string().min(1).max(64)).max(32).optional(),
    /** Names a module exports. The field an agent's symbol query matches against. */
    symbols: z.array(z.string().min(1).max(128)).max(256).optional(),
    /** Hash of the file this entry was projected from, so a stale entry is detectable per file. */
    contentHash: z.string().regex(/^[a-f0-9]{64}$/).optional(),
  })
  .strict()

export const CapabilityRefSchema = z
  .object({
    id: z.string().min(1).max(256),
    kind: z.string().min(1).max(64),
    description: z.string().max(512).optional(),
  })
  .strict()

export const OwnershipRecordSchema = z
  .object({
    id: z.string().min(1).max(256),
    path: z.string().min(1).max(512),
    group: z.string().min(1).max(128).optional(),
    layer: z.string().min(1).max(32).optional(),
    purpose: z.string().max(1024).optional(),
    checks: z.array(z.string().min(1).max(256)).max(32),
    /** Where `checks` came from, decided where the decision is made rather than guessed later. */
    checksSource: z.enum(['ownership', 'frontmatter', 'package-scripts', 'default']).optional(),
    agentDoc: z.string().min(1).max(512).optional(),
    humanDoc: z.string().min(1).max(512).optional(),
    readme: z.string().min(1).max(512).optional(),
  })
  .strict()

export const IndexLookupSchema = z
  .object({
    packages: z.array(z.string().min(1).max(256)).max(2_000),
    ownership: z.record(z.string().min(1).max(256), OwnershipRecordSchema).optional(),
    intents: z
      .record(
        z.string().min(1).max(128),
        z
          .object({
            id: z.string().min(1).max(128),
            title: z.string().min(1).max(256),
            paths: z.array(z.string().min(1).max(512)).max(32),
          })
          .strict(),
      )
      .optional(),
    changes: z
      .record(
        z.string().min(1).max(128),
        z
          .object({
            id: z.string().min(1).max(128),
            title: z.string().min(1).max(256),
            startHere: z.string().min(1).max(512),
            relatedPackages: z.array(z.string().min(1).max(256)).max(32).optional(),
          })
          .strict(),
      )
      .optional(),
  })
  .strict()

/**
 * Fingerprint of the repository files the index was built from. Freshness can then be checked by
 * re-hashing the inputs instead of rebuilding the whole index on every query.
 */
export const RepositoryInputsSchema = z
  .object({
    hash: z.string().regex(/^[a-f0-9]{64}$/),
    fileCount: z.number().int().nonnegative().max(1_000_000),
    projectionVersion: z.number().int().nonnegative().max(1_000),
    /** A safety limit stopped the walk, so the projection does not cover the whole repository. */
    incomplete: z.boolean().optional(),
  })
  .strict()

/**
 * How this index was prepared for ranking. Recorded so a ranking is reproducible: a different
 * stopword list or a different field weight produces a different artifact, visibly.
 */
export const RetrievalMetadataSchema = z
  .object({
    lexiconVersion: z.number().int().nonnegative().max(1_000),
    weights: z.record(z.string().min(1).max(64), z.number().min(0).max(1_000)),
    params: z
      .object({ k1: z.number().min(0).max(100), b: z.number().min(0).max(1) })
      .strict()
      .optional(),
  })
  .strict()

export const DocBridgeIndexV1Schema = z
  .object({
    schemaVersion: z.literal(INDEX_SCHEMA_VERSION),
    contentHash: z.string().regex(/^[a-f0-9]{64}$/),
    contentHashAlgo: ContentHashAlgoSchema,
    generatedAt: z.string().datetime().optional(),
    project: z
      .object({
        name: z.string().min(1).max(128),
        root: z.string().min(1).max(512).optional(),
      })
      .strict()
      .optional(),
    properties: z.array(EcosystemPropertySchema).max(16).optional(),
    knowledge: z.array(KnowledgeEntrySchema).max(10_000),
    capabilities: z.array(CapabilityRefSchema).max(5_000).optional(),
    handoffs: z.record(z.string().min(1).max(256), AgentHandoffLegacySchema).optional(),
    lookup: IndexLookupSchema.optional(),
    inputs: RepositoryInputsSchema.optional(),
    retrieval: RetrievalMetadataSchema.optional(),
    /**
     * The retrieval projection of the snapshot: what ranking reads. `knowledge[]` stays for every
     * reader that predates it, and the two describe the same entries.
     */
    projection: RetrievalIndexV1Schema.optional(),
  })
  .strict()

export type DocBridgeIndexV1 = z.infer<typeof DocBridgeIndexV1Schema>
export type KnowledgeEntry = z.infer<typeof KnowledgeEntrySchema>
export type RepositoryInputs = z.infer<typeof RepositoryInputsSchema>
export type RetrievalMetadata = z.infer<typeof RetrievalMetadataSchema>