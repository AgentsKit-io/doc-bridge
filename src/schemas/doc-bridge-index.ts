import { z } from 'zod'

import { AgentHandoffLegacySchema } from './agent-handoff.js'

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
    description: z.string().max(1024).optional(),
    links: z.array(z.string().min(1).max(512)).max(64).optional(),
    tags: z.array(z.string().min(1).max(64)).max(32).optional(),
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
  })
  .strict()

export type DocBridgeIndexV1 = z.infer<typeof DocBridgeIndexV1Schema>
export type KnowledgeEntry = z.infer<typeof KnowledgeEntrySchema>