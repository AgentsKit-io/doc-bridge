import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { minimatch } from 'minimatch'

import type { DocumentationAuditConfig } from '../config/schema.js'
import { contentHashForArtifactV1, sha256NormalizedV1 } from '../index-builder/content-hash.js'
import { frontmatterString, parseFrontmatter } from '../lib/markdown.js'
import type { DocumentationDiagnostic } from '../discovery/documentation.js'
import {
  DiagnosticSeveritySchema,
  EvidenceSchema,
  FindingStatusSchema,
  type DiscoverySnapshotV1,
  type Evidence,
  type FindingStatus,
  type ReconciliationReportV1,
} from '../schemas/knowledge.js'
import { z } from 'zod'

export const DOCUMENTATION_AUDIT_SCHEMA_VERSION = 1 as const

const AuditCategorySchema = z.enum([
  'quality',
  'coverage',
  'structure-gap',
  'contradiction',
  'stale',
  'redundancy',
  'generated-freshness',
  'limitation',
])
const AuditConfidenceSchema = z.enum(['high', 'medium', 'low'])
const DocumentationTierSchema = z.enum(['tier-0', 'tier-1', 'tier-2'])
const DocumentationDimensionStatusSchema = z.enum(['validated', 'partial', 'not-analyzed'])
const DimensionAssessmentSchema = z.object({
  status: DocumentationDimensionStatusSchema,
  reason: z.string().min(1).max(1_024),
}).strict()

export const DocumentationAuditFindingSchema = z.object({
  id: z.string().regex(/^[a-f0-9]{64}$/),
  code: z.string().min(1).max(128),
  category: AuditCategorySchema,
  status: FindingStatusSchema,
  severity: DiagnosticSeveritySchema,
  confidence: AuditConfidenceSchema,
  blocking: z.boolean(),
  message: z.string().min(1).max(2_048),
  evidence: z.array(EvidenceSchema).max(64),
  remediation: z.string().max(2_048).optional(),
}).strict()

export const DocumentationAuditDocumentSchema = z.object({
  path: z.string().min(1).max(512),
  classification: z.object({
    type: z.string().min(1).max(128),
    audience: z.string().min(1).max(128),
    lifecycle: z.string().min(1).max(128),
    tier: DocumentationTierSchema,
    critical: z.boolean(),
  }).strict(),
  metadata: z.object({
    owner: z.boolean(),
    lifecycle: z.boolean(),
    sourceOfTruth: z.boolean(),
    validationPath: z.boolean(),
    complete: z.boolean(),
    missing: z.array(z.enum(['owner', 'lifecycle', 'sourceOfTruth', 'validationPath'])).max(4),
  }).strict(),
  dimensions: z.object({
    correctness: DimensionAssessmentSchema,
    completeness: DimensionAssessmentSchema,
    clarity: DimensionAssessmentSchema,
    agentEfficiency: DimensionAssessmentSchema,
    maintainability: DimensionAssessmentSchema,
  }).strict(),
  example: z.object({ present: z.boolean(), validation: DocumentationDimensionStatusSchema }).strict(),
}).strict()

export type DocumentationAuditDocument = z.infer<typeof DocumentationAuditDocumentSchema>

export const DocumentationAuditReportV1Schema = z.object({
  type: z.literal('documentation-audit-report'),
  schemaVersion: z.literal(DOCUMENTATION_AUDIT_SCHEMA_VERSION),
  contentHash: z.string().regex(/^[a-f0-9]{64}$/),
  contentHashAlgo: z.literal('sha256-normalized-v1'),
  project: z.object({ name: z.string().min(1).max(128), root: z.string().max(512).optional() }).strict(),
  sourceRevision: z.string().min(1).max(128),
  sourceRevisionKind: z.enum(['git', 'content']),
  configurationHash: z.string().regex(/^[a-f0-9]{64}$/),
  pipelineVersion: z.string().min(1).max(64),
  analyzerVersions: z.record(z.string().min(1).max(128), z.string().min(1).max(64)),
  snapshotHash: z.string().regex(/^[a-f0-9]{64}$/),
  reconciliationHash: z.string().regex(/^[a-f0-9]{64}$/),
  status: z.enum(['pass', 'needs-review', 'blocked']),
  findings: z.array(DocumentationAuditFindingSchema).max(100_000),
  metrics: z.object({
    documentCount: z.number().int().nonnegative(),
    generatedDocumentCount: z.number().int().nonnegative(),
    packageCount: z.number().int().nonnegative(),
    coveredPackageCount: z.number().int().nonnegative(),
    coverageRate: z.number().min(0).max(1).nullable(),
    documentsWithTitle: z.number().int().nonnegative(),
    titleRate: z.number().min(0).max(1).nullable(),
    documentsWithExamples: z.number().int().nonnegative(),
    examplesRate: z.number().min(0).max(1).nullable(),
    documentsMeetingRequiredSections: z.number().int().nonnegative(),
    requiredSectionsRate: z.number().min(0).max(1).nullable(),
    exactDuplicateGroups: z.number().int().nonnegative(),
    structureGapCount: z.number().int().nonnegative(),
    contradictionCount: z.number().int().nonnegative(),
    staleCount: z.number().int().nonnegative(),
    notAnalyzedCount: z.number().int().nonnegative(),
    blockingCount: z.number().int().nonnegative(),
    tierCounts: z.object({ 'tier-0': z.number().int().nonnegative(), 'tier-1': z.number().int().nonnegative(), 'tier-2': z.number().int().nonnegative() }).strict(),
    criticalDocumentCount: z.number().int().nonnegative(),
    criticalDocumentsWithOwner: z.number().int().nonnegative(),
    criticalDocumentsWithLifecycle: z.number().int().nonnegative(),
    criticalDocumentsWithSourceOfTruth: z.number().int().nonnegative(),
    criticalDocumentsWithValidationPath: z.number().int().nonnegative(),
    dimensionStatus: z.object({
      correctness: z.object({ validated: z.number().int().nonnegative(), partial: z.number().int().nonnegative(), 'not-analyzed': z.number().int().nonnegative() }).strict(),
      completeness: z.object({ validated: z.number().int().nonnegative(), partial: z.number().int().nonnegative(), 'not-analyzed': z.number().int().nonnegative() }).strict(),
      clarity: z.object({ validated: z.number().int().nonnegative(), partial: z.number().int().nonnegative(), 'not-analyzed': z.number().int().nonnegative() }).strict(),
      agentEfficiency: z.object({ validated: z.number().int().nonnegative(), partial: z.number().int().nonnegative(), 'not-analyzed': z.number().int().nonnegative() }).strict(),
      maintainability: z.object({ validated: z.number().int().nonnegative(), partial: z.number().int().nonnegative(), 'not-analyzed': z.number().int().nonnegative() }).strict(),
    }).strict(),
  }).strict(),
  documentAssessments: z.array(DocumentationAuditDocumentSchema).max(100_000),
  generatedDocuments: z.array(z.object({ path: z.string().min(1).max(512), freshness: z.literal('not-analyzed') }).strict()).max(128),
  limitations: z.array(z.string().min(1).max(1_024)).max(32),
}).strict()

export type DocumentationAuditFinding = z.infer<typeof DocumentationAuditFindingSchema>
export type DocumentationAuditReportV1 = z.infer<typeof DocumentationAuditReportV1Schema>

type DocumentInput = { readonly path: string; readonly content: string }

const normalizedPath = (path: string): string => path.replaceAll('\\', '/').replace(/^\.\//, '')
const evidenceFor = (path: string, lineStart?: number): Evidence => ({
  source: 'documentation',
  path: normalizedPath(path),
  ...(lineStart === undefined ? {} : { lineStart }),
})
const derivedEvidence: Evidence = { source: 'derived', path: '.doc-bridge/documentation-audit' }
const words = (content: string): number => content.replace(/```[\s\S]*?```/g, ' ').match(/[A-Za-z0-9][A-Za-z0-9'-]*/g)?.length ?? 0
const hasTitle = (content: string): boolean => {
  if (frontmatterString(parseFrontmatter(content).data, 'title')) return true
  return /^\s*#\s+\S/m.test(content) || /<h1(?:\s[^>]*)?>\s*[^<]+\s*<\/h1>/i.test(content)
}
const hasExample = (content: string): boolean => /```[\s\S]*?```/m.test(content) || /^#{1,6}\s+(?:examples?|usage)\b/im.test(content)
const hasHeading = (content: string, section: string): boolean => {
  const escaped = section.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return new RegExp(`^#{1,6}\\s+${escaped}\\s*$`, 'im').test(content)
}
const bodyForDuplicate = (content: string): string => {
  const lines = content.replace(/^\uFEFF/, '').split(/\r?\n/)
  const start = lines[0] === '---' ? lines.findIndex((line, index) => index > 0 && line === '---') + 1 : 0
  return lines.slice(start).join('\n').replace(/\s+/g, ' ').trim().toLocaleLowerCase()
}
const matches = (path: string, patterns: readonly string[]): boolean => patterns.some((pattern) => minimatch(path, pattern, { dot: true }))
const rate = (count: number, total: number): number | null => total ? count / total : null
type DocumentationTier = z.infer<typeof DocumentationTierSchema>
type DocumentationDimensionStatus = z.infer<typeof DocumentationDimensionStatusSchema>

const metadataPresent = (content: string, key: string): boolean => {
  const value = parseFrontmatter(content).data[key]
  return typeof value === 'string' ? value.trim().length > 0 : value === true
}

const inferredDocumentType = (path: string): string => {
  const lower = path.toLocaleLowerCase()
  if (lower === 'agents.md' || lower.endsWith('/agents.md') || lower.includes('/for-agents/')) return 'agent-guidance'
  if (lower.includes('/adr/') || lower.startsWith('adr/')) return 'architecture-decision'
  if (lower.includes('runbook') || lower.includes('/operations/')) return 'runbook'
  if (lower.includes('security')) return 'security'
  if (lower.includes('contribut')) return 'contribution'
  if (lower.includes('architecture')) return 'architecture'
  if (lower.includes('/api/') || lower.includes('/reference/')) return 'reference'
  if (lower.includes('/example') || lower.includes('/recipe')) return 'example'
  return 'guide'
}

const inferredAudience = (path: string): string => {
  const lower = path.toLocaleLowerCase()
  if (lower.includes('/agent-corpus/') || lower.includes('/for-agents/') || lower.endsWith('agents.md')) return 'agent'
  if (lower === 'readme.md' || lower.includes('/readme.')) return 'human-and-agent'
  return 'human'
}

const inferredLifecycle = (path: string): string => /(?:^|\/)(?:archive|archived|historical)(?:\/|$)/i.test(path) ? 'archived' : 'active'

const inferredTier = (path: string): DocumentationTier => {
  const lower = path.toLocaleLowerCase()
  if (lower === 'agents.md' || lower.endsWith('/agents.md') || lower.includes('/agent-corpus/') || lower.includes('/for-agents/') || lower.includes('security') || lower.includes('contribut') || lower.includes('runbook') || lower.includes('/operations/')) return 'tier-0'
  if (lower.includes('/adr/') || lower.includes('architecture') || lower.includes('/api/') || lower.includes('/integration') || lower.includes('/packages/') || lower.includes('/apps/') || lower.includes('/spec/')) return 'tier-1'
  return 'tier-2'
}

const tierFor = (path: string, content: string, config: DocumentationAuditConfig): { readonly tier: DocumentationTier; readonly critical: boolean } => {
  const data = parseFrontmatter(content).data
  const rule = config.tierRules?.find((candidate) => matches(path, [candidate.pattern]))
  const explicit = frontmatterString(data, 'tier')
  const tier = (explicit === 'tier-0' || explicit === 'tier-1' || explicit === 'tier-2')
    ? explicit
    : rule?.tier ?? config.defaultTier ?? inferredTier(path)
  const explicitCritical = data.critical === true ? true : data.critical === false ? false : undefined
  return { tier, critical: explicitCritical ?? rule?.critical ?? tier === 'tier-0' }
}

const dimension = (status: DocumentationDimensionStatus, reason: string): { readonly status: DocumentationDimensionStatus; readonly reason: string } => ({ status, reason })

const isCritical = (finding: Pick<DocumentationAuditFinding, 'evidence'>, paths: readonly string[]): boolean =>
  paths.length > 0 && finding.evidence.some((item) => matches(item.path, paths))

const auditId = (code: string, value: unknown): string => sha256NormalizedV1({ code, value })

const createFinding = (
  code: string,
  category: DocumentationAuditFinding['category'],
  status: FindingStatus,
  severity: DocumentationAuditFinding['severity'],
  confidence: DocumentationAuditFinding['confidence'],
  message: string,
  evidence: readonly Evidence[],
  value: unknown,
  criticalPaths: readonly string[],
  remediation?: string,
): DocumentationAuditFinding => {
  const normalizedEvidence = [...evidence].sort((a, b) => `${a.path}:${a.lineStart ?? 0}`.localeCompare(`${b.path}:${b.lineStart ?? 0}`))
  const blocking = confidence === 'high' && isCritical({ evidence: normalizedEvidence }, criticalPaths)
  return {
    id: auditId(code, value),
    code,
    category,
    status,
    severity: blocking ? 'error' : severity,
    confidence,
    blocking,
    message,
    evidence: normalizedEvidence,
    ...(remediation ? { remediation } : {}),
  }
}

const diagnosticMapping = (diagnostic: ReconciliationReportV1['diagnostics'][number]): {
  category: DocumentationAuditFinding['category']; status: FindingStatus; confidence: DocumentationAuditFinding['confidence']; severity: DocumentationAuditFinding['severity']
} | undefined => {
  if (diagnostic.code === 'RELATION_CONFIRMED') return undefined
  if (diagnostic.code === 'DOCUMENTATION_ORPHANED') return undefined
  if (diagnostic.code === 'RELATION_UNDOCUMENTED') return { category: 'structure-gap', status: 'undocumented', confidence: 'high', severity: diagnostic.severity }
  if (diagnostic.code === 'CONFLICTING_DECLARATIONS') return { category: 'contradiction', status: 'conflict', confidence: 'high', severity: diagnostic.severity }
  if (diagnostic.code === 'DECLARED_RELATION_STALE') return { category: 'stale', status: 'stale-or-unverified', confidence: 'high', severity: diagnostic.severity }
  if (diagnostic.code === 'RELATION_NOT_ANALYZED') return { category: 'limitation', status: 'not-analyzed', confidence: 'low', severity: diagnostic.severity }
  if (diagnostic.code === 'UNRESOLVED_ENTITY_REFERENCE') return { category: 'contradiction', status: 'unresolved', confidence: 'high', severity: diagnostic.severity }
  return { category: 'quality', status: 'unresolved', confidence: 'high', severity: diagnostic.severity }
}

export type DocumentationAuditOptions = {
  readonly root: string
  readonly snapshot: DiscoverySnapshotV1
  readonly declared: DiscoverySnapshotV1
  readonly reconciliation: ReconciliationReportV1
  readonly declarationDiagnostics?: readonly DocumentationDiagnostic[]
  readonly config?: DocumentationAuditConfig
}

export const auditDocumentation = (options: DocumentationAuditOptions): DocumentationAuditReportV1 => {
  const config = options.config ?? {}
  const excluded = config.exclude ?? []
  const generatedPaths = config.generatedPaths ?? []
  const criticalPaths = config.criticalPaths ?? []
  const requiredSections = config.requiredSections ?? []
  const documents: DocumentInput[] = options.snapshot.entities
    .filter((entity) => entity.kind === 'document' && entity.path)
    .map((entity) => ({ path: normalizedPath(entity.path as string), content: readFileSync(resolve(options.root, entity.path as string), 'utf8') }))
    .filter((document) => !matches(document.path, excluded))
    .sort((a, b) => a.path.localeCompare(b.path))
  const findings: DocumentationAuditFinding[] = []
  const generated = documents.filter((document) => matches(document.path, generatedPaths))
  const analyzed = documents.filter((document) => !matches(document.path, generatedPaths))
  const packageEntities = options.snapshot.entities
    .filter((entity) => entity.kind === 'package' && entity.path !== '.')
    .sort((a, b) => a.id.localeCompare(b.id))
  const coveredPackages = new Set(options.declared.relations.filter((relation) => relation.kind === 'covers' && relation.from.startsWith('document:')).map((relation) => relation.to))
  const requiredCriticalMetadata = config.requiredCriticalMetadata ?? ['owner', 'lifecycle', 'sourceOfTruth', 'validationPath']
  const documentAssessments: DocumentationAuditDocument[] = documents.map((document) => {
    const data = parseFrontmatter(document.content).data
    const tiering = tierFor(document.path, document.content, config)
    const metadata = {
      owner: metadataPresent(document.content, 'owner'),
      lifecycle: metadataPresent(document.content, 'lifecycle'),
      sourceOfTruth: metadataPresent(document.content, 'sourceOfTruth'),
      validationPath: metadataPresent(document.content, 'validationPath'),
    }
    const missing = requiredCriticalMetadata.filter((key) => !metadata[key])
    const metadataState = { ...metadata, complete: missing.length === 0, missing }
    const title = hasTitle(document.content)
    const examples = hasExample(document.content)
    const sections = requiredSections.every((section) => hasHeading(document.content, section))
    const qualityAnalyzed = !matches(document.path, generatedPaths)
    const assessment: DocumentationAuditDocument = {
      path: document.path,
      classification: {
        type: frontmatterString(data, 'type') ?? inferredDocumentType(document.path),
        audience: frontmatterString(data, 'audience') ?? inferredAudience(document.path),
        lifecycle: frontmatterString(data, 'lifecycle') ?? inferredLifecycle(document.path),
        tier: tiering.tier,
        critical: tiering.critical,
      },
      metadata: {
        ...metadataState,
      },
      dimensions: {
        correctness: dimension('not-analyzed', qualityAnalyzed ? 'Semantic correctness requires code, configuration, and applicable runtime evidence review.' : 'Generated-document correctness is outside this deterministic audit.'),
        completeness: dimension(!qualityAnalyzed ? 'not-analyzed' : title && sections ? 'partial' : 'not-analyzed', title && sections ? 'Required structural signals are present; semantic completeness remains unverified.' : 'Required structural signals are incomplete or not configured.'),
        clarity: dimension(!qualityAnalyzed ? 'not-analyzed' : title ? 'partial' : 'not-analyzed', title ? 'Title and basic structure are present; human clarity review remains unverified.' : 'A title is required before clarity can be assessed.'),
        agentEfficiency: dimension(!qualityAnalyzed ? 'not-analyzed' : title && examples ? 'partial' : 'not-analyzed', title && examples ? 'Title and an example are present; task usefulness and retrieval efficiency remain unverified.' : 'Agent efficiency requires a clear title and example before semantic review.'),
        maintainability: dimension(metadataState.complete ? 'validated' : 'partial', metadataState.complete ? 'Required maintainability metadata is present.' : 'Ownership, lifecycle, source-of-truth, or validation metadata is incomplete.'),
      },
      example: { present: examples, validation: 'not-analyzed' },
    }
    if (tiering.critical && missing.length > 0) findings.push(createFinding(
      'DOCUMENTATION_CRITICAL_METADATA_MISSING', 'quality', 'undocumented', 'warn', 'high',
      `Critical ${document.path} is missing maintainability metadata: ${missing.join(', ')}.`,
      [evidenceFor(document.path)], [document.path, missing], criticalPaths,
      'Add the missing owner, lifecycle, source-of-truth, or validation-path metadata, or declare a tracked exception.',
    ))
    return assessment
  })

  for (const document of generated) {
    findings.push(createFinding(
      'GENERATED_DOCUMENT_FRESHNESS_UNVERIFIED', 'generated-freshness', 'not-analyzed', 'info', 'low',
      'Generated documentation is included in the corpus, but this audit only verifies that it is present; freshness must be proven by its generating check.',
      [evidenceFor(document.path)], document.path, criticalPaths,
      'Configure the generator command as a freshness check and keep generated content out of direct manual edits.',
    ))
  }

  for (const document of analyzed) {
    const evidence = evidenceFor(document.path)
    if (!hasTitle(document.content)) findings.push(createFinding('DOCUMENTATION_TITLE_MISSING', 'quality', 'undocumented', 'warn', 'high', 'Documentation file has no level-one title.', [evidence], document.path, criticalPaths, 'Add one concise level-one title that identifies the documented subject.'))
    if (config.minWords !== undefined && words(document.content) < config.minWords) findings.push(createFinding('DOCUMENTATION_TOO_SHORT', 'quality', 'undocumented', 'warn', 'high', `Documentation file has fewer than ${config.minWords} words.`, [evidence], [document.path, config.minWords], criticalPaths, 'Add the missing context or lower the threshold when this file is intentionally a short index.'))
    if (config.requireExamples && !hasExample(document.content)) findings.push(createFinding('DOCUMENTATION_EXAMPLE_MISSING', 'quality', 'undocumented', 'warn', 'high', 'Documentation file has no usage heading or fenced example.', [evidence], document.path, criticalPaths, 'Add a minimal, runnable example or explicitly exempt this document from example requirements.'))
    const missingSections = requiredSections.filter((section) => !hasHeading(document.content, section))
    if (missingSections.length) findings.push(createFinding('DOCUMENTATION_SECTIONS_MISSING', 'quality', 'undocumented', 'warn', 'high', `Documentation file is missing required section(s): ${missingSections.join(', ')}.`, [evidence], [document.path, missingSections], criticalPaths, 'Add the required sections or document a tracked exception.'))
  }

  if (config.exactDuplicates !== false) {
    const duplicateGroups = new Map<string, DocumentInput[]>()
    for (const document of analyzed) {
      const body = bodyForDuplicate(document.content)
      if (!body) continue
      const group = duplicateGroups.get(body) ?? []
      group.push(document)
      duplicateGroups.set(body, group)
    }
    for (const group of [...duplicateGroups.values()].filter((items) => items.length > 1)) {
      findings.push(createFinding('DOCUMENTATION_EXACT_DUPLICATE', 'redundancy', 'unresolved', 'warn', 'high', `Documentation files contain identical normalized content: ${group.map((item) => item.path).join(', ')}.`, group.map((item) => evidenceFor(item.path)), group.map((item) => item.path), criticalPaths, 'Keep one canonical document and replace the others with links or clearly differentiated scope.'))
    }
  }

  for (const packageEntity of packageEntities) {
    if (coveredPackages.has(packageEntity.id)) continue
    const evidence = packageEntity.evidence.length ? packageEntity.evidence : [derivedEvidence]
    findings.push(createFinding('PACKAGE_DOCUMENTATION_MISSING', 'coverage', 'undocumented', 'warn', 'high', `Package ${packageEntity.name} has no documentation coverage declaration.`, evidence, packageEntity.id, criticalPaths, 'Add a docbridge covers declaration to the package documentation or explicitly exclude the package.'))
  }

  for (const diagnostic of options.reconciliation.diagnostics) {
    const mapping = diagnosticMapping(diagnostic)
    if (!mapping) continue
    findings.push(createFinding(diagnostic.code, mapping.category, mapping.status, mapping.severity, mapping.confidence, diagnostic.message, diagnostic.evidence, diagnostic.id, criticalPaths, diagnostic.remediation))
  }
  for (const diagnostic of options.declarationDiagnostics ?? []) {
    findings.push(createFinding(diagnostic.code, 'quality', 'unresolved', 'error', 'high', diagnostic.message, [diagnostic.evidence], diagnostic.code + diagnostic.evidence.path + diagnostic.evidence.lineStart, criticalPaths, 'Fix the declaration syntax or reference before relying on the documentation graph.'))
  }

  findings.push(createFinding('DOCUMENTATION_SEMANTICS_NOT_ANALYZED', 'limitation', 'not-analyzed', 'info', 'low', 'Natural-language redundancy, unnecessary prose, and contradictions not expressed as structured Doc Bridge claims require agent or human review.', [derivedEvidence], options.snapshot.contentHash, criticalPaths, 'Run a configured Registry agent review and require human approval before applying any proposed documentation change.'))
  const sortedFindings = [...new Map(findings.map((finding) => [finding.id, finding])).values()].sort((a, b) => a.id.localeCompare(b.id))
  const qualityDocs = analyzed.length
  const requiredSectionDocs = analyzed.filter((document) => requiredSections.every((section) => hasHeading(document.content, section))).length
  const statusCounts = (dimensionName: keyof DocumentationAuditDocument['dimensions']) => ({
    validated: documentAssessments.filter((assessment) => assessment.dimensions[dimensionName].status === 'validated').length,
    partial: documentAssessments.filter((assessment) => assessment.dimensions[dimensionName].status === 'partial').length,
    'not-analyzed': documentAssessments.filter((assessment) => assessment.dimensions[dimensionName].status === 'not-analyzed').length,
  })
  const criticalAssessments = documentAssessments.filter((assessment) => assessment.classification.critical)
  const base = {
    type: 'documentation-audit-report' as const,
    schemaVersion: DOCUMENTATION_AUDIT_SCHEMA_VERSION,
    contentHash: '0'.repeat(64),
    contentHashAlgo: 'sha256-normalized-v1' as const,
    project: options.snapshot.project,
    sourceRevision: options.snapshot.sourceRevision,
    sourceRevisionKind: options.snapshot.sourceRevisionKind,
    configurationHash: options.snapshot.configurationHash,
    pipelineVersion: options.snapshot.pipelineVersion,
    analyzerVersions: options.snapshot.analyzerVersions,
    snapshotHash: options.snapshot.contentHash,
    reconciliationHash: options.reconciliation.contentHash,
    status: sortedFindings.some((finding) => finding.blocking) ? 'blocked' as const : sortedFindings.some((finding) => finding.severity === 'warn' || finding.status !== 'confirmed') ? 'needs-review' as const : 'pass' as const,
    findings: sortedFindings,
    metrics: {
      documentCount: documents.length,
      generatedDocumentCount: generated.length,
      packageCount: packageEntities.length,
      coveredPackageCount: packageEntities.filter((entity) => coveredPackages.has(entity.id)).length,
      coverageRate: rate(packageEntities.filter((entity) => coveredPackages.has(entity.id)).length, packageEntities.length),
      documentsWithTitle: analyzed.filter((document) => hasTitle(document.content)).length,
      titleRate: rate(analyzed.filter((document) => hasTitle(document.content)).length, qualityDocs),
      documentsWithExamples: analyzed.filter((document) => hasExample(document.content)).length,
      examplesRate: rate(analyzed.filter((document) => hasExample(document.content)).length, qualityDocs),
      documentsMeetingRequiredSections: requiredSectionDocs,
      requiredSectionsRate: rate(requiredSectionDocs, qualityDocs),
      exactDuplicateGroups: sortedFindings.filter((finding) => finding.code === 'DOCUMENTATION_EXACT_DUPLICATE').length,
      structureGapCount: sortedFindings.filter((finding) => finding.category === 'structure-gap' || finding.code === 'PACKAGE_DOCUMENTATION_MISSING').length,
      contradictionCount: sortedFindings.filter((finding) => finding.category === 'contradiction').length,
      staleCount: sortedFindings.filter((finding) => finding.category === 'stale').length,
      notAnalyzedCount: sortedFindings.filter((finding) => finding.status === 'not-analyzed').length,
      blockingCount: sortedFindings.filter((finding) => finding.blocking).length,
      tierCounts: {
        'tier-0': documentAssessments.filter((assessment) => assessment.classification.tier === 'tier-0').length,
        'tier-1': documentAssessments.filter((assessment) => assessment.classification.tier === 'tier-1').length,
        'tier-2': documentAssessments.filter((assessment) => assessment.classification.tier === 'tier-2').length,
      },
      criticalDocumentCount: criticalAssessments.length,
      criticalDocumentsWithOwner: criticalAssessments.filter((assessment) => assessment.metadata.owner).length,
      criticalDocumentsWithLifecycle: criticalAssessments.filter((assessment) => assessment.metadata.lifecycle).length,
      criticalDocumentsWithSourceOfTruth: criticalAssessments.filter((assessment) => assessment.metadata.sourceOfTruth).length,
      criticalDocumentsWithValidationPath: criticalAssessments.filter((assessment) => assessment.metadata.validationPath).length,
      dimensionStatus: {
        correctness: statusCounts('correctness'),
        completeness: statusCounts('completeness'),
        clarity: statusCounts('clarity'),
        agentEfficiency: statusCounts('agentEfficiency'),
        maintainability: statusCounts('maintainability'),
      },
    },
    documentAssessments,
    generatedDocuments: generated.map((document) => ({ path: document.path, freshness: 'not-analyzed' as const })),
    limitations: [
      'Generated documentation receives presence and freshness-boundary reporting only; generator checks must prove freshness.',
      'Natural-language semantic contradiction and unnecessary-content detection are not deterministic and remain not-analyzed.',
      'Agent proposals are advisory and require human approval before any edit.',
    ],
  }
  return DocumentationAuditReportV1Schema.parse({ ...base, contentHash: contentHashForArtifactV1(base) })
}

export const formatDocumentationAuditText = (report: DocumentationAuditReportV1): readonly string[] => [
  `Documentation audit: ${report.status}`,
  `Documents: ${report.metrics.documentCount} | Packages covered: ${report.metrics.coveredPackageCount}/${report.metrics.packageCount}`,
  `Title: ${report.metrics.titleRate === null ? 'n/a' : `${Math.round(report.metrics.titleRate * 100)}%`} | Examples: ${report.metrics.examplesRate === null ? 'n/a' : `${Math.round(report.metrics.examplesRate * 100)}%`}`,
  `Gaps: ${report.metrics.structureGapCount} | Contradictions: ${report.metrics.contradictionCount} | Stale: ${report.metrics.staleCount} | Not analyzed: ${report.metrics.notAnalyzedCount}`,
  `Blocking findings: ${report.metrics.blockingCount}`,
]
