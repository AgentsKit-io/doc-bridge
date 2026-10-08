import { z } from 'zod'
import { CoverageSchema, DiagnosticSeveritySchema, EvidenceSchema, FindingStatusSchema } from './knowledge.js'

const hash = z.string().regex(/^[a-f0-9]{64}$/)
const text = (max: number) => z.string().min(1).max(max)
export const FindingV1Schema = z.object({
  type: z.literal('finding'), schemaVersion: z.literal(1), id: text(128),
  category: text(128), assertion: z.object({ document: text(512), key: text(512) }).strict(),
  evidenceHash: hash, status: z.lazy(() => FindingStatusSchema), layer: z.enum(['L0', 'L1', 'L2']),
  confidence: z.number().min(0).max(1), severity: z.lazy(() => DiagnosticSeveritySchema),
  entities: z.array(text(256)).max(64), evidence: z.array(z.lazy(() => EvidenceSchema)).min(1).max(64),
  routing: z.enum(['proposed', 'excluded', 'routed-to-L2', 'pending-version']),
  documentationUpdate: z.literal('updated-in-this-change').optional(),
  priority: z.literal('low').optional(),
  changedDescendantPaths: z.array(z.string().min(1).max(512)).max(64).optional(),
  generator: text(512).optional(), coverage: z.array(z.lazy(() => CoverageSchema)).max(32),
  provenance: z.object({ repository: text(512), revision: text(128), configurationHash: hash }).strict(),
}).strict()
export type FindingV1 = z.infer<typeof FindingV1Schema>

export const DecisionV1Schema = z.object({
  type: z.literal('decision'), schemaVersion: z.literal(1),
  target: z.object({ kind: z.enum(['finding', 'remediation']), id: text(128) }).strict(),
  by: text(256), reason: z.enum(['not-a-divergence', 'wrong-fix', 'code-should-change', 'out-of-scope']),
  evidenceHash: hash,
}).strict()
export type DecisionV1 = z.infer<typeof DecisionV1Schema>

export const RegionRangeSchema = z.object({ start: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER), end: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER) }).strict()
  .refine(range => range.end >= range.start, 'Invalid region range')
export const RegionEditSchema = z.object({
  path: text(512), range: RegionRangeSchema, expectedRegionHash: hash,
  original: z.string().max(100_000), replacement: z.string().max(100_000),
  anchors: z.object({ before: z.string().max(1_024), after: z.string().max(1_024), search: RegionRangeSchema.refine(range => range.end - range.start <= 1_000_000, 'Anchor search exceeds byte budget') }).strict().optional(),
  lineStart: z.number().int().positive(), lineEnd: z.number().int().positive(),
}).strict().refine(edit => edit.lineEnd >= edit.lineStart, 'Invalid line hints')
export const RemediationV1Schema = z.object({
  type: z.literal('remediation'), schemaVersion: z.literal(1), id: text(128), findingId: text(128), evidenceHash: hash,
  regionHashAlgo: z.literal('sha256-bytes-v1'), coordinates: z.literal('utf8-byte-half-open-v1'),
  baseRevision: text(128), configurationHash: hash, edits: z.array(RegionEditSchema).min(1).max(256),
  diff: z.string().max(1_000_000), status: z.enum(['proposed', 'in-review', 'merged', 'rejected', 'stale', 'superseded']),
  binding: z.object({ revision: text(128), evidenceHash: hash, configurationHash: hash, artifactHash: hash }).strict(),
  revalidation: z.object({ fromRevision: text(128), toRevision: text(128), evidenceHash: hash, configurationHash: hash }).strict().optional(),
  approval: z.object({ by: text(256), bindingHash: hash }).strict().optional(),
  presentation: z.object({ revision: text(128), artifactHash: hash }).strict().optional(),
}).strict()
export type RemediationV1 = z.infer<typeof RemediationV1Schema>
export type RegionEdit = z.infer<typeof RegionEditSchema>
