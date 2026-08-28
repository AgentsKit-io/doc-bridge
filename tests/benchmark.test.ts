import { describe, expect, it } from 'vitest'

import {
  benchmarkFixture,
  compareBenchmarkSnapshots,
  measureAgentEfficiency,
  measureBenchmark,
} from '../src/metrics/benchmark.js'

describe('benchmark metrics', () => {
  it('calculates quality, evidence, density, exclusions, and regressions', () => {
    const fixture = benchmarkFixture({
      schemaVersion: 1,
      supported: { entities: ['a', 'b'], relations: ['a->b'], findings: ['missing-doc'] },
      excluded: { entities: ['generated'], relations: [], findings: ['ambiguous'] },
    })
    const result = measureBenchmark({
      entities: ['a', 'a', 'generated', 'extra'],
      relations: ['a->b'],
      findings: ['missing-doc', 'extra-finding'],
      evidenced: ['a', 'extra'],
      findingCategories: { documentation: 1, architecture: 1 },
    }, fixture)

    expect(result.quality.entities).toMatchObject({ truePositives: 1, falsePositives: 1, falseNegatives: 1, duplicateCount: 1 })
    expect(result.quality.entities.precision).toBe(0.5)
    expect(result.quality.entities.recall).toBe(0.5)
    expect(result.quality.relations.recall).toBe(1)
    expect(result.evidenceRatio).toBe(2 / 3)
    expect(result.findingDensity).toBe(2 / 3)
    expect(result.excludedCaseCount).toBe(2)
    expect(result.regressions).toContain('entities.precision below 0.95')
  })

  it('treats empty expected and observed sets as perfect, while counting explicit exclusions', () => {
    const fixture = benchmarkFixture({ schemaVersion: 1, supported: {}, excluded: { entities: ['known-unsupported'], relations: [], findings: [] } })
    const result = measureBenchmark({ entities: ['known-unsupported'], relations: [], findings: [] }, fixture)
    expect(result.quality.entities.precision).toBe(1)
    expect(result.quality.entities.recall).toBe(1)
    expect(result.excludedCaseIds.entities).toBe(1)
  })

  it('compares snapshot additions, removals, and reclassification', () => {
    expect(compareBenchmarkSnapshots({ a: 'same', b: 'old', c: 'removed' }, { a: 'same', b: 'new', d: 'added' })).toEqual({
      added: 1,
      removed: 1,
      unchanged: 1,
      reclassified: 1,
      unchangedEvidence: 1,
    })
  })

  it('reports bounded agent efficiency metrics', () => {
    expect(measureAgentEfficiency({ hits: 9, queries: 10, latencyMs: [10, 20, 30], responseBytes: [100, 200, 300], estimatedTokens: [10, 20, 30], corpusBytes: 1_000 })).toEqual({
      hitRate: 0.9,
      latencyP95Ms: 30,
      responseBytesP95: 300,
      estimatedTokensP95: 30,
      corpusBytes: 1_000,
      contextReduction: 0.7,
    })
  })
})
