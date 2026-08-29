import { describe, expect, it } from 'vitest'

import { measureBenchmark } from '../src/metrics/benchmark.js'
import { reconcileKnowledge } from '../src/reconciliation/reconcile.js'
import { DiscoverySnapshotV1Schema, type DiscoverySnapshotV1, type KnowledgeEntity, type KnowledgeRelation } from '../src/schemas/knowledge.js'

const hash = (character: string): string => character.repeat(64)

const entity = (id: string, provenance: 'observed' | 'declared', kind = 'module'): KnowledgeEntity => ({
  id,
  kind,
  name: id,
  provenance,
  evidence: [{ source: provenance === 'observed' ? 'code' : 'documentation', path: provenance === 'observed' ? 'src/index.ts' : 'docs/architecture.md', lineStart: 1 }],
})

const relation = (
  id: string,
  from: string,
  to: string,
  provenance: 'observed' | 'declared',
  detection: 'static' | 'dynamic' = 'static',
): KnowledgeRelation => ({
  id,
  kind: 'imports',
  from,
  to,
  ...(detection === 'static' ? {} : { discriminator: detection }),
  provenance,
  evidence: [{ source: provenance === 'observed' ? 'code' : 'documentation', path: provenance === 'observed' ? 'src/index.ts' : 'docs/architecture.md', lineStart: 2 }],
})

const snapshot = (
  caseId: string,
  relations: readonly KnowledgeRelation[],
  entities: readonly KnowledgeEntity[],
  contentHash: string,
): DiscoverySnapshotV1 => DiscoverySnapshotV1Schema.parse({
  type: 'discovery-snapshot',
  schemaVersion: 1,
  contentHash,
  contentHashAlgo: 'sha256-normalized-v1',
  project: { name: `semantic-${caseId}`, root: '.' },
  sourceRevision: `fixture-${caseId}`,
  sourceRevisionKind: 'content',
  configurationHash: hash('b'),
  pipelineVersion: '1.0.0',
  analyzerVersions: { 'js-ts': '1.0.0' },
  entities,
  relations,
  coverage: [{ analyzer: 'js-ts', scope: 'static-imports-and-exports', status: 'complete' }],
})

type SemanticCase = {
  readonly id: string
  readonly expectedCodes: readonly string[]
  readonly observedRelations: readonly KnowledgeRelation[]
  readonly declaredRelations: readonly KnowledgeRelation[]
  readonly observedEntities: readonly KnowledgeEntity[]
  readonly declaredEntities: readonly KnowledgeEntity[]
}

const cases: readonly SemanticCase[] = [
  {
    id: 'confirmed',
    expectedCodes: ['RELATION_CONFIRMED'],
    observedRelations: [relation('observed', 'module:a', 'module:b', 'observed')],
    declaredRelations: [relation('declared', 'module:a', 'module:b', 'declared')],
    observedEntities: [entity('module:a', 'observed'), entity('module:b', 'observed')],
    declaredEntities: [entity('module:a', 'declared'), entity('module:b', 'declared')],
  },
  {
    id: 'undocumented',
    expectedCodes: ['RELATION_UNDOCUMENTED'],
    observedRelations: [relation('observed', 'module:a', 'module:b', 'observed')],
    declaredRelations: [],
    observedEntities: [entity('module:a', 'observed'), entity('module:b', 'observed')],
    declaredEntities: [entity('module:a', 'declared'), entity('module:b', 'declared')],
  },
  {
    id: 'stale',
    expectedCodes: ['DECLARED_RELATION_STALE'],
    observedRelations: [],
    declaredRelations: [relation('declared', 'module:a', 'module:b', 'declared')],
    observedEntities: [entity('module:a', 'observed'), entity('module:b', 'observed')],
    declaredEntities: [entity('module:a', 'declared'), entity('module:b', 'declared')],
  },
  {
    id: 'not-analyzed',
    expectedCodes: ['RELATION_NOT_ANALYZED'],
    observedRelations: [],
    declaredRelations: [relation('declared', 'module:a', 'module:b', 'declared', 'dynamic')],
    observedEntities: [entity('module:a', 'observed'), entity('module:b', 'observed')],
    declaredEntities: [entity('module:a', 'declared'), entity('module:b', 'declared')],
  },
  {
    id: 'conflict',
    expectedCodes: ['CONFLICTING_DECLARATIONS', 'RELATION_CONFIRMED', 'RELATION_NOT_ANALYZED'],
    observedRelations: [relation('observed', 'module:a', 'module:b', 'observed')],
    declaredRelations: [
      relation('declared-static', 'module:a', 'module:b', 'declared'),
      relation('declared-dynamic', 'module:a', 'module:b', 'declared', 'dynamic'),
    ],
    observedEntities: [entity('module:a', 'observed'), entity('module:b', 'observed')],
    declaredEntities: [entity('module:a', 'declared'), entity('module:b', 'declared')],
  },
  {
    id: 'unresolved',
    expectedCodes: ['UNRESOLVED_ENTITY_REFERENCE'],
    observedRelations: [],
    declaredRelations: [],
    observedEntities: [entity('module:a', 'observed')],
    declaredEntities: [{ ...entity('unresolved:missing', 'declared'), kind: 'unresolved-reference' }],
  },
]

describe('semantic reconciliation benchmark', () => {
  it('measures exact classification, precision, recall, and evidence across known cases', () => {
    const expectedFindings: string[] = []
    const observedFindings: string[] = []
    const categories: Record<string, number> = {}

    for (const [index, testCase] of cases.entries()) {
      const observed = snapshot(testCase.id, testCase.observedRelations, testCase.observedEntities, hash(String.fromCharCode(97 + (index % 6))))
      const declared = snapshot(testCase.id, testCase.declaredRelations, testCase.declaredEntities, hash(String.fromCharCode(102 - (index % 6))))
      const report = reconcileKnowledge(observed, declared, { requiredRelationKinds: ['imports'], requiredRelationTargets: 'internal' })
      const actualCodes = [...new Set(report.diagnostics.map((diagnostic) => diagnostic.code))].sort()
      const expectedCodes = [...testCase.expectedCodes].sort()

      expect(actualCodes, testCase.id).toEqual(expectedCodes)
      expect(report.diagnostics.every((diagnostic) => diagnostic.evidence.length > 0), testCase.id).toBe(true)
      for (const code of expectedCodes) {
        const findingId = `${testCase.id}:${code}`
        expectedFindings.push(findingId)
        observedFindings.push(findingId)
        categories[code] = (categories[code] ?? 0) + 1
      }
    }

    const result = measureBenchmark({
      entities: cases.map(({ id }) => id),
      relations: [],
      findings: observedFindings,
      evidenced: cases.map(({ id }) => id),
      findingCategories: categories,
    }, {
      schemaVersion: 1,
      supported: { entities: cases.map(({ id }) => id), relations: [], findings: expectedFindings },
    }, { precision: 1, recall: 1 })

    expect(result.quality.findings).toMatchObject({ truePositives: expectedFindings.length, falsePositives: 0, falseNegatives: 0, precision: 1, recall: 1 })
    expect(result.evidenceRatio).toBe(1)
    expect(result.regressions).toEqual([])
    console.error(JSON.stringify({ benchmark: 'semantic-reconciliation-v1', cases: cases.length, findings: expectedFindings.length, precision: result.quality.findings.precision, recall: result.quality.findings.recall, evidenceRatio: result.evidenceRatio }))
  })
})
