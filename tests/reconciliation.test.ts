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
  detection?: 'static' | 'dynamic' | 'external',
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
})
