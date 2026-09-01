import { contentHashForArtifactV1, sha256NormalizedV1 } from '../index-builder/content-hash.js'
import { z } from 'zod'

export const STUDY_PROTOCOL_SCHEMA_VERSION = 1 as const
export const STUDY_PROTOCOL_CONTENT_HASH_ALGO = 'sha256-normalized-v1' as const

const hash = z.string().regex(/^[a-f0-9]{64}$/)
const identifier = z.string().regex(/^[a-z][a-z0-9-]{0,127}$/)
const reference = z.string().regex(/^[a-z0-9][a-z0-9._:-]{0,255}$/)
const modelReference = z.string().regex(/^[a-z0-9][a-z0-9._:/-]{0,255}$/)
export const isSafeStudyText = (value: string): boolean => !/(?:^|[\\/])(?:Users|private|tmp|home)(?:[\\/])|(?:api[_-]?key|token|password|secret)\s*[:=]|-----BEGIN|https?:\/\//i.test(value)
const safeText = z.string().min(1).max(2_048).refine(
  isSafeStudyText,
  'Public study text cannot contain paths, URLs, credentials, or secret material',
)

const uniqueIds = (values: readonly string[], label: string): void => {
  if (new Set(values).size !== values.length) throw new Error(`Duplicate ${label} id.`)
}

const ModelSchema = z
  .object({
    id: identifier,
    role: z.enum(['low-cost', 'reference']),
    status: z.enum(['planned', 'pinned']),
    provider: identifier.optional(),
    model: modelReference.optional(),
    version: reference.optional(),
    promptContractHash: hash.optional(),
  })
  .strict()
  .superRefine((value, context) => {
    if (value.status === 'pinned' && (!value.provider || !value.model || !value.version)) {
      context.addIssue({ code: z.ZodIssueCode.custom, message: 'Pinned models require provider, model, and version.' })
    }
  })

const RepositorySchema = z
  .object({
    id: identifier,
    visibility: z.enum(['public', 'private', 'anonymized']),
    role: z.enum(['product', 'consumer']),
  })
  .strict()

const ScenarioSchema = z.object({
  id: identifier,
  label: safeText,
  source: z.enum(['repository-only', 'deterministic-doc-bridge', 'doc-bridge-registry-agent']),
  modelIds: z.array(identifier).min(1).max(16),
  registryAgent: z.enum(['none', 'configured']).optional(),
  requiresHumanApproval: z.boolean(),
}).strict()

const MetricSchema = z.object({
  id: identifier,
  family: z.enum(['discovery', 'task', 'documentation', 'operations', 'cost']),
  unit: z.enum(['count', 'milliseconds', 'tokens', 'bytes', 'ratio', 'percent', 'currency']),
  source: z.enum(['provider', 'runner', 'adjudicator', 'doc-bridge', 'human']),
  required: z.boolean(),
  description: safeText,
}).strict()

const OutcomeSchema = z.object({
  id: identifier,
  statement: safeText,
  checks: z.array(z.object({ id: identifier, command: safeText }).strict()).max(16).default([]),
  notApplicableReason: safeText.optional(),
}).strict().superRefine((value, context) => {
  if (!value.checks.length && !value.notApplicableReason) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['checks'], message: 'An outcome requires an executable check or an explicit not-applicable reason.' })
  }
  if (value.checks.length && value.notApplicableReason) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['notApplicableReason'], message: 'An outcome cannot have checks and a not-applicable reason.' })
  }
})

const BudgetSchema = z.object({
  maxTokensPerTask: z.number().int().positive(),
  maxRuntimeMsPerTask: z.number().int().positive(),
  maxRuns: z.number().int().positive(),
  maxNetworkRequests: z.number().int().nonnegative(),
}).strict()

const PrivacySchema = z.object({
  mode: z.literal('anonymized'),
  forbiddenFields: z.array(z.enum(['repository-content', 'paths', 'prompts', 'credentials', 'private-identifiers', 'raw-agent-responses'])).min(1).max(16),
  publicationRequiresHumanReview: z.literal(true),
}).strict()

const StoppingSchema = z.object({
  minControlledRounds: z.number().int().positive(),
  consecutiveNoMaterialImprovementRounds: z.number().int().positive(),
  targets: z.array(z.object({
    metricId: identifier,
    direction: z.enum(['decrease', 'increase', 'no-regression']),
    threshold: z.number().finite(),
  }).strict()).max(32),
}).strict()

const StudyProtocolPayloadSchema = z
  .object({
    type: z.literal('study-protocol'),
    schemaVersion: z.literal(STUDY_PROTOCOL_SCHEMA_VERSION),
    protocolVersion: reference,
    title: safeText,
    evidenceClasses: z.array(z.enum(['historical', 'controlled'])).min(1).max(2),
    repositories: z.array(RepositorySchema).min(1).max(64),
    taskCategories: z.array(z.enum(['discovery', 'architecture', 'documentation', 'implementation'])).min(1).max(4),
    models: z.array(ModelSchema).min(2).max(16),
    scenarios: z.array(ScenarioSchema).min(3).max(8),
    metrics: z.array(MetricSchema).min(1).max(128),
    outcomes: z.array(OutcomeSchema).min(1).max(64),
    budget: BudgetSchema,
    privacy: PrivacySchema,
    stopping: StoppingSchema,
  })
  .strict()

export const StudyProtocolV1Schema = StudyProtocolPayloadSchema.extend({
  contentHash: hash,
  contentHashAlgo: z.literal(STUDY_PROTOCOL_CONTENT_HASH_ALGO),
}).strict()

export type StudyProtocolV1 = z.infer<typeof StudyProtocolV1Schema>

const HistoricalMetricStatusSchema = z.enum(['missing', 'not-analyzed', 'blocked', 'not-applicable'])
const HistoricalRecordStatusSchema = z.enum(['validated', 'partially-validated', 'not-analyzed', 'blocked', 'not-applicable'])

const HistoricalEvidenceRecordPayloadSchema = z.object({
  id: identifier,
  evidenceClass: z.literal('historical'),
  observedAt: z.string().datetime(),
  subject: z.object({
    kind: z.enum(['consumer', 'aggregate']),
    id: identifier,
  }).strict(),
  source: z.object({
    kind: z.enum(['validation-plan', 'verification-run', 'benchmark', 'study-artifact', 'issue', 'pull-request']),
    reference,
  }).strict(),
  docBridgeVersion: reference.optional(),
  sourceRevisionHash: hash.optional(),
  snapshotHash: hash.optional(),
  reportHash: hash.optional(),
  workflowRunId: reference.optional(),
  verificationRunId: reference.optional(),
  status: HistoricalRecordStatusSchema,
  metrics: z.record(identifier, z.number().finite()).default({}),
  missingMetrics: z.array(z.object({
    metricId: identifier,
    status: HistoricalMetricStatusSchema,
    reason: safeText,
  }).strict()).default([]),
  limitations: z.array(safeText).min(1).max(32),
}).strict().superRefine((value, context) => {
  if (!Object.keys(value.metrics).length && !value.missingMetrics.length) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['metrics'], message: 'A historical record must contain metrics or explicit missing metrics.' })
  }
  uniqueIds(value.missingMetrics.map((metric) => metric.metricId), 'missing metric')
})

export const HistoricalEvidenceRecordV1Schema = HistoricalEvidenceRecordPayloadSchema
export type HistoricalEvidenceRecordV1 = z.infer<typeof HistoricalEvidenceRecordV1Schema>

const HistoricalEvidenceRegistryPayloadSchema = z.object({
  type: z.literal('historical-evidence-registry'),
  schemaVersion: z.literal(STUDY_PROTOCOL_SCHEMA_VERSION),
  registryVersion: reference,
  records: z.array(HistoricalEvidenceRecordV1Schema).max(10_000),
}).strict()

export const HistoricalEvidenceRegistryV1Schema = HistoricalEvidenceRegistryPayloadSchema.extend({
  contentHash: hash,
  contentHashAlgo: z.literal(STUDY_PROTOCOL_CONTENT_HASH_ALGO),
}).strict()

export type HistoricalEvidenceRegistryV1 = z.infer<typeof HistoricalEvidenceRegistryV1Schema>

const assertProtocolReferences = (protocol: StudyProtocolV1): void => {
  uniqueIds(protocol.repositories.map((item) => item.id), 'repository')
  uniqueIds(protocol.models.map((item) => item.id), 'model')
  uniqueIds(protocol.scenarios.map((item) => item.id), 'scenario')
  uniqueIds(protocol.metrics.map((item) => item.id), 'metric')
  uniqueIds(protocol.outcomes.map((item) => item.id), 'outcome')
  uniqueIds(protocol.outcomes.flatMap((item) => item.checks.map((check) => check.id)), 'outcome check')
  const modelIds = new Set(protocol.models.map((item) => item.id))
  const metricIds = new Set(protocol.metrics.map((item) => item.id))
  for (const scenario of protocol.scenarios) {
    for (const modelId of scenario.modelIds) if (!modelIds.has(modelId)) throw new Error(`Scenario ${scenario.id} references unknown model ${modelId}.`)
    if (scenario.source === 'doc-bridge-registry-agent' && scenario.registryAgent !== 'configured') throw new Error(`Scenario ${scenario.id} requires a configured Registry agent.`)
    if (scenario.source !== 'doc-bridge-registry-agent' && scenario.registryAgent === 'configured') throw new Error(`Scenario ${scenario.id} cannot configure a Registry agent.`)
  }
  for (const target of protocol.stopping.targets) if (!metricIds.has(target.metricId)) throw new Error(`Stopping target references unknown metric ${target.metricId}.`)
}

const assertHash = <T extends { readonly contentHash: string }>(artifact: T): T => {
  const expected = contentHashForArtifactV1(artifact)
  if (expected !== artifact.contentHash) throw new Error(`Invalid content hash: expected ${expected}.`)
  return artifact
}

export const createStudyProtocol = (input: unknown): StudyProtocolV1 => {
  const payload = StudyProtocolPayloadSchema.parse(input)
  const hashable = { ...payload, contentHashAlgo: STUDY_PROTOCOL_CONTENT_HASH_ALGO }
  const protocol = StudyProtocolV1Schema.parse({
    ...hashable,
    contentHash: sha256NormalizedV1(hashable),
  })
  assertProtocolReferences(protocol)
  return protocol
}

export const parseStudyProtocol = (input: unknown): StudyProtocolV1 => {
  const protocol = StudyProtocolV1Schema.parse(input)
  assertHash(protocol)
  assertProtocolReferences(protocol)
  return protocol
}

export const createHistoricalEvidenceRegistry = (input: unknown): HistoricalEvidenceRegistryV1 => {
  const payload = HistoricalEvidenceRegistryPayloadSchema.parse(input)
  const hashable = { ...payload, contentHashAlgo: STUDY_PROTOCOL_CONTENT_HASH_ALGO }
  return HistoricalEvidenceRegistryV1Schema.parse({
    ...hashable,
    contentHash: sha256NormalizedV1(hashable),
  })
}

export const parseHistoricalEvidenceRegistry = (input: unknown): HistoricalEvidenceRegistryV1 => {
  const registry = HistoricalEvidenceRegistryV1Schema.parse(input)
  return assertHash(registry)
}

export const validateHistoricalEvidenceRegistry = (
  registry: HistoricalEvidenceRegistryV1,
  protocol: StudyProtocolV1,
): void => {
  const repositoryIds = new Set(protocol.repositories.map((item) => item.id))
  uniqueIds(registry.records.map((record) => record.id), 'historical record')
  for (const record of registry.records) {
    if (record.subject.kind === 'consumer' && !repositoryIds.has(record.subject.id)) throw new Error(`Historical record ${record.id} references unknown consumer ${record.subject.id}.`)
  }
}

export const formatStudyProtocolText = (protocol: StudyProtocolV1): readonly string[] => [
  `Protocol: ${protocol.protocolVersion}`,
  `Repositories: ${protocol.repositories.length}`,
  `Models: ${protocol.models.length} (${protocol.models.filter((model) => model.status === 'pinned').length} pinned)`,
  `Scenarios: ${protocol.scenarios.length}`,
  `Task categories: ${protocol.taskCategories.join(', ')}`,
  `Metrics: ${protocol.metrics.length}`,
  `Outcomes mapped: ${protocol.outcomes.length}`,
  `Budget: ${protocol.budget.maxTokensPerTask} tokens/task, ${protocol.budget.maxRuntimeMsPerTask} ms/task, ${protocol.budget.maxRuns} runs`,
  `Privacy: ${protocol.privacy.mode}; human publication review: required`,
  `Content hash: ${protocol.contentHash}`,
]

export const formatHistoricalEvidenceText = (
  registry: HistoricalEvidenceRegistryV1,
): readonly string[] => {
  const statuses = registry.records.reduce<Record<string, number>>((counts, record) => ({ ...counts, [record.status]: (counts[record.status] ?? 0) + 1 }), {})
  const missing = registry.records.reduce((count, record) => count + record.missingMetrics.length, 0)
  return [
    `Registry: ${registry.registryVersion}`,
    `Records: ${registry.records.length}`,
    `Missing measurements: ${missing}`,
    `Statuses: ${Object.entries(statuses).sort(([a], [b]) => a.localeCompare(b)).map(([status, count]) => `${status}=${count}`).join(', ') || 'none'}`,
    `Content hash: ${registry.contentHash}`,
  ]
}
