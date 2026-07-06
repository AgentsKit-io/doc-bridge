import { z } from 'zod'

export const MEMORY_CANDIDATE_SCHEMA_VERSION = 1 as const

export const MemorySourceSchema = z.enum([
  'cursor',
  'claude',
  'codex',
  'copilot',
  'agent-memory',
  'manual',
])

export const MemorySuggestedTypeSchema = z.enum([
  'user',
  'feedback',
  'project',
  'reference',
  'unknown',
])

export const MemoryCandidateV1Schema = z
  .object({
    schemaVersion: z.literal(MEMORY_CANDIDATE_SCHEMA_VERSION),
    id: z.string().min(1).max(256),
    source: MemorySourceSchema,
    rawPath: z.string().min(1).max(512).optional(),
    fact: z.string().min(1).max(8_000),
    why: z.string().max(4_000).optional(),
    howToApply: z.string().max(4_000).optional(),
    suggestedType: MemorySuggestedTypeSchema,
    confidence: z.number().min(0).max(1),
    references: z.array(z.string().min(1).max(512)).max(64),
  })
  .strict()

export type MemoryCandidateV1 = z.infer<typeof MemoryCandidateV1Schema>