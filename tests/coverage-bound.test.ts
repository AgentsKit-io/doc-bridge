import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { boundCoverage } from '../src/discovery/coverage.js'
import { discoverRepository } from '../src/discovery/repository.js'
import { buildDocBridgeIndex } from '../src/index-builder/build-index.js'
import { CoverageSchema, type Coverage } from '../src/schemas/knowledge.js'

const entries = (count: number): Coverage[] => Array.from({ length: count }, (_, i) => ({
  analyzer: 'fixture', scope: `dynamic-imports:src/file-${String(i).padStart(4, '0')}.ts`, status: 'not-analyzed', reason: 'Dynamic import.',
  evidence: [{ source: 'code', path: `src/file-${String(i).padStart(4, '0')}.ts`, lineStart: 1 }],
}))

describe('bounded discovery coverage', () => {
  it('returns the original array and bytes at the inclusive bound', () => {
    for (const size of [0, 999, 1_000]) {
      const input = entries(size)
      expect(boundCoverage(input)).toBe(input)
      expect(JSON.stringify(boundCoverage(input))).toBe(JSON.stringify(input))
    }
  })

  it('groups by kind, reason, status, analyzer version and path prefix with a canonical sample', () => {
    const input = entries(1_001)
    input.push({ ...input[0]!, scope: 'dynamic-imports:docs/a.md', evidence: [{ source: 'documentation', path: 'docs/a.md' }] })
    input.push({ ...input[0]!, reason: 'Different limitation.' }, { ...input[0]!, status: 'complete' }, { ...input[0]!, analyzerVersion: '2' })
    const result = boundCoverage(input)
    expect(result).toEqual(boundCoverage([...input].reverse()))
    expect(result).toHaveLength(5)
    const group = result.find(entry => JSON.parse(entry.reason!).count === 1_001)!
    expect(group.scope).toBe('dynamic-imports:src')
    expect(JSON.parse(group.reason!)).toMatchObject({ count: 1_001, evidenceOmitted: 993, reason: 'Dynamic import.' })
    expect(group.evidence).toEqual(input.slice(0, 8).flatMap(entry => entry.evidence!))
    expect(result.every(entry => CoverageSchema.safeParse(entry).success)).toBe(true)
    const changed = input.map((entry, i) => i === 999 ? { ...entry, evidence: [{ ...entry.evidence![0]!, lineStart: 2 }] } : entry)
    expect(boundCoverage(changed)).not.toEqual(result)
  })

  it('reports excess groups and long reasons without exceeding the strict schema', () => {
    const input = entries(1_100).map((entry, i) => ({ ...entry, reason: `Reason ${i}` }))
    input.push({ analyzer: 'repository', scope: 'limits:source', status: 'partial', reason: 'BYTE_LIMIT' })
    const result = boundCoverage(input)
    expect(result).toHaveLength(1_000)
    expect(result).toEqual(boundCoverage([...input].reverse()))
    expect(result).toContainEqual(input.at(-1))
    const overflow = result.at(-1)!
    expect(overflow.scope).toBe('coverage-aggregation')
    expect(JSON.parse(overflow.reason!)).toMatchObject({ count: 102, omittedGroups: 102 })
    expect(result.every(entry => CoverageSchema.safeParse(entry).success)).toBe(true)
    const long = boundCoverage(entries(1_001).map(entry => ({ ...entry, reason: '\\'.repeat(1_024) })))
    expect(JSON.parse(long[0]!.reason!)).toMatchObject({ reasonTruncated: true, count: 1_001 })
    expect(CoverageSchema.safeParse(long[0]).success).toBe(true)
  })

  it('keeps existing summaries when service diagnostics are appended and tolerates plain reason text', () => {
    const group = boundCoverage(entries(1_001))[0]!
    const extra: Coverage[] = Array.from({ length: 1_000 }, (_, i) => ({ analyzer: 'service', scope: `diagnostic-${i}`, status: 'partial' }))
    const result = boundCoverage([group, ...extra])
    expect(result).toHaveLength(1_000)
    expect(result).toContainEqual(group)
    expect(JSON.parse(result.at(-1)!.reason!)).toMatchObject({ count: 2, omittedGroups: 2 })
    expect(() => boundCoverage([{ ...group, reason: '{"aggregation":"coverage-v1",not JSON' }, ...extra])).not.toThrow()
  })

  it('aggregates per-file capability diagnostics without changing the capability scope', () => {
    const result = boundCoverage(entries(1_001).map(entry => ({ ...entry, scope: 'signatures' })))
    expect(result).toHaveLength(1)
    expect(result[0]!.scope).toBe('signatures')
    expect(JSON.parse(result[0]!.reason!)).toMatchObject({ count: 1_001, evidenceOmitted: 993 })
  })

  it('indexes a synthetic repository with more than 1000 per-file coverage entries deterministically', () => {
    const root = mkdtempSync(join(tmpdir(), 'doc-bridge-coverage-'))
    try {
      mkdirSync(join(root, 'src'))
      mkdirSync(join(root, 'docs', 'agent'), { recursive: true })
      writeFileSync(join(root, 'package.json'), JSON.stringify({ name: 'coverage-fixture' }))
      writeFileSync(join(root, 'docs', 'agent', 'OVERVIEW.md'), '# Overview\n')
      for (let i = 0; i < 1_005; i++) writeFileSync(join(root, 'src', `file-${i}.ts`), 'export const value = import(variable)\n')
      const config = { schemaVersion: 1 as const, corpus: { agent: { root: 'docs/agent' } } }
      const snapshot = discoverRepository({ root, config })
      expect(snapshot.coverage.length).toBeLessThanOrEqual(1_000)
      const group = snapshot.coverage.find(entry => entry.scope === 'dynamic-imports:src')!
      expect(JSON.parse(group.reason!)).toMatchObject({ count: 1_005, evidenceOmitted: 997 })
      expect(discoverRepository({ root, config })).toEqual(snapshot)
      const cold = buildDocBridgeIndex({ root, config, snapshot, write: false }).index
      const warm = discoverRepository({ root, config, previous: snapshot })
      expect(warm.contentHash).toBe(snapshot.contentHash)
      expect(buildDocBridgeIndex({ root, config, snapshot: warm, write: false }).index.contentHash).toBe(cold.contentHash)
    } finally { rmSync(root, { recursive: true, force: true }) }
  }, 30_000)
})
