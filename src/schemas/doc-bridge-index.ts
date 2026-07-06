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
  })
  .strict()

export type DocBridgeIndexV1 = z.infer<typeof DocBridgeIndexV1Schema>
export type KnowledgeEntry = z.infer<typeof KnowledgeEntrySchema>