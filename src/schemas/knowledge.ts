import { z } from 'zod'

export const KNOWLEDGE_SCHEMA_VERSION = 1 as const
export const KNOWLEDGE_CONTENT_HASH_ALGO = 'sha256-normalized-v1' as const

const hash = z.string().regex(/^[a-f0-9]{64}$/)
const boundedString = (max: number) => z.string().min(1).max(max)

export const ProvenanceSchema = z.enum(['observed', 'declared', 'proposed'])
export type Provenance = z.infer<typeof ProvenanceSchema>

export const FindingStatusSchema = z.enum([
  'confirmed',
  'undocumented',
  'stale-or-unverified',
  'conflict',
  'unresolved',
  'not-analyzed',
])
export type FindingStatus = z.infer<typeof FindingStatusSchema>

export const DiagnosticSeveritySchema = z.enum(['off', 'info', 'warn', 'error'])
export type DiagnosticSeverity = z.infer<typeof DiagnosticSeveritySchema>

export const EvidenceSourceSchema = z.enum([
  'code',
  'configuration',
  'documentation',
  'agent',
  'derived',
])

export const EvidenceSchema = z
  .object({
    source: EvidenceSourceSchema,
    path: boundedString(512),
    lineStart: z.number().int().positive().optional(),
    lineEnd: z.number().int().positive().optional(),
    contentHash: hash.optional(),
    context: z.string().max(1_024).optional(),
  })
  .strict()
  .superRefine((value, context) => {
    if (value.lineStart !== undefined && value.lineEnd !== undefined && value.lineEnd < value.lineStart) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['lineEnd'],
        message: 'Must be greater than or equal to lineStart',
      })
    }
  })
export type Evidence = z.infer<typeof EvidenceSchema>

export const CoverageStatusSchema = z.enum(['complete', 'partial', 'not-analyzed'])

export const CoverageSchema = z
  .object({
    analyzer: boundedString(128),
    scope: boundedString(512),
    status: CoverageStatusSchema,
    reason: z.string().max(1_024).optional(),
    evidence: z.array(EvidenceSchema).max(32).optional(),
  })
  .strict()
export type Coverage = z.infer<typeof CoverageSchema>

export const ProjectIdentitySchema = z
  .object({
    name: boundedString(128),
    root: boundedString(512).optional(),
  })
  .strict()

const ArtifactMetadata = {
  schemaVersion: z.literal(KNOWLEDGE_SCHEMA_VERSION),
  contentHash: hash,
  contentHashAlgo: z.literal(KNOWLEDGE_CONTENT_HASH_ALGO),
  project: ProjectIdentitySchema,
  sourceRevision: boundedString(128),
  sourceRevisionKind: z.enum(['git', 'content']),
  configurationHash: hash,
  pipelineVersion: boundedString(64),
  analyzerVersions: z.record(boundedString(128), boundedString(64)),
}

export const EntitySchema = z
  .object({
    id: boundedString(256),
    kind: boundedString(128),
    name: boundedString(256),
    path: boundedString(512).optional(),
    aliases: z.array(boundedString(256)).max(32).optional(),
    provenance: ProvenanceSchema,
    evidence: z.array(EvidenceSchema).max(64),
    metadata: z.record(z.unknown()).optional(),
  })
  .strict()
export type KnowledgeEntity = z.infer<typeof EntitySchema>

export const RelationSchema = z
  .object({
    id: boundedString(256),
    kind: boundedString(128),
    from: boundedString(256),
    to: boundedString(256),
    discriminator: boundedString(256).optional(),
    provenance: ProvenanceSchema,
    evidence: z.array(EvidenceSchema).max(64),
    metadata: z.record(z.unknown()).optional(),
  })
  .strict()
export type KnowledgeRelation = z.infer<typeof RelationSchema>

export const DiscoverySnapshotV1Schema = z
  .object({
    type: z.literal('discovery-snapshot'),
    ...ArtifactMetadata,
    entities: z.array(EntitySchema).max(50_000),
    relations: z.array(RelationSchema).max(100_000),
    coverage: z.array(CoverageSchema).max(1_000),
  })
  .strict()
  .superRefine((value, context) => {
    const entityIds = new Set<string>()
    for (const [index, entity] of value.entities.entries()) {
      if (entityIds.has(entity.id)) {
        context.addIssue({ code: z.ZodIssueCode.custom, path: ['entities', index, 'id'], message: `Duplicate entity id: ${entity.id}` })
      }
      entityIds.add(entity.id)
    }

    const relationIds = new Set<string>()
    for (const [index, relation] of value.relations.entries()) {
      if (relationIds.has(relation.id)) {
        context.addIssue({ code: z.ZodIssueCode.custom, path: ['relations', index, 'id'], message: `Duplicate relation id: ${relation.id}` })
      }
      relationIds.add(relation.id)
    }
  })
export type DiscoverySnapshotV1 = z.infer<typeof DiscoverySnapshotV1Schema>

export const DiagnosticSchema = z
  .object({
    id: boundedString(256),
    code: boundedString(128),
    status: FindingStatusSchema,
    severity: DiagnosticSeveritySchema,
    message: boundedString(2_048),
    evidence: z.array(EvidenceSchema).max(64),
    entityIds: z.array(boundedString(256)).max(64).optional(),
    relationIds: z.array(boundedString(256)).max(64).optional(),
    remediation: z.string().max(2_048).optional(),
  })
  .strict()
export type KnowledgeDiagnostic = z.infer<typeof DiagnosticSchema>

export const ReconciliationReportV1Schema = z
  .object({
    type: z.literal('reconciliation-report'),
    ...ArtifactMetadata,
    snapshotHash: hash,
    diagnostics: z.array(DiagnosticSchema).max(100_000),
    summary: z
      .object({
        entityCount: z.number().int().nonnegative(),
        relationCount: z.number().int().nonnegative(),
        diagnosticCount: z.number().int().nonnegative(),
      })
      .strict(),
  })
  .strict()
export type ReconciliationReportV1 = z.infer<typeof ReconciliationReportV1Schema>

export const WorkflowStateSchema = z.enum([
  'created',
  'discovering',
  'analyzed',
  'compared',
  'awaiting-agent',
  'proposed',
  'awaiting-approval',
  'validating',
  'delivered',
  'failed',
  'cancelled',
  'stale',
  'superseded',
])
export type WorkflowState = z.infer<typeof WorkflowStateSchema>

export const WorkflowStepSchema = z
  .object({
    name: boundedString(128),
    status: z.enum(['pending', 'running', 'completed', 'failed', 'skipped']),
    inputHash: hash,
    outputHash: hash.optional(),
    artifactRefs: z.array(boundedString(512)).max(32).optional(),
  })
  .strict()
export type WorkflowStep = z.infer<typeof WorkflowStepSchema>

export const WorkflowTransitionSchema = z
  .object({
    from: WorkflowStateSchema.nullable(),
    to: WorkflowStateSchema,
    at: z.string().datetime(),
    reason: z.string().max(1_024).optional(),
  })
  .strict()
export type WorkflowTransition = z.infer<typeof WorkflowTransitionSchema>

export const WorkflowRunV1Schema = z
  .object({
    type: z.literal('workflow-run'),
    ...ArtifactMetadata,
    runId: boundedString(128),
    state: WorkflowStateSchema,
    steps: z.array(WorkflowStepSchema).max(32),
    transitions: z.array(WorkflowTransitionSchema).max(1_000),
    artifactRefs: z.array(boundedString(512)).max(128),
  })
  .strict()
export type WorkflowRunV1 = z.infer<typeof WorkflowRunV1Schema>

export const ProposalOriginSchema = z
  .object({
    kind: z.enum(['registry-agent', 'manual', 'deterministic']),
    id: boundedString(256).optional(),
    version: boundedString(64).optional(),
    provider: boundedString(128).optional(),
    model: boundedString(256).optional(),
    capabilities: z.array(boundedString(128)).max(32).optional(),
  })
  .strict()
  .superRefine((value, context) => {
    if (value.kind === 'registry-agent' && value.id === undefined) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ['id'], message: 'Registry agent origin requires an id' })
    }
  })

export const AgentProposalV1Schema = z
  .object({
    type: z.literal('agent-proposal'),
    ...ArtifactMetadata,
    proposalId: boundedString(128),
    baseSnapshotHash: hash,
    baseReportHash: hash,
    relatedDiagnosticIds: z.array(boundedString(256)).max(64),
    rationale: boundedString(4_000),
    confidence: z.number().min(0).max(1),
    evidence: z.array(EvidenceSchema).max(128),
    intendedChanges: z.array(boundedString(4_000)).max(64),
    origin: ProposalOriginSchema,
    checks: z.array(boundedString(512)).max(32),
  })
  .strict()
export type AgentProposalV1 = z.infer<typeof AgentProposalV1Schema>

export const FixProposalStatusSchema = z.enum(['proposed', 'approved', 'rejected', 'stale', 'applied', 'failed'])

export const AffectedFileSchema = z
  .object({
    path: boundedString(512),
    contentHash: hash,
  })
  .strict()

export const FixChangeSchema = z
  .object({
    path: boundedString(512),
    before: z.string().max(100_000),
    after: z.string().max(100_000),
  })
  .strict()
export type FixChange = z.infer<typeof FixChangeSchema>

export const FixProposalV1Schema = z
  .object({
    type: z.literal('fix-proposal'),
    ...ArtifactMetadata,
    proposalId: boundedString(128),
    baseRevision: boundedString(128),
    affectedFiles: z.array(AffectedFileSchema).max(256),
    changes: z.array(FixChangeSchema).max(256).optional(),
    preconditions: z.array(boundedString(2_048)).max(64),
    diff: boundedString(100_000),
    postconditions: z.array(boundedString(2_048)).max(64),
    approval: z
      .object({
        proposalHash: hash,
        approvedAt: z.string().datetime(),
        approvedBy: boundedString(256),
      })
      .strict()
      .optional(),
    status: FixProposalStatusSchema,
  })
  .strict()
  .superRefine((value, context) => {
    if ((value.status === 'approved' || value.status === 'applied') && value.approval === undefined) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['approval'],
        message: `Fix proposal status ${value.status} requires an approval record`,
      })
    }
  })
export type FixProposalV1 = z.infer<typeof FixProposalV1Schema>

export type KnowledgeArtifactV1 =
  | DiscoverySnapshotV1
  | ReconciliationReportV1
  | WorkflowRunV1
  | AgentProposalV1
  | FixProposalV1
