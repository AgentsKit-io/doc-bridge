import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { validateEvalSuite } from '@agentskit/core/eval-format'
import { beforeAll, describe, expect, it } from 'vitest'

import { runCli } from '../src/cli/program.js'
import { applyConfigDefaults } from '../src/config/defaults.js'
import { DocBridgeConfigV1Schema } from '../src/config/schema.js'
import { buildDocBridgeIndex } from '../src/index-builder/build-index.js'
import { contentHashForArtifactV1 } from '../src/index-builder/content-hash.js'
import {
  compareRetrievalBaseline,
  createRetrievalBaseline,
  parseRetrievalBaseline,
} from '../src/bench/baseline.js'
import {
  EVAL_FORMAT_VERSION,
  matchesRetrievalExpectation,
  parseRetrievalBenchResult,
  parseRetrievalSuite,
  runRetrievalBench,
  type RetrievalSuite,
} from '../src/bench/retrieval.js'
import { DocBridgeIndexV1Schema, type DocBridgeIndexV1 } from '../src/schemas/doc-bridge-index.js'

const SUITE_PATH = 'docs/bench/retrieval-suite-v1.json'
const BASELINE_PATH = 'docs/bench/retrieval-baseline-v1.json'

const capture = (fn: () => number | undefined): { readonly code: number | undefined; readonly out: string; readonly err: string } => {
  const stdout = process.stdout.write
  const stderr = process.stderr.write
  let out = ''
  let err = ''
  process.stdout.write = ((chunk: string | Uint8Array) => { out += String(chunk); return true }) as typeof process.stdout.write
  process.stderr.write = ((chunk: string | Uint8Array) => { err += String(chunk); return true }) as typeof process.stderr.write
  try {
    return { code: fn(), out, err }
  } finally {
    process.stdout.write = stdout
    process.stderr.write = stderr
  }
}

/** A three-entry index whose ranking for the queries below is known by construction. */
const fixtureIndex = (): DocBridgeIndexV1 => DocBridgeIndexV1Schema.parse({
  schemaVersion: 1,
  contentHash: 'a'.repeat(64),
  contentHashAlgo: 'sha256-normalized-v1',
  project: { name: 'fixture', root: '.' },
  knowledge: [
    { id: 'alpha', type: 'agent-doc', title: 'Alpha', path: 'docs/alpha.md', description: 'Alpha covers the widget subsystem.' },
    { id: 'beta', type: 'agent-doc', title: 'Beta', path: 'docs/beta.md', description: 'Beta mentions widget only in passing.' },
    { id: 'gamma', type: 'agent-doc', title: 'Gamma', path: 'docs/gamma.md', description: 'Gamma is about something else entirely.' },
  ],
  lookup: { packages: [] },
})

const suite = (cases: RetrievalSuite['cases']): RetrievalSuite => parseRetrievalSuite({
  evalFormatVersion: EVAL_FORMAT_VERSION,
  name: 'fixture-suite',
  cases,
})

describe('retrieval benchmark suite contract', () => {
  it('accepts the committed suite and reports its shape', () => {
    const parsed = parseRetrievalSuite(JSON.parse(readFileSync(SUITE_PATH, 'utf8')) as unknown)
    expect(parsed.cases.length).toBeGreaterThanOrEqual(40)
    const langs = new Set(parsed.cases.map((entry) => entry.metadata.lang))
    expect(langs).toContain('en')
    expect(langs).toContain('pt')
    const kinds = new Set(parsed.cases.map((entry) => entry.metadata.kind))
    expect(kinds).toEqual(new Set(['symbol', 'path', 'question', 'ownership']))
  })

  it('is a valid Open Eval Format document for the real ecosystem validator', () => {
    // The format is mirrored with Zod so the benchmark needs no optional peer at runtime.
    // This asserts the mirror has not drifted from `@agentskit/core/eval-format`.
    const raw = JSON.parse(readFileSync(SUITE_PATH, 'utf8')) as unknown
    const validated = validateEvalSuite(raw)
    expect(validated.evalFormatVersion).toBe(EVAL_FORMAT_VERSION)
    expect(validated.cases).toHaveLength(parseRetrievalSuite(raw).cases.length)
  })

  it('keeps every portable expectation consistent with its expected targets', () => {
    const escape = (value: string): string => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    for (const entry of parseRetrievalSuite(JSON.parse(readFileSync(SUITE_PATH, 'utf8')) as unknown).cases) {
      const expected = entry.expected
      expect(typeof expected === 'object' && expected?.regex).toBeTruthy()
      expect((expected as { regex: { body: string } }).regex.body).toBe(entry.metadata.expectedTargets.map(escape).join('|'))
    }
  })

  it('rejects a malformed suite', () => {
    expect(() => parseRetrievalSuite({ name: 'no version', cases: [] })).toThrow()
    expect(() => parseRetrievalSuite({ evalFormatVersion: '1999-01', name: 'bad version', cases: [{ id: 'a', input: 'a', metadata: { expectedTargets: ['x'] } }] })).toThrow()
    expect(() => parseRetrievalSuite({ evalFormatVersion: EVAL_FORMAT_VERSION, name: 'no targets', cases: [{ id: 'a', input: 'a', metadata: {} }] })).toThrow()
    expect(() => parseRetrievalSuite({
      evalFormatVersion: EVAL_FORMAT_VERSION,
      name: 'duplicate ids',
      cases: [
        { id: 'a', input: 'one', metadata: { expectedTargets: ['x'] } },
        { id: 'a', input: 'two', metadata: { expectedTargets: ['y'] } },
      ],
    })).toThrow(/Duplicate case id/)
  })

  it('evaluates a portable expectation the same way the ecosystem helper does', () => {
    expect(matchesRetrievalExpectation('docs/alpha.md', { contains: 'alpha' })).toBe(true)
    expect(matchesRetrievalExpectation('docs/beta.md', { contains: 'alpha' })).toBe(false)
    expect(matchesRetrievalExpectation('docs/alpha.md', { regex: { body: 'alpha|beta' } })).toBe(true)
    expect(matchesRetrievalExpectation('DOCS/Alpha.md', { equalsNormalized: 'docs/alpha.md' })).toBe(true)
    expect(matchesRetrievalExpectation('anything', undefined)).toBe(true)
  })
})

describe('retrieval benchmark metrics', () => {
  it('scores rank, hit@k and reciprocal rank against a known ranking', () => {
    const index = fixtureIndex()
    const result = runRetrievalBench({
      index,
      suite: suite([
        { id: 'first', input: 'alpha', metadata: { expectedTargets: ['docs/alpha.md'], kind: 'path', lang: 'en' } },
        { id: 'absent', input: 'widget', metadata: { expectedTargets: ['docs/nowhere.md'], kind: 'question', lang: 'en' } },
        { id: 'empty', input: 'zzzzzznomatch', metadata: { expectedTargets: ['docs/alpha.md'], kind: 'question', lang: 'pt' } },
      ]),
    })

    const first = result.cases.find((entry) => entry.id === 'first')
    expect(first?.rank).toBe(1)
    expect(first?.hitAt1).toBe(true)
    expect(first?.hitAt3).toBe(true)
    expect(first?.reciprocalRank).toBe(1)

    const absent = result.cases.find((entry) => entry.id === 'absent')
    expect(absent?.resultCount).toBeGreaterThan(0)
    expect(absent?.rank).toBeNull()
    expect(absent?.hitAt3).toBe(false)
    expect(absent?.reciprocalRank).toBe(0)

    const empty = result.cases.find((entry) => entry.id === 'empty')
    expect(empty?.resultCount).toBe(0)
    expect(empty?.rank).toBeNull()
    expect(empty?.contextBytes).toBe(2) // "[]"

    expect(result.metrics.caseCount).toBe(3)
    expect(result.metrics.hitAt1).toBeCloseTo(1 / 3, 5)
    expect(result.metrics.hitAt3).toBeCloseTo(1 / 3, 5)
    expect(result.metrics.zeroResultRate).toBeCloseTo(1 / 3, 5)
    expect(result.metrics.tokenMethod).toBe('approximate')
    expect(result.byLang.en?.caseCount).toBe(2)
    expect(result.byLang.pt?.caseCount).toBe(1)
    expect(result.byKind.path?.hitAt3).toBe(1)
  })

  it('matches a target by entity id as well as by path', () => {
    const result = runRetrievalBench({
      index: fixtureIndex(),
      suite: suite([{ id: 'by-id', input: 'alpha', metadata: { expectedTargets: ['alpha'] } }]),
    })
    expect(result.cases[0]?.rank).toBe(1)
  })

  it('produces an identical artifact for two runs over the same inputs', () => {
    const index = fixtureIndex()
    const fixture = suite([{ id: 'first', input: 'alpha', metadata: { expectedTargets: ['docs/alpha.md'] } }])
    const one = runRetrievalBench({ index, suite: fixture })
    const two = runRetrievalBench({ index, suite: fixture })
    expect(one.contentHash).toBe(two.contentHash)
    expect(JSON.stringify(one)).toBe(JSON.stringify(two))
    expect(parseRetrievalBenchResult(JSON.parse(JSON.stringify(one)) as unknown).contentHash).toBe(one.contentHash)
  })

  it('rejects a tampered result artifact', () => {
    const result = runRetrievalBench({
      index: fixtureIndex(),
      suite: suite([{ id: 'first', input: 'alpha', metadata: { expectedTargets: ['docs/alpha.md'] } }]),
    })
    expect(() => parseRetrievalBenchResult({ ...result, limit: result.limit + 1 })).toThrow(/content hash/)
  })
})

describe('retrieval baseline gate', () => {
  // One hit, one ranked miss and one query with no results at all, so every metric the
  // comparison reports can move in either direction.
  const measured = () => runRetrievalBench({
    index: fixtureIndex(),
    suite: suite([
      { id: 'hit', input: 'alpha', metadata: { expectedTargets: ['docs/alpha.md'] } },
      { id: 'miss', input: 'widget', metadata: { expectedTargets: ['docs/nowhere.md'] } },
      { id: 'empty', input: 'zzzzzznomatch', metadata: { expectedTargets: ['docs/alpha.md'] } },
    ]),
  })

  it('requires an approver and records provenance', () => {
    const result = measured()
    expect(() => createRetrievalBaseline({ result, approvedBy: '  ' })).toThrow(/requires an approver/)
    const baseline = createRetrievalBaseline({ result, approvedBy: 'human', reason: 'first measurement' })
    expect(baseline.approval.approvedBy).toBe('human')
    expect(baseline.approval.resultHash).toBe(result.contentHash)
    expect(baseline.approval.indexHash).toBe(result.index.contentHash)
    expect(parseRetrievalBaseline(JSON.parse(JSON.stringify(baseline)) as unknown).contentHash).toBe(baseline.contentHash)
    expect(() => parseRetrievalBaseline({ ...baseline, metrics: { ...baseline.metrics, hitAt3: 1 } })).toThrow(/content hash/)
  })

  it('passes when nothing moved', () => {
    const result = measured()
    const comparison = compareRetrievalBaseline(result, createRetrievalBaseline({ result, approvedBy: 'human' }))
    expect(comparison.status).toBe('pass')
    expect(comparison.blocking).toBe(false)
    expect(comparison.regressions).toEqual([])
  })

  it('blocks a hit@3 regression and only warns about the other metrics', () => {
    const result = measured()
    const baseline = createRetrievalBaseline({ result, approvedBy: 'human' })
    const regressed = { ...baseline, metrics: { ...baseline.metrics, hitAt3: 0.9, hitAt1: 0.9, zeroResultRate: 0 } }
    const comparison = compareRetrievalBaseline(result, regressed)
    expect(comparison.status).toBe('regressed')
    expect(comparison.blocking).toBe(true)
    expect(comparison.regressions.join(' ')).toContain('hitAt3')
    expect(comparison.warnings.join(' ')).toContain('hitAt1')
    expect(comparison.warnings.join(' ')).toContain('zeroResultRate')
  })

  it('reports an improvement without blocking', () => {
    const result = measured()
    const baseline = createRetrievalBaseline({ result, approvedBy: 'human' })
    const weaker = { ...baseline, metrics: { ...baseline.metrics, hitAt3: 0, hitAt1: 0 } }
    const comparison = compareRetrievalBaseline(result, weaker)
    expect(comparison.status).toBe('pass')
    expect(comparison.blocking).toBe(false)
    expect(comparison.improvements.join(' ')).toContain('hitAt3')
  })

  it('honours a tolerance on the blocking metric', () => {
    const result = measured()
    const baseline = createRetrievalBaseline({ result, approvedBy: 'human' })
    const slightlyBetterBefore = { ...baseline, metrics: { ...baseline.metrics, hitAt3: baseline.metrics.hitAt3 + 0.02 } }
    expect(compareRetrievalBaseline(result, slightlyBetterBefore).blocking).toBe(true)
    expect(compareRetrievalBaseline(result, slightlyBetterBefore, { tolerance: 0.05 }).blocking).toBe(false)
    expect(() => compareRetrievalBaseline(result, baseline, { tolerance: -1 })).toThrow(/must not be negative/)
  })

  it('fails closed when the suite changed, because the figures are not comparable', () => {
    const result = measured()
    const baseline = createRetrievalBaseline({ result, approvedBy: 'human' })
    const otherSuite = { ...baseline, suite: { ...baseline.suite, contentHash: 'f'.repeat(64) } }
    const comparison = compareRetrievalBaseline(result, otherSuite)
    expect(comparison.status).toBe('suite-changed')
    expect(comparison.blocking).toBe(true)
    expect(comparison.regressions.join(' ')).toContain('--update-baseline')
  })
})

describe('bench CLI', () => {
  /*
   * The benchmark measures the index, and the index now projects every document and module in the
   * repository — so editing any file makes it stale. CI runs `ak-docs index` before the gate for
   * the same reason; these tests build it themselves so they do not depend on what ran before.
   */
  beforeAll(() => {
    const config = applyConfigDefaults(
      DocBridgeConfigV1Schema.parse(JSON.parse(readFileSync('doc-bridge.config.json', 'utf8')) as unknown),
    )
    buildDocBridgeIndex({ root: process.cwd(), config })
  })

  it('measures the committed suite against the committed baseline and exits zero', () => {
    const run = capture(() => runCli(['bench', 'retrieval', SUITE_PATH, '--baseline', BASELINE_PATH, '--json']))
    expect(run.code).toBe(0)
    const payload = JSON.parse(run.out) as { ok: boolean; comparison: { status: string }; result: { metrics: { caseCount: number } } }
    expect(payload.ok).toBe(true)
    expect(payload.comparison.status).toBe('pass')
    expect(payload.result.metrics.caseCount).toBeGreaterThanOrEqual(40)
  })

  it('exits one when the current ranking is worse than the approved baseline', () => {
    const directory = mkdtempSync(join(tmpdir(), 'doc-bridge-bench-regression-'))
    const path = join(directory, 'baseline.json')
    const baseline = parseRetrievalBaseline(JSON.parse(readFileSync(BASELINE_PATH, 'utf8')) as unknown)
    // A baseline that claims a better past ranking, hashed correctly so it is accepted.
    // This is the CI gate: today's figures are below the approved ones.
    const stronger = { ...baseline, metrics: { ...baseline.metrics, hitAt3: 0.95, hitAt1: 0.9 } }
    const rehashed = { ...stronger, contentHash: contentHashForArtifactV1(stronger) }
    writeFileSync(path, `${JSON.stringify(rehashed, null, 2)}\n`, 'utf8')

    const run = capture(() => runCli(['bench', 'retrieval', SUITE_PATH, '--baseline', path, '--json']))
    expect(run.code).toBe(1)
    const payload = JSON.parse(run.out) as { ok: boolean; comparison: { status: string; regressions: string[]; warnings: string[] } }
    expect(payload.ok).toBe(false)
    expect(payload.comparison.status).toBe('regressed')
    expect(payload.comparison.regressions.join(' ')).toContain('hitAt3')
    expect(payload.comparison.warnings.join(' ')).toContain('hitAt1')
  })

  it('refuses a baseline whose figures were edited by hand', () => {
    const directory = mkdtempSync(join(tmpdir(), 'doc-bridge-bench-tampered-'))
    const path = join(directory, 'baseline.json')
    const baseline = parseRetrievalBaseline(JSON.parse(readFileSync(BASELINE_PATH, 'utf8')) as unknown)
    // Same edit, original hash: the gate cannot be relaxed by editing the file.
    writeFileSync(path, `${JSON.stringify({ ...baseline, metrics: { ...baseline.metrics, hitAt3: 0.95 } }, null, 2)}\n`, 'utf8')
    const run = capture(() => runCli(['bench', 'retrieval', SUITE_PATH, '--baseline', path, '--json']))
    expect(run.code).toBe(2)
    expect(run.err).toContain('content hash')
  })

  it('refuses to write a baseline without an approver, and writes one with it', () => {
    const directory = mkdtempSync(join(tmpdir(), 'doc-bridge-bench-approve-'))
    const path = join(directory, 'baseline.json')

    const refused = capture(() => runCli(['bench', 'retrieval', SUITE_PATH, '--baseline', path, '--update-baseline', '--json']))
    expect(refused.code).toBe(2)
    expect(refused.err).toContain('--by')

    const approved = capture(() => runCli(['bench', 'retrieval', SUITE_PATH, '--baseline', path, '--update-baseline', '--by', 'tester', '--json']))
    expect(approved.code).toBe(0)
    const written = parseRetrievalBaseline(JSON.parse(readFileSync(path, 'utf8')) as unknown)
    expect(written.approval.approvedBy).toBe('tester')
  })

  it('explains a missing baseline instead of failing obscurely', () => {
    const directory = mkdtempSync(join(tmpdir(), 'doc-bridge-bench-missing-'))
    const run = capture(() => runCli(['bench', 'retrieval', SUITE_PATH, '--baseline', join(directory, 'absent.json'), '--json']))
    expect(run.code).toBe(2)
    expect(run.err).toContain('--update-baseline')
  })

  it('rejects an invalid limit and an unknown subcommand', () => {
    expect(capture(() => runCli(['bench', 'retrieval', SUITE_PATH, '--limit', '0', '--json'])).code).toBe(2)
    expect(capture(() => runCli(['bench', 'nonsense', '--json'])).code).toBe(1)
  })
})
