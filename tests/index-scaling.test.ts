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
