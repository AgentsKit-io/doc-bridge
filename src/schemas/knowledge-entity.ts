import { z } from 'zod'
import { CoverageSchema } from './knowledge.js'

export const KNOWLEDGE_ENTITY_SCHEMA_VERSION = 1 as const
const text = z.string().min(1).max(512)
const id = z.string().min(1).max(256)
const hash = z.string().regex(/^[a-f0-9]{64}$/)
const path = text.refine(value => !value.startsWith('/') && !value.includes('\\') && !value.split('/').includes('..'), 'Expected a repository-relative path')
export const KnowledgeEntityEvidenceV1Schema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('document-region'), path, lineStart: z.number().int().positive(), lineEnd: z.number().int().positive(), regionHash: hash }).strict().refine(value => value.lineEnd >= value.lineStart),
  z.object({ kind: z.literal('commit'), sha: z.string().regex(/^[a-f0-9]{40,64}$/) }).strict(),
  z.object({ kind: z.literal('fact'), factId: id }).strict(),
])
export const KnowledgeEntityLinkV1Schema = z.object({
  kind: z.enum(['affected-path', 'affected-fact', 'defines-symbol', 'supersedes', 'superseded-by']),
  target: text,
  symbol: z.string().min(1).max(256).optional(),
}).strict()
export const KnowledgeEntityV1Schema = z.object({
  schemaVersion: z.literal(KNOWLEDGE_ENTITY_SCHEMA_VERSION),
  id,
  kind: z.enum(['decision', 'concept', 'change']),
  name: z.string().min(1).max(256),
  aliases: z.array(z.string().min(1).max(256)).max(32),
  evidence: z.array(KnowledgeEntityEvidenceV1Schema).min(1).max(64),
  links: z.array(KnowledgeEntityLinkV1Schema).max(64),
  status: z.string().min(1).max(128).optional(),
  date: z.string().min(1).max(128).optional(),
  conventional: z.object({ type: z.string().min(1).max(128), scope: z.string().min(1).max(128).optional(), breaking: z.boolean() }).strict().optional(),
}).strict()
export const MemoryEntityRelationV1Schema = z.object({
  kind: z.literal('memory-supports'),
  candidateId: id,
  target: id,
  evidence: z.object({
    kind: z.enum(['id', 'alias', 'path']),
    value: text,
    rawPath: path.optional(),
    factHash: hash,
  }).strict(),
}).strict()
export type MemoryEntityRelationV1 = z.infer<typeof MemoryEntityRelationV1Schema>
export const KnowledgeEntitiesV1Schema = z.object({
  schemaVersion: z.literal(KNOWLEDGE_ENTITY_SCHEMA_VERSION),
  entities: z.array(KnowledgeEntityV1Schema).max(10_000),
  memoryRelations: z.array(MemoryEntityRelationV1Schema).max(10_000).optional(),
  coverage: z.array(CoverageSchema).max(32),
}).strict().superRefine((value, context) => {
  const ids = new Set<string>()
  value.entities.forEach((entity, index) => {
    if (ids.has(entity.id)) context.addIssue({ code: 'custom', path: ['entities', index, 'id'], message: 'Duplicate entity id' })
    ids.add(entity.id)
  })
  value.memoryRelations?.forEach((relation, index) => {
    if (!ids.has(relation.target)) context.addIssue({ code: 'custom', path: ['memoryRelations', index, 'target'], message: 'Unknown memory relation entity target' })
  })
})
export type KnowledgeEntityV1 = z.infer<typeof KnowledgeEntityV1Schema>
export type KnowledgeEntityEvidenceV1 = z.infer<typeof KnowledgeEntityEvidenceV1Schema>
export type KnowledgeEntityLinkV1 = z.infer<typeof KnowledgeEntityLinkV1Schema>
export type KnowledgeEntitiesV1 = z.infer<typeof KnowledgeEntitiesV1Schema>
