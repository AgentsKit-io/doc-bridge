import { z } from 'zod'
import { CoverageSchema, EvidenceSchema, ProjectIdentitySchema } from './knowledge.js'

export const ChangeKindSchema = z.enum(['module', 'doc-path', 'symbol', 'package', 'cli-command', 'cli-flag', 'config-key', 'signature'])
export const ChangeIdentitySchema = z.object({
  id: z.string().min(1).max(256),
  ownerId: z.string().min(1).max(256).optional(),
  name: z.string().min(1).max(256),
  valueHash: z.string().regex(/^[a-f0-9]{64}$/).optional(),
  evidence: z.array(EvidenceSchema).max(64),
}).strict()
const ChangeShape = z.object({
  kind: ChangeKindSchema,
  op: z.enum(['added', 'removed', 'renamed', 'changed']),
  compatibility: z.literal('compatible').optional(),
  before: ChangeIdentitySchema.optional(),
  after: ChangeIdentitySchema.optional(),
}).strict()
export const ChangeSchema = ChangeShape.superRefine((change, context) => {
  const valid = change.op === 'added' ? !change.before && !!change.after
    : change.op === 'removed' ? !!change.before && !change.after : !!change.before && !!change.after
  if (change.compatibility && (change.kind !== 'signature' || change.op !== 'changed')) context.addIssue({ code: 'custom', message: 'Compatibility requires a changed signature.' })
  if (!valid) context.addIssue({ code: 'custom', message: 'Operation requires the applicable before/after identities.' })
})
const AnalysisIdentitySchema = z.object({
  configurationHash: z.string().regex(/^[a-f0-9]{64}$/),
  pipelineVersion: z.string().min(1).max(64),
  analyzerVersions: z.record(z.string().min(1).max(128), z.string().min(1).max(64)),
}).strict()
const ChangeSetShape = z.object({
  type: z.literal('change-set'),
  schemaVersion: z.literal(1),
  repository: ProjectIdentitySchema,
  analysis: z.object({ base: AnalysisIdentitySchema, head: AnalysisIdentitySchema }).strict(),
  branch: z.string().min(1).max(256).optional(),
  baseRevision: z.string().min(1).max(128),
  headRevision: z.string().min(1).max(128),
  release: z.discriminatedUnion('state', [
    z.object({ state: z.literal('unreleased') }).strict(),
    z.object({ state: z.literal('released'), version: z.string().min(1).max(256), eventId: z.string().min(1).max(256), purl: z.string().min(5).max(512) }).strict(),
  ]),
  // Ecosystem adapters will supply purl/version mappings; core does not infer them.
  packages: z.array(z.object({ id: z.string().min(1).max(256), purl: z.string().min(1).max(512), version: z.string().min(1).max(256).optional() }).strict()).max(50_000),
  changes: z.array(ChangeShape).max(100_000),
  contentHash: z.string().regex(/^[a-f0-9]{64}$/),
  contentHashAlgo: z.literal('sha256-semantic-v1'),
  coverage: z.array(CoverageSchema).max(2_100),
}).strict()
export const ChangeSetV1Schema = ChangeSetShape.extend({ changes: z.array(ChangeSchema).max(100_000) })
export const ChangeSetV1JsonSchema: Record<string, unknown> & { $id: string } = {
  ...z.toJSONSchema(ChangeSetShape, { target: 'draft-2020-12' }),
  $id: 'https://agentskit.io/schemas/doc-bridge/change-set-v1.schema.json',
  title: 'ChangeSet v1',
}
export type ChangeSetV1 = z.infer<typeof ChangeSetV1Schema>
export type Change = z.infer<typeof ChangeSchema>
