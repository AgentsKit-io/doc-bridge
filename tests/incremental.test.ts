import { mkdirSync, mkdtempSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  declaredExportsOf,
  exportsOf,
  fileContentHash,
  indexPriorSnapshot,
  moduleUniverseFingerprint,
  replayableRelations,
  resolutionFingerprint,
  reuseCoverage,
  emptyLedger,
} from '../src/discovery/incremental.js'
import { markdownContentHash } from '../src/discovery/markdown.js'
import { discoverRepository } from '../src/discovery/repository.js'
import { contentHashForArtifactV1 } from '../src/index-builder/content-hash.js'
import { toPosix } from '../src/lib/paths.js'
import type { DiscoverySnapshotV1, KnowledgeEntity } from '../src/schemas/knowledge.js'

/**
 * Every TypeScript parse this process performs, by file.
 *
 * The claim "only the changed file was re-parsed" is about parser invocations, so it is asserted
 * by counting them rather than by measuring how long a run took.
 */
const parses = vi.hoisted(() => ({ files: [] as string[] }))

vi.mock('typescript', async (importOriginal) => {
  const actual = (await importOriginal()) as { readonly default?: typeof import('typescript') } & typeof import('typescript')
  const real = actual.default ?? actual
  const wrapped = {
    ...real,
    createSourceFile: (...args: Parameters<typeof real.createSourceFile>) => {
      parses.files.push(args[0])
      return real.createSourceFile(...args)
    },
  }
  return { ...wrapped, default: wrapped }
})

const temporary: string[] = []

beforeEach(() => {
  parses.files.length = 0
})

afterEach(() => {
  vi.restoreAllMocks()
  for (const directory of temporary) rmSync(directory, { recursive: true, force: true })
  temporary.length = 0
})

const write = (root: string, path: string, content: string): void => {
  const target = join(root, path)
  mkdirSync(join(target, '..'), { recursive: true })
  writeFileSync(target, content, 'utf8')
}

/** Two packages, an import across them, an external dependency, and documentation that points at both. */
const fixture = (): string => {
  const root = mkdtempSync(join(tmpdir(), 'doc-bridge-incremental-'))
  temporary.push(root)
  writeFileSync(join(root, 'package.json'), JSON.stringify({ name: 'fixture', version: '0.0.0', dependencies: { zod: '^3.0.0' }, workspaces: ['packages/*'] }), 'utf8')
  write(root, 'src/index.ts', "export { search } from './query/search.js'\n")
  write(root, 'src/query/search.ts', "import { rank } from '../ranking/bm25.js'\nimport { z } from 'zod'\nexport const search = (): number => rank() + Number(Boolean(z))\n")
  write(root, 'src/ranking/bm25.ts', 'export const rank = (): number => 2\n')
  write(root, 'packages/tool/package.json', JSON.stringify({ name: '@fixture/tool', version: '0.0.0' }), 'utf8')
  write(root, 'packages/tool/src/run.ts', 'export const run = (): number => 3\n')
  write(root, 'docs/query.md', '# Query\n\nThe `search` entry point lives in `src/query/search.ts` and reads [ranking](../src/ranking/bm25.ts).\n')
  write(root, 'docs/overview.md', '# Overview\n\nSee [query](./query.md) and the `rank` helper.\n')
  return root
}

const entity = (snapshot: DiscoverySnapshotV1, id: string): KnowledgeEntity => {
  const found = snapshot.entities.find((item) => item.id === id)
  if (!found) throw new Error(`no entity ${id} in ${snapshot.entities.map((item) => item.id).join(', ')}`)
  return found
}

const hashes = (snapshot: DiscoverySnapshotV1): Record<string, string | undefined> =>
  Object.fromEntries(snapshot.entities.map((item) => [item.id, item.evidence[0]?.contentHash]))

const reuseEntry = (snapshot: DiscoverySnapshotV1) => snapshot.coverage.find((entry) => entry.scope === 'reused-entities')

/**
 * Everything a reused run has to reproduce exactly.
 *
 * The reuse entry itself is excluded: it describes the run rather than the repository, and it is
 * the only part of the snapshot allowed to differ between a cold scan and a fast one.
 */
const repositoryFacts = (snapshot: DiscoverySnapshotV1) => ({
  entities: snapshot.entities,
  relations: snapshot.relations,
  coverage: snapshot.coverage.filter((entry) => entry.scope !== 'reused-entities'),
  sourceRevision: snapshot.sourceRevision,
  sourceRevisionKind: snapshot.sourceRevisionKind,
})

describe('per-entity content hashes', () => {
  it('hashes every file-backed entity and nothing else', () => {
    const snapshot = discoverRepository({ root: fixture() })

    for (const item of snapshot.entities) {
      const hash = item.evidence[0]?.contentHash
      if (item.kind === 'module' || item.kind === 'document' || item.kind === 'package') {
        expect(hash, `${item.id} should carry a hash`).toMatch(/^[0-9a-f]{64}$/)
      } else {
        expect(hash, `${item.id} should carry no hash`).toBeUndefined()
      }
    }

    expect(snapshot.entities.some((item) => item.kind === 'external')).toBe(true)
    expect(snapshot.entities.filter((item) => item.kind === 'module').length).toBeGreaterThan(2)
    expect(snapshot.entities.filter((item) => item.kind === 'document')).toHaveLength(2)
  })

  it('hashes a module by its content and a document by its content without the byte-order mark', () => {
    const root = fixture()
    const snapshot = discoverRepository({ root })

    expect(entity(snapshot, 'module:src/ranking/bm25.ts').evidence[0]?.contentHash).toBe(fileContentHash('export const rank = (): number => 2\n'))
    expect(entity(snapshot, 'document:docs/overview.md').evidence[0]?.contentHash).toBe(
      markdownContentHash('# Overview\n\nSee [query](./query.md) and the `rank` helper.\n'),
    )
    // A mark is not content: a file that only gained one is still the same document.
    expect(markdownContentHash('﻿# Overview\n')).toBe(markdownContentHash('# Overview\n'))
  })

  it('keeps snapshot contentHash and sourceRevision semantics', () => {
    const root = fixture()
    const cold = discoverRepository({ root })
    const reused = discoverRepository({ root, previous: cold })

    for (const snapshot of [cold, reused]) {
      const { contentHash, ...rest } = snapshot
      expect(contentHash).toBe(contentHashForArtifactV1({ ...rest, contentHash }))
    }
    expect(reused.sourceRevision).toBe(cold.sourceRevision)
    expect(reused.sourceRevisionKind).toBe(cold.sourceRevisionKind)
  })
})

describe('reuse over an unchanged tree', () => {
  it('reproduces the repository exactly and reuses every reusable entity', () => {
    const root = fixture()
    const cold = discoverRepository({ root })
    const reused = discoverRepository({ root, previous: cold })

    expect(repositoryFacts(reused)).toEqual(repositoryFacts(cold))

    const reusable = cold.entities.filter((item) => item.kind === 'module' || item.kind === 'document').length
    const entry = reuseEntry(reused)
    expect(entry?.status).toBe('complete')
    expect(entry?.reason).toContain(`Reused ${reusable} entities`)
    expect(entry?.reason).toContain('Nothing needed re-parsing.')
  })

  it('parses nothing at all on the second run', () => {
    const root = fixture()
    const cold = discoverRepository({ root })
    expect(parses.files.length).toBeGreaterThan(0)

    parses.files.length = 0
    discoverRepository({ root, previous: cold })
    expect(parses.files).toEqual([])
  })

  it('reports no reuse when there is no previous snapshot', () => {
    const root = fixture()
    const cold = discoverRepository({ root })
    const entry = reuseEntry(cold)

    expect(entry?.status).toBe('not-applicable')
    expect(entry?.reason).toMatch(/^No previous snapshot was reused; parsed \d+ file\(s\)\.$/)
  })

  it('refuses a previous snapshot from another pipeline, analyzer set or configuration', () => {
    const root = fixture()
    const cold = discoverRepository({ root })

    const cases: readonly [string, DiscoverySnapshotV1][] = [
      ['pipeline', { ...cold, pipelineVersion: '1.4.0' }],
      ['analyzer', { ...cold, analyzerVersions: { ...cold.analyzerVersions, markdown: '0.9.0' } }],
      ['configuration', { ...cold, configurationHash: 'a'.repeat(64) }],
    ]
    for (const [label, previous] of cases) {
      const scan = discoverRepository({ root, previous })
      expect(repositoryFacts(scan), label).toEqual(repositoryFacts(cold))
      expect(reuseEntry(scan)?.reason, label).toMatch(/^Reused 0 entities and skipped 0 of \d+ parse\(s\)\..* Reuse refused: /)
      expect(parses.files.length, label).toBeGreaterThan(0)
      parses.files.length = 0
    }

    // A snapshot that does not say what produced it is not trusted with a repository scan.
    const assembled = discoverRepository({ root, previous: { entities: cold.entities, relations: cold.relations, coverage: cold.coverage } })
    expect(repositoryFacts(assembled)).toEqual(repositoryFacts(cold))
    expect(reuseEntry(assembled)?.reason).toContain('Reuse refused: the previous snapshot does not declare the pipeline, analyzers and configuration it was produced by.')
  })
})

describe('invalidation', () => {
  it('re-parses exactly the changed module, counting parser invocations', () => {
    const root = fixture()
    const cold = discoverRepository({ root })
    // The body changes and the exported names do not, so nothing else resolves differently.
    write(root, 'src/ranking/bm25.ts', 'export const rank = (): number => 4\n')

    parses.files.length = 0
    const reused = discoverRepository({ root, previous: cold })

    expect([...new Set(parses.files.map((file) => toPosix(file.slice(root.length + 1))))]).toEqual(['src/ranking/bm25.ts'])
    expect(entity(reused, 'module:src/ranking/bm25.ts').metadata?.exports).toEqual(['rank'])
    expect(reuseEntry(reused)?.status).toBe('complete')
    expect(reuseEntry(reused)?.reason).toContain('Re-parsed: src/ranking/bm25.ts.')
    expect(repositoryFacts(reused)).toEqual(repositoryFacts(discoverRepository({ root })))
  })

  it('refuses document reuse when a module starts exporting a new name', () => {
    const root = fixture()
    const cold = discoverRepository({ root })
    write(root, 'src/ranking/bm25.ts', 'export const rank = (): number => 4\nexport const also = (): number => 5\n')

    const reused = discoverRepository({ root, previous: cold })
    expect(reuseEntry(reused)?.status).toBe('partial')
    expect(reuseEntry(reused)?.reason).toContain('Reuse refused: the set of documents, areas or exported symbols changed.')
    expect(reuseEntry(reused)?.reason).toContain('docs/overview.md, docs/query.md, src/ranking/bm25.ts')
    expect(repositoryFacts(reused)).toEqual(repositoryFacts(discoverRepository({ root })))
  })

  it('re-parses exactly the changed document and leaves the other documents alone', () => {
    const root = fixture()
    const cold = discoverRepository({ root })
    write(root, 'docs/overview.md', '# Overview\n\nSee [query](./query.md) only.\n')
    const reused = discoverRepository({ root, previous: cold })

    expect(reuseEntry(reused)?.reason).toContain('Re-parsed: docs/overview.md.')
    expect(entity(reused, 'document:docs/query.md')).toEqual(entity(cold, 'document:docs/query.md'))
    // The `rank` mention is gone, so its edge is gone; the link to the other document survives.
    expect(reused.relations.some((relation) => relation.from === 'document:docs/overview.md' && relation.to === 'module:src/ranking/bm25.ts')).toBe(false)
    expect(reused.relations.some((relation) => relation.from === 'document:docs/overview.md' && relation.to === 'document:docs/query.md')).toBe(true)
  })

  it('leaves the content hash of every untouched entity alone', () => {
    const root = fixture()
    const cold = discoverRepository({ root })
    write(root, 'src/ranking/bm25.ts', 'export const rank = (): number => 4\n')
    const reused = discoverRepository({ root, previous: cold })

    const before = hashes(cold)
    const after = hashes(reused)
    expect(after['module:src/ranking/bm25.ts']).not.toBe(before['module:src/ranking/bm25.ts'])
    for (const [id, hash] of Object.entries(before)) {
      if (id === 'module:src/ranking/bm25.ts') continue
      expect(after[id], `${id} changed`).toBe(hash)
    }
  })

  it('refuses relation reuse when the set of modules changed, and still matches a cold scan', () => {
    const root = fixture()
    const cold = discoverRepository({ root })
    write(root, 'src/ranking/tfidf.ts', "import { rank } from './bm25.js'\nexport const tfidf = (): number => rank()\n")

    const reused = discoverRepository({ root, previous: cold })
    expect(repositoryFacts(reused)).toEqual(repositoryFacts(discoverRepository({ root })))
    expect(reuseEntry(reused)?.status).toBe('partial')
    expect(reuseEntry(reused)?.reason).toContain('Reuse refused: the set of modules, packages or compiler options changed.')
  })

  it('survives a rename without corrupting the relations of untouched entities', () => {
    const root = fixture()
    const cold = discoverRepository({ root })
    renameSync(join(root, 'src/ranking/bm25.ts'), join(root, 'src/ranking/score.ts'))
    write(root, 'src/query/search.ts', "import { rank } from '../ranking/score.js'\nimport { z } from 'zod'\nexport const search = (): number => rank() + Number(Boolean(z))\n")

    const reused = discoverRepository({ root, previous: cold })
    const fresh = discoverRepository({ root })

    expect(repositoryFacts(reused)).toEqual(repositoryFacts(fresh))
    expect(reused.entities.some((item) => item.id === 'module:src/ranking/bm25.ts')).toBe(false)
    expect(reused.entities.some((item) => item.id === 'module:src/ranking/score.ts')).toBe(true)
    // The document mentioned the old path: it now resolves to nothing rather than to a ghost.
    expect(reused.relations.some((relation) => relation.to === 'module:src/ranking/bm25.ts')).toBe(false)
    expect(reused.relations.some((relation) => relation.from === 'module:src/query/search.ts' && relation.to === 'module:src/ranking/score.ts')).toBe(true)
  })

  it('refuses document reuse when a symbol moves to another module', () => {
    const root = fixture()
    const cold = discoverRepository({ root })
    // `rank` now lives in a module the documentation does not name, so every mention of it moves.
    write(root, 'src/ranking/bm25.ts', "export { rank } from './core.js'\n")
    write(root, 'src/ranking/core.ts', 'export const rank = (): number => 2\n')

    const reused = discoverRepository({ root, previous: cold })
    expect(repositoryFacts(reused)).toEqual(repositoryFacts(discoverRepository({ root })))
    expect(reused.relations.some((relation) => relation.from === 'document:docs/overview.md' && relation.to === 'module:src/ranking/core.ts')).toBe(true)
  })
})

describe('facts the aggregate coverage entries are derived from', () => {
  /**
   * A reused module contributes to `dynamic-imports` and `runtime-wiring` without being parsed, so
   * every fact those aggregates are built from has to survive in per-file coverage. A fact that
   * lived only in a local variable used to be lost, and the aggregate then disagreed with a cold
   * scan's while every entity and relation matched.
   */
  it('replays dynamic imports and runtime wiring, resolved or not', () => {
    const root = fixture()
    write(root, 'src/loaders.ts', [
      "const literal = require('./ranking/bm25.js')",
      "const dynamic = await import('./query/search.js')",
      'const opaque = await import(process.env.TARGET ?? "./query/search.js")',
      'export const loaded = (): number => Number(Boolean(literal && dynamic && opaque))',
    ].join('\n'))
    // Only a literal require: a dynamic load that resolved, and the one case that recorded evidence without a flag.
    write(root, 'src/legacy.ts', "const legacy = require('./ranking/bm25.js')\nexport const load = (): unknown => legacy\n")
    write(root, 'src/wiring.ts', [
      "import { rank } from './ranking/bm25.js'",
      'const local = () => 1',
      'export const app = { use: (value: unknown): unknown => value }',
      'app.use(rank)',
      'app.use(local)',
    ].join('\n'))

    const cold = discoverRepository({ root })
    const warm = discoverRepository({ root, previous: cold })

    expect(repositoryFacts(warm)).toEqual(repositoryFacts(cold))
    expect(cold.coverage.find((entry) => entry.scope === 'dynamic-imports:src/loaders.ts')?.status).toBe('not-analyzed')
    expect(cold.coverage.find((entry) => entry.scope === 'dynamic-imports:src/legacy.ts')?.status).toBe('complete')
    expect(cold.coverage.find((entry) => entry.scope === 'runtime-wiring:src/wiring.ts')?.status).toBe('complete')
    // The aggregates are the interesting part: they are derived, not copied.
    expect(warm.coverage.find((entry) => entry.scope === 'dynamic-imports')).toEqual(cold.coverage.find((entry) => entry.scope === 'dynamic-imports'))
    expect(warm.coverage.find((entry) => entry.scope === 'runtime-wiring')).toEqual(cold.coverage.find((entry) => entry.scope === 'runtime-wiring'))
  })
})

describe('the reuse primitives', () => {
  it('separates declared exports from forwarded ones', () => {
    const module = { metadata: { exports: ['a', 'b', 'c'], reexports: ['b'] } } as unknown as KnowledgeEntity
    expect(declaredExportsOf(module)).toEqual(['a', 'c'])
    expect(exportsOf(module)).toEqual(['a', 'b', 'c'])
    expect(declaredExportsOf({} as KnowledgeEntity)).toEqual([])
  })

  it('reacts to the module universe and to nothing else', () => {
    const base = { modulePaths: ['a.ts', 'b.ts'], packages: [{ id: 'package:.', path: '.', name: 'fixture' }], compilerOptions: { strict: true } }
    expect(moduleUniverseFingerprint(base)).toBe(moduleUniverseFingerprint({ ...base, modulePaths: ['b.ts', 'a.ts'] }))
    expect(moduleUniverseFingerprint(base)).not.toBe(moduleUniverseFingerprint({ ...base, modulePaths: ['a.ts'] }))
    expect(moduleUniverseFingerprint(base)).not.toBe(moduleUniverseFingerprint({ ...base, compilerOptions: { strict: false } }))
    expect(moduleUniverseFingerprint(base)).not.toBe(moduleUniverseFingerprint({ ...base, packages: [{ id: 'package:.', path: '.', name: 'renamed' }] }))
  })

  it('reacts to where a symbol is declared', () => {
    const base = { moduleUniverse: 'u', documentPaths: ['docs/a.md'], areaPaths: ['src'], symbols: new Map([['rank', ['module:a.ts']]]) }
    expect(resolutionFingerprint(base)).toBe(resolutionFingerprint({ ...base, symbols: new Map([['rank', ['module:a.ts']]]) }))
    expect(resolutionFingerprint(base)).not.toBe(resolutionFingerprint({ ...base, symbols: new Map([['rank', ['module:b.ts']]]) }))
    expect(resolutionFingerprint(base)).not.toBe(resolutionFingerprint({ ...base, areaPaths: ['src', 'src/query'] }))
    expect(resolutionFingerprint(base)).not.toBe(resolutionFingerprint({ ...base, documentPaths: [] }))
  })

  it('drops a relation whose internal target is gone and keeps an external one', () => {
    const relation = (to: string) => ({ id: `r:${to}`, kind: 'imports' as const, from: 'module:a.ts', to, provenance: 'observed' as const, evidence: [{ source: 'code' as const, path: 'a.ts' }] })
    const result = replayableRelations(
      [relation('module:b.ts'), relation('module:gone.ts'), relation('external:zod')],
      (id) => id === 'module:b.ts',
    )

    expect(result.relations.map((item) => item.to)).toEqual(['module:b.ts', 'external:zod'])
    expect(result.missingEndpoints).toEqual(['external:zod'])
    expect(result.dropped.map((item) => item.to)).toEqual(['module:gone.ts'])
  })

  it('derives the fingerprints of a previous snapshot instead of trusting stored ones', () => {
    const root = fixture()
    const snapshot = discoverRepository({ root })
    const prior = indexPriorSnapshot(snapshot, { strict: true })

    expect(prior.modules.get('src/ranking/bm25.ts')?.contentHash).toBe(entity(snapshot, 'module:src/ranking/bm25.ts').evidence[0]?.contentHash)
    expect(prior.documents.get('docs/query.md')?.outgoing.length).toBeGreaterThan(0)
    expect(prior.moduleUniverse).toMatch(/^[0-9a-f]{64}$/)
    expect(prior.resolution).not.toBe(prior.moduleUniverse)
    // Per-file coverage follows its file, whatever the detail appended to the scope.
    expect(indexPriorSnapshot({
      entities: [{ id: 'document:docs/a.md', kind: 'document', name: 'a.md', path: 'docs/a.md', provenance: 'observed', evidence: [{ source: 'documentation', path: 'docs/a.md', contentHash: 'f'.repeat(64) }] }],
      relations: [],
      coverage: [{ analyzer: 'markdown', scope: 'mentions-symbol:docs/a.md:Foo', status: 'partial' }],
    }, {}).documents.get('docs/a.md')?.coverage).toHaveLength(1)
  })

  it('reports an empty ledger as not-applicable', () => {
    expect(reuseCoverage(emptyLedger()).status).toBe('not-applicable')
    const ledger = emptyLedger()
    ledger.reusedEntities = 1
    ledger.skippedFiles.push('a.ts')
    expect(reuseCoverage(ledger).reason).toContain('Reused 1 entity and skipped 1 of 1 parse(s).')
  })
})
