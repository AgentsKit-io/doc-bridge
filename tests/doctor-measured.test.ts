import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'

import { afterEach, describe, expect, it, vi } from 'vitest'

import { applyConfigDefaults } from '../src/config/defaults.js'
import { DocBridgeConfigV1Schema, type DocBridgeConfigV1 } from '../src/config/schema.js'
import { discoverRepository } from '../src/discovery/repository.js'
import { A_GRADE_REQUIREMENTS, computeScore, formatDoctorText, gradeFor, measureConnectivity, measureReachability, runDoctor, type DoctorCoverage } from '../src/doctor/run-doctor.js'
import { buildDocBridgeIndex } from '../src/index-builder/build-index.js'
import type { DocBridgeIndexV1 } from '../src/schemas/doc-bridge-index.js'

// The repository-level test discovers and projects this whole repository.
vi.setConfig({ testTimeout: 30_000 })

const repositoryRoot = process.cwd()
const temporary: string[] = []

afterEach(() => {
  for (const directory of temporary) rmSync(directory, { recursive: true, force: true })
  temporary.length = 0
})

const write = (root: string, path: string, content: string): void => {
  const target = join(root, path)
  mkdirSync(dirname(target), { recursive: true })
  writeFileSync(target, content, 'utf8')
}

const suite = {
  evalFormatVersion: '2026-04',
  name: 'fixture-retrieval',
  cases: [
    { id: 'symbol', input: 'searchIndex', metadata: { expectedTargets: ['module:src/query/search.ts'], kind: 'symbol' } },
    { id: 'ranking', input: 'ranking bm25', metadata: { expectedTargets: ['module:src/ranking/bm25.ts', 'docs/ranking.md'], kind: 'question' } },
    { id: 'query-area', input: 'query layer', metadata: { expectedTargets: ['area:src/query', 'docs/for-agents/query.md'], kind: 'ownership' } },
  ],
}

/**
 * A repository that can earn an A: every area is documented, every document but the hub links to
 * code, the ownership record has both documents, and a golden suite every case of which hits.
 */
const fixture = (overrides: Record<string, unknown> = {}, options: { readonly withSuite?: boolean } = {}): { readonly root: string; readonly config: DocBridgeConfigV1 } => {
  const root = mkdtempSync(join(tmpdir(), 'doc-bridge-doctor-'))
  temporary.push(root)
  writeFileSync(join(root, 'package.json'), JSON.stringify({ name: 'fixture', version: '0.0.0', scripts: { test: 'vitest run' } }), 'utf8')
  write(root, 'src/query/search.ts', "import { rank } from '../ranking/bm25.js'\nexport const searchIndex = (): number => rank()\n")
  write(root, 'src/ranking/bm25.ts', 'export const rank = (): number => 2\n')
  write(root, 'docs/for-agents/INDEX.md', '# Agent index\n\nStart with [query](./query.md) and the [ranking guide](../ranking.md).\n')
  write(root, 'docs/for-agents/query.md', '---\nid: fixture-query\neditRoot: src/query\n---\n# Query layer\n\nDeterministic search over the index. Exports `searchIndex`.\n')
  write(root, 'docs/ranking.md', '# Ranking\n\nScores come from `src/ranking/bm25.ts`, which exports `rank`; the `src/ranking` area owns it.\n')
  write(root, 'AGENTS.md', '# Agents\n\nRead the agent index first, then the `src/query` sidecar.\n')
  if (options.withSuite !== false) write(root, 'docs/bench/retrieval-suite-v1.json', JSON.stringify(suite, null, 2))
  const config = applyConfigDefaults(
    DocBridgeConfigV1Schema.parse({
      schemaVersion: 1,
      corpus: { agent: { root: 'docs/for-agents', index: 'docs/for-agents/INDEX.md' } },
      routing: {
        options: {
          ownership: {
            'fixture-query': { path: 'src/query', purpose: 'Query layer', checks: ['pnpm test'], agentDoc: 'docs/for-agents/query.md', humanDoc: 'docs/ranking.md' },
          },
        },
      },
      ...overrides,
    }),
  )
  return { root, config }
}

describe('the measured doctor', () => {
  it('reports reachability, connectivity and benchmark hit@3, and earns an A only when all three are met', () => {
    const { root, config } = fixture()
    buildDocBridgeIndex({ root, config, write: true })
    const report = runDoctor(root, config)

    expect(report.coverage.reachability).toMatchObject({ documentsTotal: 4, documentsReachable: 4, unreachable: [], pct: 100 })
    expect(report.coverage.connectivity).toMatchObject({ areasTotal: 2, areasDocumented: 2, undocumentedAreas: [], documentsTotal: 4, documentsLinked: 3, unlinkedDocuments: ['document:docs/for-agents/INDEX.md'] })
    expect(report.coverage.connectivity.pct).toBe(88)
    expect(report.coverage.benchmark).toMatchObject({ status: 'measured', suite: 'docs/bench/retrieval-suite-v1.json', caseCount: 3, hitAt3: 1 })
    expect(report.grading).toEqual({ reachability: true, connectivity: true, benchmark: true, unmet: [] })
    expect(report.score).toBeGreaterThanOrEqual(90)
    expect(report.grade).toBe('A')

    const text = formatDoctorText(report).join('\n')
    expect(text).toContain('Reachability:    4/4 documents in the retrieval projection (100%)')
    expect(text).toContain('Connectivity:    2/2 areas documented · 3/4 documents link to code (88%)')
    expect(text).toContain('Benchmark:       hit@3 100.0%')
    expect(text).not.toContain('an A requires')
  })

  it('reports the benchmark as not-analyzed when no golden suite exists, and withholds the A', () => {
    const { root, config } = fixture({}, { withSuite: false })
    buildDocBridgeIndex({ root, config, write: true })
    const report = runDoctor(root, config)

    expect(report.coverage.benchmark).toEqual({ status: 'not-analyzed', suite: 'docs/bench/retrieval-suite-v1.json', reason: 'No retrieval suite at docs/bench/retrieval-suite-v1.json' })
    expect(report.grading.benchmark).toBe(false)
    expect(report.grading.unmet).toEqual(['benchmark not-analyzed'])
    expect(report.grade).toBe('B')
    expect(report.issues.find((issue) => issue.code === 'benchmark-not-analyzed')).toMatchObject({ severity: 'info', action: 'ak-docs bench retrieval docs/bench/retrieval-suite-v1.json' })
    expect(formatDoctorText(report).join('\n')).toContain('Benchmark:       not-analyzed — No retrieval suite')

    // A configured suite path is honoured.
    write(root, 'bench/golden.json', JSON.stringify(suite))
    const configured = runDoctor(root, { ...config, retrieval: { ...config.retrieval, benchmark: { suite: 'bench/golden.json' } } })
    expect(configured.coverage.benchmark).toMatchObject({ status: 'measured', suite: 'bench/golden.json', hitAt3: 1 })
  })

  it('makes an A unreachable while document reachability is below 100 percent', () => {
    // The state before the corpus projection: an index with no retrieval projection at all.
    const { root, config } = fixture({ retrieval: { corpus: { enabled: false } } })
    buildDocBridgeIndex({ root, config, write: true })
    const before = runDoctor(root, config)
    expect(before.coverage.freshness.ok).toBe(true)
    expect(before.coverage.reachability).toMatchObject({ documentsTotal: 4, documentsReachable: 0, pct: 0 })
    expect(before.coverage.reachability.unreachable).toEqual(['document:AGENTS.md', 'document:docs/for-agents/INDEX.md', 'document:docs/for-agents/query.md', 'document:docs/ranking.md'])
    expect(before.grading.reachability).toBe(false)
    expect(before.grading.unmet[0]).toBe('reachability 0% < 100%')
    expect(before.grade).not.toBe('A')
    expect(before.issues.find((issue) => issue.code === 'documents-unreachable')).toMatchObject({ severity: 'warn', action: 'ak-docs index' })

    // The same repository with the projection: every document reachable, and the A back.
    const projected = { ...config, retrieval: {} }
    buildDocBridgeIndex({ root, config: projected, write: true })
    const after = runDoctor(root, projected)
    expect(after.coverage.reachability.pct).toBe(100)
    expect(after.grade).toBe('A')
  })

  it('proves it on this repository: reachable now, and one missing document is enough to lose the A', () => {
    const config = applyConfigDefaults(DocBridgeConfigV1Schema.parse(JSON.parse(readFileSync(join(repositoryRoot, 'doc-bridge.config.json'), 'utf8')) as unknown))
    const snapshot = discoverRepository({ root: repositoryRoot, config })
    const index = buildDocBridgeIndex({ root: repositoryRoot, config, write: false, snapshot }).index
    const reachability = measureReachability(snapshot, index)
    expect(reachability.documentsTotal).toBeGreaterThan(80)
    expect(reachability.pct).toBe(100)

    const connectivity = measureConnectivity(index)
    expect(connectivity.areasTotal).toBeGreaterThan(10)
    expect(connectivity.documentsTotal).toBe(reachability.documentsTotal)

    // A perfect score everywhere else cannot become an A with one document out of the projection.
    const base: DoctorCoverage = {
      reachability,
      connectivity: { ...connectivity, pct: 100 },
      benchmark: { status: 'measured', suite: 'docs/bench/retrieval-suite-v1.json', caseCount: 60, hitAt1: 0.78, hitAt3: 0.88, meanReciprocalRank: 0.83 },
      packages: { total: 1, withAgentDoc: 1, withHumanDoc: 1, missingAgentDoc: [], missingHumanDoc: [] },
      agentDocs: { total: 1, indexed: 1, unindexed: [] },
      freshness: { ok: true, message: 'Index is fresh', hasIndex: true },
      gates: { ok: true, results: [] },
    }
    expect(gradeFor(computeScore(base), base).grade).toBe('A')

    const stripped: DocBridgeIndexV1 = {
      ...index,
      projection: index.projection ? { ...index.projection, entries: index.projection.entries.filter((entry) => entry.id !== 'document:docs/mcp.md') } : undefined,
    }
    const partial = measureReachability(snapshot, stripped)
    expect(partial).toMatchObject({ documentsReachable: reachability.documentsTotal - 1, unreachable: ['document:docs/mcp.md'] })
    expect(partial.pct).toBeLessThan(A_GRADE_REQUIREMENTS.reachabilityPct)
    const graded = gradeFor(computeScore({ ...base, reachability: partial }), { ...base, reachability: partial })
    expect(graded.grade).toBe('B')
    expect(graded.grading.unmet).toEqual([`reachability ${partial.pct}% < 100%`])

    // And with no projection at all — the pre-projection index — nothing is reachable.
    const none = measureReachability(snapshot, { ...index, projection: undefined })
    expect(none.pct).toBe(0)
    expect(gradeFor(computeScore({ ...base, reachability: none }), { ...base, reachability: none }).grade).not.toBe('A')
  })

  it('lets connectivity and the benchmark lower the grade on their own', () => {
    const healthy: DoctorCoverage = {
      reachability: { documentsTotal: 10, documentsReachable: 10, unreachable: [], pct: 100 },
      connectivity: { areasTotal: 10, areasDocumented: 10, undocumentedAreas: [], documentsTotal: 10, documentsLinked: 10, unlinkedDocuments: [], pct: 100 },
      benchmark: { status: 'measured', suite: 's.json', caseCount: 10, hitAt1: 0.9, hitAt3: 1, meanReciprocalRank: 0.95 },
      packages: { total: 2, withAgentDoc: 2, withHumanDoc: 2, missingAgentDoc: [], missingHumanDoc: [] },
      agentDocs: { total: 2, indexed: 2, unindexed: [] },
      freshness: { ok: true, message: 'Index is fresh', hasIndex: true },
      gates: { ok: true, results: [] },
    }
    expect(computeScore(healthy)).toBe(100)
    expect(gradeFor(100, healthy).grade).toBe('A')

    const disconnected: DoctorCoverage = { ...healthy, connectivity: { ...healthy.connectivity, areasDocumented: 3, undocumentedAreas: ['area:a'], documentsLinked: 4, pct: 35 } }
    expect(computeScore(disconnected)).toBe(90)
    expect(gradeFor(computeScore(disconnected), disconnected)).toMatchObject({ grade: 'B', grading: { connectivity: false, unmet: ['connectivity 35% < 80%'] } })

    const weakRanker: DoctorCoverage = { ...healthy, benchmark: { status: 'measured', suite: 's.json', caseCount: 10, hitAt1: 0.5, hitAt3: 0.7, meanReciprocalRank: 0.6 } }
    expect(computeScore(weakRanker)).toBe(97)
    expect(gradeFor(97, weakRanker)).toMatchObject({ grade: 'B', grading: { benchmark: false, unmet: ['benchmark hit@3 70.0% < 80%'] } })
  })
})
