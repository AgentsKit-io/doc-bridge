import { readFileSync } from 'node:fs'

import ignore from 'ignore'
import { describe, expect, it, vi } from 'vitest'

import { parseRetrievalSuite, runRetrievalBench, type RetrievalSuite } from '../src/bench/retrieval.js'
import { applyConfigDefaults } from '../src/config/defaults.js'
import { DocBridgeConfigV1Schema } from '../src/config/schema.js'
import { buildDocBridgeIndex } from '../src/index-builder/build-index.js'
import { searchIndex } from '../src/query/search.js'
import { DocBridgeIndexV1Schema, type DocBridgeIndexV1 } from '../src/schemas/doc-bridge-index.js'

// Each build scans the whole repository; the budget is for the machine, as in the other repository-scale tests.
vi.setConfig({ testTimeout: 180_000 })

const SUITE_PATH = 'docs/bench/retrieval-suite-v1.json'

const repositoryIndex = (): DocBridgeIndexV1 => {
  const config = applyConfigDefaults(DocBridgeConfigV1Schema.parse(JSON.parse(readFileSync('doc-bridge.config.json', 'utf8')) as unknown))
  return buildDocBridgeIndex({ root: process.cwd(), config, write: false }).index
}

/** A small universe whose answers differ from the repository's, so state leaking from it would show. */
const otherIndex = (): DocBridgeIndexV1 => DocBridgeIndexV1Schema.parse({
  schemaVersion: 1,
  contentHash: 'b'.repeat(64),
  contentHashAlgo: 'sha256-normalized-v1',
  project: { name: 'other', root: '.' },
  knowledge: [
    { id: 'one', type: 'agent-doc', title: 'One', path: 'docs/one.md', description: 'one covers workflow transitions and schema' },
    { id: 'two', type: 'agent-doc', title: 'Two', path: 'docs/two.md', description: 'two covers the bench and retrieval' },
  ],
  lookup: { packages: [] },
})

type CaseRanking = {
  readonly id: string
  readonly rank: number | null
  readonly hitAt1: boolean
  readonly hitAt3: boolean
  /** Every page the search returned for the case, in ranked order. */
  readonly pages: readonly string[]
}

const rankingsOf = (
  bench: typeof runRetrievalBench,
  search: typeof searchIndex,
  index: DocBridgeIndexV1,
  suite: RetrievalSuite,
) => {
  const result = bench({ index, suite })
  const cases: CaseRanking[] = suite.cases.map((entry) => {
    const outcome = result.cases.find((candidate) => candidate.id === entry.id)
    if (!outcome) throw new Error(`No bench outcome for ${entry.id}`)
    return {
      id: entry.id,
      rank: outcome.rank,
      hitAt1: outcome.hitAt1,
      hitAt3: outcome.hitAt3,
      pages: search(index, entry.input, 20).map((match) => match.id),
    }
  })
  return { metrics: result.metrics, cases }
}

describe('retrieval bench, cold and warm in one process', () => {
  it('ranks every case of the committed suite the same on a warm run as on a cold run', async () => {
    const suite = parseRetrievalSuite(JSON.parse(readFileSync(SUITE_PATH, 'utf8')) as unknown)
    const index = repositoryIndex()

    // Warm: this module instance has already served another universe, as a long-lived process does.
    // A cache that outlives a run and is keyed by the query alone would answer from that universe here.
    runRetrievalBench({ index: otherIndex(), suite })
    const warm = rankingsOf(runRetrievalBench, searchIndex, index, suite)

    // Cold: a fresh module graph, with none of the state an earlier run left behind.
    vi.resetModules()
    const fresh = await import('../src/bench/retrieval.js')
    const freshSearch = await import('../src/query/search.js')
    const cold = rankingsOf(fresh.runRetrievalBench, freshSearch.searchIndex, index, suite)

    expect(warm.metrics).toEqual(cold.metrics)
    expect(warm.cases.map(({ id, rank, hitAt1, hitAt3 }) => ({ id, rank, hitAt1, hitAt3 })))
      .toEqual(cold.cases.map(({ id, rank, hitAt1, hitAt3 }) => ({ id, rank, hitAt1, hitAt3 })))
    for (const [position, entry] of cold.cases.entries()) {
      expect(warm.cases[position]?.pages, entry.id).toEqual(entry.pages)
    }
  })
})

describe('repository scan ignores loop bookkeeping', () => {
  it('keeps the loop worker directory out of the files the index reads', () => {
    // The walker applies these rules in a checkout without Git too, so the rule itself is the contract.
    const rules = ignore().add(readFileSync('.gitignore', 'utf8'))
    expect(rules.ignores('.ak-loop/plan.md')).toBe(true)
    expect(rules.ignores('.ak-loop/verify.json')).toBe(true)
    expect(rules.ignores('src/query/search.ts')).toBe(false)
  })
})
