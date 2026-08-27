import { contentHashForArtifactV1, sha256NormalizedV1 } from '../index-builder/content-hash.js'
import {
  ReconciliationReportV1Schema,
  type DiscoverySnapshotV1,
  type Evidence,
  type KnowledgeEntity,
  type KnowledgeRelation,
  type ReconciliationReportV1,
} from '../schemas/knowledge.js'

type EntityResolver = (reference: string) => string

const ignoredDocumentationRelations = new Set(['covers'])

const metadataDetection = (relation: KnowledgeRelation): string | undefined => {
  const detection = relation.metadata?.detection
  return typeof detection === 'string' ? detection : undefined
}

const relationDetection = (relation: KnowledgeRelation): string =>
  relation.discriminator ?? metadataDetection(relation) ?? 'static'

const entityResolver = (snapshots: readonly DiscoverySnapshotV1[]): EntityResolver => {
  const references = new Map<string, string>()
  const entities = snapshots.flatMap((snapshot) => snapshot.entities).sort((a, b) => a.id.localeCompare(b.id))
  for (const entity of entities) {
    references.set(entity.id, entity.id)
    for (const alias of entity.aliases ?? []) {
      if (!references.has(alias)) references.set(alias, entity.id)
    }
  }
  return (reference) => references.get(reference) ?? reference
}

const relationBase = (relation: KnowledgeRelation, resolveEntity: EntityResolver): string =>
  `${resolveEntity(relation.from)}\u0000${resolveEntity(relation.to)}\u0000${relation.kind}`

const evidenceKey = (item: Evidence): string =>
  `${item.source}:${item.path}:${item.lineStart ?? ''}:${item.lineEnd ?? ''}:${item.context ?? ''}`

const mergeEvidence = (...relations: readonly KnowledgeRelation[]): Evidence[] => {
  const merged = new Map<string, Evidence>()
  for (const relation of relations) {
    for (const item of relation.evidence) merged.set(evidenceKey(item), item)
  }
  return [...merged.values()].sort((a, b) => evidenceKey(a).localeCompare(evidenceKey(b)))
}

const diagnosticId = (code: string, value: unknown): string =>
  `reconciliation:${code}:${sha256NormalizedV1(value).slice(0, 32)}`

const coverageAvailable = (snapshot: DiscoverySnapshotV1, relation: KnowledgeRelation): boolean => {
  const status = snapshot.coverage.find((entry) =>
    entry.scope === 'static-imports-and-exports' && (relation.kind === 'imports' || relation.kind === 're-exports'),
  )?.status
  return status === undefined || status === 'complete'
}

const entityById = (snapshots: readonly DiscoverySnapshotV1[]): ReadonlyMap<string, KnowledgeEntity> => {
  const entities = new Map<string, KnowledgeEntity>()
  for (const snapshot of snapshots) {
    for (const entity of snapshot.entities) if (!entities.has(entity.id)) entities.set(entity.id, entity)
  }
  return entities
}

const isUnresolved = (id: string, entities: ReadonlyMap<string, KnowledgeEntity>): boolean =>
  id.startsWith('unresolved:') || entities.get(id)?.kind === 'unresolved-reference'

const relationMatches = (observed: KnowledgeRelation, declared: KnowledgeRelation, resolveEntity: EntityResolver): boolean => {
  if (relationBase(observed, resolveEntity) !== relationBase(declared, resolveEntity)) return false
  return relationDetection(declared) === relationDetection(observed)
}

const reportDiagnostic = (
  code: string,
  status: ReconciliationReportV1['diagnostics'][number]['status'],
  severity: ReconciliationReportV1['diagnostics'][number]['severity'],
  message: string,
  evidence: readonly Evidence[],
  value: unknown,
  entityIds?: readonly string[],
  relationIds?: readonly string[],
  remediation?: string,
): ReconciliationReportV1['diagnostics'][number] => ({
  id: diagnosticId(code, value),
  code,
  status,
  severity,
  message,
  evidence: [...evidence],
  ...(entityIds?.length ? { entityIds: [...entityIds] } : {}),
  ...(relationIds?.length ? { relationIds: [...relationIds] } : {}),
  ...(remediation ? { remediation } : {}),
})

export const reconcileKnowledge = (
  observed: DiscoverySnapshotV1,
  declared: DiscoverySnapshotV1,
): ReconciliationReportV1 => {
  const resolveEntity = entityResolver([observed, declared])
  const entities = entityById([observed, declared])
  const observedRelations = observed.relations.filter((relation) => relation.provenance === 'observed' && !ignoredDocumentationRelations.has(relation.kind))
  const declaredRelations = declared.relations.filter((relation) => relation.provenance === 'declared' && !ignoredDocumentationRelations.has(relation.kind))
  const diagnostics: ReconciliationReportV1['diagnostics'][number][] = []

  for (const entity of declared.entities.filter((item) => isUnresolved(item.id, entities)).sort((a, b) => a.id.localeCompare(b.id))) {
    diagnostics.push(reportDiagnostic(
      'UNRESOLVED_ENTITY_REFERENCE',
      'unresolved',
      'error',
      `Declared reference could not be resolved: ${entity.name}.`,
      entity.evidence,
      entity.id,
      [entity.id],
      undefined,
      'Resolve the reference to an observed entity ID or configured alias.',
    ))
  }

  const declaredByBase = new Map<string, KnowledgeRelation[]>()
  for (const relation of declaredRelations) {
    const base = relationBase(relation, resolveEntity)
    const group = declaredByBase.get(base) ?? []
    group.push(relation)
    declaredByBase.set(base, group)
  }

  for (const group of declaredByBase.values()) {
    const detections = new Set(group.map(relationDetection))
    if (detections.size < 2) continue
    diagnostics.push(reportDiagnostic(
      'CONFLICTING_DECLARATIONS',
      'conflict',
      'error',
      'Declarations for the same semantic relation disagree on detection.',
      mergeEvidence(...group),
      [relationBase(group[0] as KnowledgeRelation, resolveEntity), [...detections].sort()],
      undefined,
      group.map((relation) => relation.id),
      'Keep one detection value for this relation or document the intended distinction with a different relation kind.',
    ))
  }

  for (const relation of observedRelations) {
    const candidates = declaredByBase.get(relationBase(relation, resolveEntity)) ?? []
    const match = candidates.find((candidate) => relationMatches(relation, candidate, resolveEntity))
    if (match) {
      diagnostics.push(reportDiagnostic(
        'RELATION_CONFIRMED',
        'confirmed',
        'info',
        'Observed relation is covered by a matching declaration.',
        mergeEvidence(relation, match),
        relation.id,
        undefined,
        [relation.id, match.id],
      ))
    } else if (coverageAvailable(observed, relation)) {
      diagnostics.push(reportDiagnostic(
        'RELATION_UNDOCUMENTED',
        'undocumented',
        'warn',
        'Observed relation has no matching documentation declaration.',
        relation.evidence,
        relation.id,
        undefined,
        [relation.id],
        'Add a matching relation declaration or configure this relation kind as intentionally undocumented.',
      ))
    }
  }

  for (const relation of declaredRelations) {
    const candidates = observedRelations.filter((candidate) => relationBase(candidate, resolveEntity) === relationBase(relation, resolveEntity))
    const detection = relationDetection(relation)
    if (candidates.some((candidate) => relationMatches(candidate, relation, resolveEntity))) continue
    if (isUnresolved(resolveEntity(relation.from), entities) || isUnresolved(resolveEntity(relation.to), entities)) continue
    if (detection === 'dynamic' || detection === 'external') {
      diagnostics.push(reportDiagnostic(
        'RELATION_NOT_ANALYZED',
        'not-analyzed',
        'info',
        `Declared ${detection} relation cannot be verified by the current static analyzer.`,
        relation.evidence,
        relation.id,
        undefined,
        [relation.id],
        'Enable a compatible analyzer or provide explicit observed evidence before treating this relation as confirmed.',
      ))
    } else if (coverageAvailable(observed, relation)) {
      diagnostics.push(reportDiagnostic(
        'DECLARED_RELATION_STALE',
        'stale-or-unverified',
        'warn',
        candidates.length ? 'Declared relation has incompatible observed evidence.' : 'Declared static relation was not observed.',
        candidates.length ? mergeEvidence(relation, ...candidates) : relation.evidence,
        relation.id,
        undefined,
        [relation.id, ...candidates.map((candidate) => candidate.id)],
        'Update the declaration or the implementation so both graphs describe the same relation.',
      ))
    }
  }

  const sortedDiagnostics = [...diagnostics].sort((a, b) => a.id.localeCompare(b.id))
  const base = {
    type: 'reconciliation-report' as const,
    schemaVersion: 1 as const,
    contentHash: '0'.repeat(64),
    contentHashAlgo: observed.contentHashAlgo,
    project: observed.project,
    sourceRevision: observed.sourceRevision,
    sourceRevisionKind: observed.sourceRevisionKind,
    configurationHash: observed.configurationHash,
    pipelineVersion: observed.pipelineVersion,
    analyzerVersions: observed.analyzerVersions,
    snapshotHash: observed.contentHash,
    diagnostics: sortedDiagnostics,
    summary: {
      entityCount: observed.entities.length,
      relationCount: observedRelations.length,
      diagnosticCount: sortedDiagnostics.length,
    },
  }
  return ReconciliationReportV1Schema.parse({ ...base, contentHash: contentHashForArtifactV1(base) })
}
