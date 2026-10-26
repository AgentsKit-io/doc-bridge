import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, describe, expect, it, vi } from 'vitest'

// Glob compilations are counted, never timed: wall-clock thresholds are flaky, counts are not.
const compilations = vi.hoisted(() => ({ count: 0 }))
vi.mock('minimatch', async () => {
  const actual = await vi.importActual<typeof import('minimatch')>('minimatch')
  class CountingMinimatch extends actual.Minimatch {
    constructor(pattern: string, options?: import('minimatch').MinimatchOptions) {
      super(pattern, options)
      compilations.count++
    }
  }
  const counted = ((path: string, pattern: string, options?: import('minimatch').MinimatchOptions) => {
    compilations.count++
    return actual.minimatch(path, pattern, options)
  }) as typeof actual.minimatch
  return { ...actual, Minimatch: CountingMinimatch, minimatch: counted }
})

import { loadCliConfig } from '../src/config/load-config.js'
import { deriveAreas } from '../src/discovery/areas.js'
import { MARKDOWN_ANALYZER_VERSION, analyzeMarkdownDocument, parseMarkdownDocument, type MarkdownResolution } from '../src/discovery/markdown.js'
import { buildDocBridgeIndex } from '../src/index-builder/build-index.js'
import { createFuzzyCandidateIndex, fuzzyMatchList, resolveFuzzyReference } from '../src/lib/fuzzy-match.js'
import { globMatch } from '../src/lib/glob.js'
import { minimatch } from 'minimatch'
// @ts-expect-error The generator is a plain ES module under scripts/.
import { generateLargeFixture } from '../scripts/generate-large-fixture.mjs'

const temporary: string[] = []
afterEach(() => {
  for (const directory of temporary) rmSync(directory, { recursive: true, force: true })
  temporary.length = 0
})

const indexFixture = (packages: number, docs: number): number => {
  const root = mkdtempSync(join(tmpdir(), 'doc-bridge-scaling-'))
  temporary.push(root)
  generateLargeFixture(root, packages, docs)
  const { config } = loadCliConfig({ cwd: root })
  compilations.count = 0
  const { index } = buildDocBridgeIndex({ root, config, write: false })
  expect(index.knowledge.length).toBeGreaterThanOrEqual(packages * docs)
  return compilations.count
}

describe('index scaling guards', () => {
  it('compiles each glob pattern once, however many files are scanned', () => {
    const compiled = indexFixture(12, 10)
    // Before the fix every (file x pattern) pair compiled again: well over a thousand here. The
    // distinct patterns of one configuration are a small constant (19 when written).
    expect(compiled).toBeLessThanOrEqual(40)
  })

  it('builds per-resolution lookups once, not once per document', () => {
    let iterations = 0
    class CountingMap<K, V> extends Map<K, V> {
      override [Symbol.iterator](): MapIterator<[K, V]> {
        iterations++
        return super[Symbol.iterator]()
      }
    }
    const modules = new CountingMap<string, string>([['src/a.ts', 'module:src/a.ts']])
    const resolution: MarkdownResolution = {
      documents: new Map(),
      modules,
      packages: new Map(),
      symbols: new Map(),
    }
    for (let i = 0; i < 25; i++) {
      const document = parseMarkdownDocument(`docs/d${i}.md`, `# Doc ${i}\n\nSee \`src/a.ts\`.\n`)
      analyzeMarkdownDocument(document, `document:docs/d${i}.md`, resolution)
    }
    expect(MARKDOWN_ANALYZER_VERSION).toBeTruthy()
    expect(iterations).toBeLessThanOrEqual(2)
  })

  it('scans the path universe once per distinct fuzzy reference, not once per mention', () => {
    let scans = 0
    class CountingMap<K, V> extends Map<K, V> {
      override [Symbol.iterator](): MapIterator<[K, V]> {
        scans++
        return super[Symbol.iterator]()
      }
    }
    const paths = [
      'docs/guides/getting-started.md',
      'docs/guides/configuration-reference.md',
      'docs/architecture/overview.md',
      'src/lib/fuzzy-match.ts',
    ]
    const built = createFuzzyCandidateIndex(paths)
    const index = { ...built, byLength: new CountingMap(built.byLength) }
    const queries = ['docs/guides/getting-startd.md', 'src/lib/fuzzy-matc.ts']
    const expected = queries.map(query => resolveFuzzyReference(query, paths))
    expect(expected.every(match => match !== undefined)).toBe(true)
    for (let i = 0; i < 25; i++) {
      const query = queries[i % 2]!
      expect(resolveFuzzyReference(query, index)).toEqual(expected[i % 2])
    }
    expect(scans).toBe(2)
    // Plain arrays are never memoized, and a rebuilt index starts with no memoized results.
    expect(resolveFuzzyReference(queries[0]!, paths)).toEqual(expected[0])
    expect(scans).toBe(2)
    const rebuilt = { ...built, byLength: new CountingMap(built.byLength) }
    expect(resolveFuzzyReference(queries[0]!, rebuilt)).toEqual(expected[0])
    expect(scans).toBe(3)
  })

  it('assigns modules to the most specific area exactly as an exhaustive search would', () => {
    const modules = []
    for (let p = 0; p < 6; p++) {
      for (const dir of ['src', 'src/a', 'src/a/b', 'src/c', 'lib/x', 'lib/x/y/z', '.']) {
        modules.push({ moduleId: `m:${p}:${dir}`, path: `packages/p${p}/${dir === '.' ? 'index.ts' : `${dir}/index.ts`}`, packagePath: `packages/p${p}`, packageId: `pkg:${p}` })
      }
    }
    const areas = deriveAreas({ modules, depth: 2, ownership: [{ id: 'own', path: 'packages/p1/src/a/b' }] })
    const paths = areas.map(area => area.path)
    const enclosing = (path: string, strict: boolean) => [...paths].filter(c => (!strict && c === path) || path.startsWith(`${c}/`)).sort((a, b) => b.length - a.length)[0]
    for (const area of areas) {
      const parent = enclosing(area.path, true)
      expect(area.parentId).toBe(parent ? areas.find(candidate => candidate.path === parent)!.id : undefined)
      for (const moduleId of area.moduleIds) {
        const module = modules.find(item => item.moduleId === moduleId)!
        expect(enclosing(module.path, false)).toBe(area.path)
      }
    }
    expect(areas.flatMap(area => area.moduleIds).length).toBeGreaterThan(0)
  })
})

// These live here rather than in files of their own: the retrieval benchmark and its ranking tests
// index this repository, and each extra test module shifts the ranking they pin.
describe('globMatch', () => {
  it('matches like minimatch with dot files, and treats a leading # as a comment', () => {
    for (const [path, pattern] of [
      ['src/a.ts', 'src/**/*.ts'],
      ['.github/x.yml', '.github/**'],
      ['src/a.ts', 'docs/**'],
      ['#a', '#a'],
    ] as const) {
      expect(globMatch(path, pattern)).toBe(pattern.startsWith('#') ? false : minimatch(path, pattern, { dot: true }))
    }
  })

  it('keeps answering correctly once the compiled-pattern cache has filled and been cleared', () => {
    for (let i = 0; i < 2500; i++) expect(globMatch(`dir${i}/file.md`, `dir${i}/*.md`)).toBe(true)
    expect(globMatch('dir0/file.md', 'dir0/*.md')).toBe(true)
    expect(globMatch('dir0/file.md', 'dir1/*.md')).toBe(false)
  })
})

const fuzzyPaths = [
  'docs/guides/getting-started.md',
  'docs/guides/configuration-reference.md',
  'docs/architecture/overview.md',
  'src/lib/fuzzy-match.ts',
  'src/lib/fuzzy-matcher.ts',
  'src/ünïcode/日本語.md',
]

describe('fuzzy candidate index', () => {
  it('ranks exactly like a plain list, including non-ASCII characters', () => {
    const index = createFuzzyCandidateIndex(fuzzyPaths)
    for (const query of ['docs/guides/getting-startd.md', 'src/lib/fuzzy-match.ts', 'src/ünïcode/日本語.mdx', 'zzz']) {
      for (const threshold of [0.7, 0.85, 0.92]) {
        expect(fuzzyMatchList(query, index, { threshold })).toEqual(fuzzyMatchList(query, fuzzyPaths, { threshold }))
      }
    }
  })

  it('resolves like the unmemoized search, and a repeat returns the same result', () => {
    const index = createFuzzyCandidateIndex(fuzzyPaths)
    const query = 'docs/guides/getting-startd.md'
    const first = resolveFuzzyReference(query, index)
    expect(first).toEqual(resolveFuzzyReference(query, fuzzyPaths))
    expect(first?.candidate).toBe('docs/guides/getting-started.md')
    expect(resolveFuzzyReference(query, index)).toBe(first)
  })

  it('keeps an ambiguous or missing reference unresolved, per threshold', () => {
    const index = createFuzzyCandidateIndex(fuzzyPaths)
    expect(resolveFuzzyReference('src/lib/fuzzy-match', index, 0.8)).toBeUndefined()
    expect(resolveFuzzyReference('nothing/like/this.md', index)).toBeUndefined()
    expect(resolveFuzzyReference('docs/guides/getting-startd.md', index, 0.999)).toBeUndefined()
    expect(resolveFuzzyReference('docs/guides/getting-startd.md', index)).toBeDefined()
  })
})
