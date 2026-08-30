import { describe, expect, it } from 'vitest'

import { reconcileKnowledge } from '../src/reconciliation/reconcile.js'
import { parseReconciliationReport } from '../src/validate.js'
import { DiscoverySnapshotV1Schema, type DiscoverySnapshotV1, type KnowledgeEntity, type KnowledgeRelation } from '../src/schemas/knowledge.js'

const hash = (character: string): string => character.repeat(64)

const entity = (id: string, kind = 'module', aliases?: readonly string[]): KnowledgeEntity => ({
  id,
  kind,
  name: id,
  provenance: 'observed',
  evidence: [{ source: kind === 'document' ? 'documentation' : 'code', path: id.replace(/^[^:]+:/, ''), lineStart: 1 }],
  ...(aliases ? { aliases } : {}),
})

const relation = (
  id: string,
  from: string,
  to: string,
  provenance: 'observed' | 'declared',
  detection?: 'static' | 'dynamic' | 'external' | 'dynamic-literal',
): KnowledgeRelation => ({
  id,
  kind: 'imports',
  from,
  to,
  ...(detection ? { discriminator: detection, metadata: { detection } } : {}),
  provenance,
  evidence: [{ source: provenance === 'observed' ? 'code' : 'documentation', path: provenance === 'observed' ? 'src/index.ts' : 'docs/guide.md', lineStart: 2 }],
})

const snapshot = (
  relations: readonly KnowledgeRelation[],
  entities: readonly KnowledgeEntity[],
  contentHash = hash('a'),
  coverage: DiscoverySnapshotV1['coverage'] = [{ analyzer: 'js-ts', scope: 'static-imports-and-exports', status: 'complete' }],
): DiscoverySnapshotV1 => DiscoverySnapshotV1Schema.parse({
  type: 'discovery-snapshot',
  schemaVersion: 1,
  contentHash,
  contentHashAlgo: 'sha256-normalized-v1',
  project: { name: 'fixture', root: '.' },
  sourceRevision: 'revision-1',
  sourceRevisionKind: 'content',
  configurationHash: hash('b'),
  pipelineVersion: '1.0.0',
  analyzerVersions: { 'js-ts': '1.0.0' },
  entities,
  relations,
  coverage,
})

describe('knowledge reconciliation', () => {
  it('produces confirmed, undocumented, stale, not-analyzed, conflict and unresolved findings', () => {
    const observedEntities = [entity('module:a', 'module', ['legacy-a']), entity('module:b'), entity('module:c'), entity('module:d'), entity('module:e')]
    const observed = snapshot([
      relation('observed-confirmed', 'module:a', 'module:b', 'observed'),
      relation('observed-undocumented', 'module:a', 'module:c', 'observed'),
      relation('observed-undocumented-only', 'module:a', 'module:e', 'observed'),
    ], observedEntities)
    const declaredEntities = [
      entity('document:guide', 'document'),
      { ...entity('unresolved:missing'), kind: 'unresolved-reference', provenance: 'declared' as const, evidence: [{ source: 'documentation' as const, path: 'docs/guide.md', lineStart: 20 }] },
    ]
    const declared = snapshot([
      { id: 'declared-cover', kind: 'covers', from: 'document:guide', to: 'module:a', provenance: 'declared', evidence: [{ source: 'documentation', path: 'docs/guide.md', lineStart: 3 }] },
      relation('declared-confirmed', 'legacy-a', 'module:b', 'declared', 'static'),
      relation('declared-stale', 'module:a', 'module:b', 'declared', 'dynamic'),
      relation('declared-stale-static', 'module:a', 'module:c', 'declared', 'static'),
      relation('declared-stale-unobserved', 'module:a', 'module:d', 'declared', 'static'),
      relation('declared-unresolved', 'module:a', 'unresolved:missing', 'declared', 'static'),
      relation('declared-conflict-static', 'module:a', 'module:c', 'declared', 'static'),
      relation('declared-conflict-dynamic', 'module:a', 'module:c', 'declared', 'dynamic'),
    ], declaredEntities, hash('c'))

    const report = reconcileKnowledge(observed, declared)
    const statuses = new Set(report.diagnostics.map((diagnostic) => diagnostic.status))
    const codes = new Set(report.diagnostics.map((diagnostic) => diagnostic.code))

    expect(statuses).toEqual(new Set(['confirmed', 'undocumented', 'stale-or-unverified', 'not-analyzed', 'conflict', 'unresolved']))
    expect(codes).toEqual(new Set(['RELATION_CONFIRMED', 'RELATION_UNDOCUMENTED', 'DECLARED_RELATION_STALE', 'RELATION_NOT_ANALYZED', 'CONFLICTING_DECLARATIONS', 'UNRESOLVED_ENTITY_REFERENCE']))
    expect(report.diagnostics.find((diagnostic) => diagnostic.code === 'RELATION_CONFIRMED')?.evidence).toHaveLength(2)
    expect(report.snapshotHash).toBe(observed.contentHash)
    expect(report.summary.diagnosticCount).toBe(report.diagnostics.length)
    expect(report.summary.diagnosticsByCode).toEqual({
      CONFLICTING_DECLARATIONS: 2,
      DECLARED_RELATION_STALE: 1,
      RELATION_CONFIRMED: 2,
      RELATION_NOT_ANALYZED: 2,
      RELATION_UNDOCUMENTED: 1,
      UNRESOLVED_ENTITY_REFERENCE: 1,
    })
    expect(report.summary.diagnosticsByStatus).toEqual({
      confirmed: 2,
      conflict: 2,
      'not-analyzed': 2,
      'stale-or-unverified': 1,
      undocumented: 1,
      unresolved: 1,
    })
    expect(parseReconciliationReport(JSON.parse(JSON.stringify(report)))).toEqual(report)
  })

  it('is deterministic under relation ordering and respects unavailable coverage', () => {
    const entities = [entity('module:a'), entity('module:b')]
    const observedRelations = [relation('observed', 'module:a', 'module:b', 'observed')]
    const declaredRelations = [relation('declared', 'module:a', 'module:b', 'declared', 'static')]
    const observed = snapshot(observedRelations, entities, hash('a'), [{ analyzer: 'js-ts', scope: 'static-imports-and-exports', status: 'partial', reason: 'invalid tsconfig' }])
    const declared = snapshot(declaredRelations, entities, hash('c'))

    const first = reconcileKnowledge(observed, declared)
    const second = reconcileKnowledge(snapshot([...observedRelations].reverse(), [...entities].reverse(), hash('a'), observed.coverage), snapshot([...declaredRelations].reverse(), [...entities].reverse(), hash('c')))

    expect(first).toEqual(second)
    expect(first.diagnostics).toHaveLength(1)
    expect(first.diagnostics[0]?.status).toBe('confirmed')
  })

  it('can scope missing-declaration findings to configured relation kinds', () => {
    const entities = [entity('module:a'), entity('module:b')]
    const observed = snapshot([relation('observed', 'module:a', 'module:b', 'observed')], entities)
    const declared = snapshot([], entities, hash('c'))

    expect(reconcileKnowledge(observed, declared).diagnostics).toHaveLength(1)
    expect(reconcileKnowledge(observed, declared, { requiredRelationKinds: [] }).diagnostics).toHaveLength(0)
    expect(reconcileKnowledge(observed, declared, { requiredRelationKinds: ['depends-on'] }).diagnostics).toHaveLength(0)
  })

  it('can require declarations only for internal relation endpoints', () => {
    const entities = [
      { ...entity('package:a', 'package'), path: 'packages/a' },
      { ...entity('package:b', 'package'), path: 'packages/b' },
      entity('external:vendor'),
    ]
    const observed = snapshot([
      relation('internal', 'package:a', 'package:b', 'observed'),
      relation('external', 'package:a', 'external:vendor', 'observed'),
      relation('self', 'package:a', 'package:a', 'observed'),
    ], entities)
    const declared = snapshot([], entities, hash('c'))

    const report = reconcileKnowledge(observed, declared, {
      scope: 'package',
      requiredRelationKinds: ['imports'],
      requiredRelationTargets: 'internal',
    })

    expect(report.diagnostics).toHaveLength(1)
    expect(report.diagnostics[0]).toMatchObject({ code: 'RELATION_UNDOCUMENTED', relationIds: [expect.stringContaining('relation:aggregated:package:')] })
    expect(report.summary.requiredRelationTargets).toBe('internal')
  })

  it('retains candidate evidence when a static declaration disagrees with observed detection', () => {
    const entities = [entity('module:a'), entity('module:b')]
    const observed = snapshot([relation('observed-dynamic', 'module:a', 'module:b', 'observed', 'dynamic-literal')], entities)
    const declared = snapshot([relation('declared-static', 'module:a', 'module:b', 'declared', 'static')], entities, hash('c'))

    const report = reconcileKnowledge(observed, declared)
    expect(report.diagnostics).toContainEqual(expect.objectContaining({ code: 'DECLARED_RELATION_STALE', relationIds: ['declared-static', 'observed-dynamic'] }))
  })

  it('matches literal dynamic imports with the documented dynamic detection', () => {
    const entities = [
      { ...entity('package:a', 'package'), path: 'packages/a' },
      { ...entity('package:b', 'package'), path: 'packages/b' },
      { ...entity('module:packages/a/index.ts'), path: 'packages/a/index.ts' },
      { ...entity('module:packages/b/index.ts'), path: 'packages/b/index.ts' },
    ]
    const observed = snapshot([
      relation('observed', 'module:packages/a/index.ts', 'module:packages/b/index.ts', 'observed', 'dynamic-literal'),
    ], entities)
    const declared = snapshot([
      relation('declared', 'package:a', 'package:b', 'declared', 'dynamic'),
    ], entities, hash('c'))

    const report = reconcileKnowledge(observed, declared, { scope: 'package', requiredRelationKinds: ['imports'], requiredRelationTargets: 'internal' })
    expect(report.diagnostics.filter((item) => item.code === 'RELATION_UNDOCUMENTED')).toHaveLength(0)
    expect(report.diagnostics).toContainEqual(expect.objectContaining({ code: 'RELATION_CONFIRMED' }))
  })

  it('allows multiple documented detections when both are observed', () => {
    const entities = [
      { ...entity('package:a', 'package'), path: 'packages/a' },
      { ...entity('package:b', 'package'), path: 'packages/b' },
      { ...entity('module:packages/a/index.ts'), path: 'packages/a/index.ts' },
      { ...entity('module:packages/b/index.ts'), path: 'packages/b/index.ts' },
    ]
    const observed = snapshot([
      relation('observed-static', 'module:packages/a/index.ts', 'module:packages/b/index.ts', 'observed', 'static'),
      relation('observed-dynamic', 'module:packages/a/index.ts', 'module:packages/b/index.ts', 'observed', 'dynamic-literal'),
    ], entities)
    const declared = snapshot([
      relation('declared-static', 'package:a', 'package:b', 'declared', 'static'),
      relation('declared-dynamic', 'package:a', 'package:b', 'declared', 'dynamic'),
    ], entities, hash('c'))

    const report = reconcileKnowledge(observed, declared, { scope: 'package', requiredRelationKinds: ['imports'], requiredRelationTargets: 'internal' })
    expect(report.diagnostics.some((item) => item.code === 'CONFLICTING_DECLARATIONS')).toBe(false)
    expect(report.diagnostics.some((item) => item.code === 'RELATION_UNDOCUMENTED')).toBe(false)
  })

  it('aggregates file relations at package scope while preserving evidence count', () => {
    const entities = [
      { ...entity('package:a', 'package'), path: 'packages/a' },
      { ...entity('package:b', 'package'), path: 'packages/b' },
      { ...entity('module:packages/a/src/one.ts'), path: 'packages/a/src/one.ts' },
      { ...entity('module:packages/a/src/two.ts'), path: 'packages/a/src/two.ts' },
      { ...entity('module:packages/b/src/index.ts'), path: 'packages/b/src/index.ts' },
    ]
    const observed = snapshot([
      relation('observed-one', 'module:packages/a/src/one.ts', 'module:packages/b/src/index.ts', 'observed'),
      relation('observed-two', 'module:packages/a/src/two.ts', 'module:packages/b/src/index.ts', 'observed'),
    ], entities)
    const declared = snapshot([
      { ...relation('declared', 'package:a', 'package:b', 'declared', 'static'), kind: 'imports' },
    ], entities, hash('c'))

    const report = reconcileKnowledge(observed, declared, { scope: 'package', requiredRelationKinds: ['imports'] })
    expect(report.diagnostics).toHaveLength(1)
    expect(report.diagnostics[0]).toMatchObject({ code: 'RELATION_CONFIRMED' })
    expect(report.diagnostics[0]?.evidence).toHaveLength(2)
    expect(report.summary.scope).toBe('package')
  })

  it('summarizes package documentation health and optionally reports orphaned documents', () => {
    const entities = [
      { ...entity('package:a', 'package'), path: 'packages/a' },
      { ...entity('package:b', 'package'), path: 'packages/b' },
      entity('document:guide', 'document'),
      entity('document:orphan', 'document'),
    ]
    const observed = snapshot([], entities)
    const declared = snapshot([
      { id: 'cover-a', kind: 'covers', from: 'document:guide', to: 'package:a', provenance: 'declared', evidence: [{ source: 'documentation', path: 'docs/guide.md', lineStart: 1 }] },
      relation('stale-b', 'package:a', 'package:b', 'declared', 'static'),
    ], entities, hash('c'))

    const withoutOrphans = reconcileKnowledge(observed, declared)
    expect(withoutOrphans.summary.documentation).toEqual({
      documentCount: 2,
      documentedDocumentCount: 1,
      documentClassificationCounts: { unclassified: 2 },
      documentedDocumentClassificationCounts: { unclassified: 1 },
      packageCount: 2,
      packageStatus: { fresh: 0, stale: 1, missing: 1, unverified: 0 },
    })
    expect(reconcileKnowledge(observed, declared, { includeOrphanedDocuments: true }).diagnostics).toContainEqual(expect.objectContaining({ code: 'DOCUMENTATION_ORPHANED' }))
  })

  it('does not mark covered packages fresh when their package relations are undocumented', () => {
    const entities = [
      { ...entity('package:a', 'package'), path: 'packages/a' },
      { ...entity('package:b', 'package'), path: 'packages/b' },
      entity('document:a', 'document'),
      entity('document:b', 'document'),
      { ...entity('module:packages/a/src/index.ts'), path: 'packages/a/src/index.ts' },
      { ...entity('module:packages/b/src/index.ts'), path: 'packages/b/src/index.ts' },
    ]
    const observed = snapshot([
      { id: 'observed-a-b', kind: 'imports', from: 'module:packages/a/src/index.ts', to: 'module:packages/b/src/index.ts', provenance: 'observed', evidence: [{ source: 'code', path: 'packages/a/src/index.ts', lineStart: 1 }] },
    ], entities)
    const declared = snapshot([
      { id: 'cover-a', kind: 'covers', from: 'document:a', to: 'package:a', provenance: 'declared', evidence: [{ source: 'documentation', path: 'docs/a.md', lineStart: 1 }] },
      { id: 'cover-b', kind: 'covers', from: 'document:b', to: 'package:b', provenance: 'declared', evidence: [{ source: 'documentation', path: 'docs/b.md', lineStart: 1 }] },
    ], entities, hash('c'))

    const report = reconcileKnowledge(observed, declared, { scope: 'package', requiredRelationKinds: ['imports'] })
    expect(report.summary.documentation?.packageStatus).toEqual({ fresh: 0, stale: 0, missing: 0, unverified: 2 })
    expect(report.diagnostics).toContainEqual(expect.objectContaining({ code: 'RELATION_UNDOCUMENTED' }))
  })
})
