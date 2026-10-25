import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'

import { afterEach, describe, expect, it, vi } from 'vitest'

import { applyConfigDefaults } from '../src/config/defaults.js'
import { DocBridgeConfigV1Schema, type DocBridgeConfigV1 } from '../src/config/schema.js'
import { formatDoctorText, measureConnectivity, runDoctor } from '../src/doctor/run-doctor.js'
import { buildDocBridgeIndex } from '../src/index-builder/build-index.js'

vi.setConfig({ testTimeout: 120_000 })

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

const fixture = (exclude?: { pattern: string; reason: string }[]): { readonly root: string; readonly config: DocBridgeConfigV1 } => {
  const root = mkdtempSync(join(tmpdir(), 'doc-bridge-doctor-exclude-'))
  temporary.push(root)
  write(root, 'package.json', JSON.stringify({ name: 'fixture', version: '0.0.0' }))
  write(root, 'src/query/search.ts', "import { rank } from '../ranking/bm25.js'\nexport const searchIndex = (): number => rank()\n")
  write(root, 'src/ranking/bm25.ts', 'export const rank = (): number => 2\n')
  write(root, 'docs/for-agents/INDEX.md', '# Agent index\n\nStart with [query](./query.md) and the [ranking guide](../ranking.md).\n')
  write(root, 'docs/for-agents/query.md', '---\nid: fixture-query\neditRoot: src/query\n---\n# Query layer\n\nDeterministic search over the index. Exports `searchIndex`.\n')
  write(root, 'docs/ranking.md', '# Ranking\n\nScores come from `src/ranking/bm25.ts`, which exports `rank`; the `src/ranking` area owns it.\n')
  write(root, 'AGENTS.md', '# Agents\n\nRead the agent index first, then the `src/query` sidecar.\n')
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
      ...(exclude ? { analysis: { documents: { exclude } } } : {}),
    }),
  )
  return { root, config }
}

const measure = (exclude?: { pattern: string; reason: string }[]) => {
  const { root, config } = fixture(exclude)
  const index = buildDocBridgeIndex({ root, config, write: false }).index
  return { root, config, index, connectivity: measureConnectivity(index, exclude ?? []) }
}

describe('connectivity document exclusions', () => {
  it('leaves the result unchanged without exclusions', () => {
    const { connectivity } = measure()
    expect(connectivity).toMatchObject({ documentsTotal: 4, documentsLinked: 3, documentsExcluded: 0, exclusions: [], pct: 88 })
  })

  it('removes excluded documents from numerator and denominator only', () => {
    const { connectivity } = measure([{ pattern: 'docs/for-agents/INDEX.md', reason: 'hub for readers' }])
    expect(connectivity).toMatchObject({ documentsTotal: 3, documentsLinked: 3, unlinkedDocuments: [], documentsExcluded: 1, pct: 100 })
    expect(connectivity.exclusions).toEqual([{ pattern: 'docs/for-agents/INDEX.md', reason: 'hub for readers', matched: 1 }])
  })

  it('still counts an excluded document as documenting an area', () => {
    const { connectivity } = measure([{ pattern: 'docs/ranking.md', reason: 'guide for readers' }])
    expect(connectivity).toMatchObject({ areasTotal: 2, areasDocumented: 2, documentsTotal: 3, documentsLinked: 2, documentsExcluded: 1 })
  })

  it('drops the document share instead of dividing by zero when everything is excluded', () => {
    const { connectivity } = measure([{ pattern: '**', reason: 'nothing here describes code' }])
    expect(connectivity).toMatchObject({ documentsTotal: 0, documentsLinked: 0, documentsExcluded: 4, pct: 100 })
    expect(Number.isNaN(connectivity.pct)).toBe(false)
  })
})

describe('doctor reporting of document exclusions', () => {
  it('prints the Excluded line and carries the data in the JSON report', () => {
    const { root, config } = fixture([{ pattern: 'docs/ranking.md', reason: 'guide for readers' }])
    buildDocBridgeIndex({ root, config, write: true })
    const report = runDoctor(root, config)
    expect(formatDoctorText(report).join('\n')).toContain('Excluded:        1 documents by policy (docs/ranking.md — guide for readers)')
    const json = JSON.parse(JSON.stringify(report)) as typeof report
    expect(json.coverage.connectivity.documentsExcluded).toBe(1)
    expect(json.coverage.connectivity.exclusions).toEqual([{ pattern: 'docs/ranking.md', reason: 'guide for readers', matched: 1 }])
    expect(report.issues.map((issue) => issue.code)).not.toContain('document-exclusion-stale')
  })

  it('omits the Excluded line when nothing is excluded', () => {
    const { root, config } = fixture()
    buildDocBridgeIndex({ root, config, write: true })
    expect(formatDoctorText(runDoctor(root, config)).join('\n')).not.toContain('Excluded:')
  })

  it('warns about a pattern that matches no document', () => {
    const { root, config } = fixture([{ pattern: 'content/**', reason: 'published guides' }])
    buildDocBridgeIndex({ root, config, write: true })
    const issue = runDoctor(root, config).issues.find((entry) => entry.code === 'document-exclusion-stale')
    expect(issue).toMatchObject({ severity: 'warn' })
    expect(issue?.message).toContain('content/**')
  })

  it('reports as info when more than half of all documents are excluded', () => {
    const { root, config } = fixture([{ pattern: 'docs/**', reason: 'guides for readers' }])
    buildDocBridgeIndex({ root, config, write: true })
    const issue = runDoctor(root, config).issues.find((entry) => entry.code === 'documents-mostly-excluded')
    expect(issue).toMatchObject({ severity: 'info' })
    expect(issue?.message).toContain('3 of 4')

    const half = fixture([{ pattern: 'docs/for-agents/**', reason: 'agent docs' }])
    buildDocBridgeIndex({ root: half.root, config: half.config, write: true })
    expect(runDoctor(half.root, half.config).issues.map((entry) => entry.code)).not.toContain('documents-mostly-excluded')
  })
})
