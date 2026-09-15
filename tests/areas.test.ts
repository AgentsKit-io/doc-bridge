import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, describe, expect, it } from 'vitest'

import { applyConfigDefaults } from '../src/config/defaults.js'
import { DocBridgeConfigV1Schema, type DocBridgeConfigV1 } from '../src/config/schema.js'
import {
  DEFAULT_AREA_DEPTH,
  conventionalAreaPath,
  deriveAreas,
  unobservedOwnershipPaths,
} from '../src/discovery/areas.js'
import { applyDocumentationDeclarations } from '../src/discovery/documentation.js'
import { discoverRepository } from '../src/discovery/repository.js'
import { reconcileKnowledge } from '../src/reconciliation/reconcile.js'
import { auditDocumentation } from '../src/audit/documentation.js'
import type { DiscoverySnapshotV1 } from '../src/schemas/knowledge.js'

const temporary: string[] = []

afterEach(() => {
  for (const directory of temporary) rmSync(directory, { recursive: true, force: true })
  temporary.length = 0
})

const write = (root: string, path: string, content: string): void => {
  const target = join(root, path)
  mkdirSync(join(target, '..'), { recursive: true })
  writeFileSync(target, content, 'utf8')
}

const config = (overrides: Record<string, unknown> = {}): DocBridgeConfigV1 =>
  applyConfigDefaults(
    DocBridgeConfigV1Schema.parse({
      schemaVersion: 1,
      corpus: { agent: { root: 'docs/for-agents', index: 'docs/for-agents/INDEX.md' } },
      routing: {
        options: {
          ownership: {
            'fixture-query': { path: 'src/query', purpose: 'Query', checks: ['npm test'], agentDoc: 'docs/for-agents/query.md' },
            'fixture-missing': { path: 'src/nowhere', purpose: 'Typo', checks: ['npm test'] },
          },
        },
      },
      ...overrides,
    }),
  )

/** One package, two areas, and an import that crosses between them. */
const singlePackage = (): string => {
  const root = mkdtempSync(join(tmpdir(), 'doc-bridge-areas-'))
  temporary.push(root)
  writeFileSync(join(root, 'package.json'), JSON.stringify({ name: 'fixture', version: '0.0.0' }), 'utf8')
  write(root, 'src/index.ts', "export { search } from './query/search.js'\n")
  write(root, 'src/query/search.ts', "import { rank } from '../ranking/bm25.js'\nexport const search = (): number => rank()\n")
  write(root, 'src/query/parse.ts', 'export const parse = (): number => 1\n')
  write(root, 'src/ranking/bm25.ts', 'export const rank = (): number => 2\n')
  write(root, 'scripts/release.mjs', 'export const release = () => 3\n')
  write(
    root,
    'docs/for-agents/query.md',
    ['---', 'type: module', 'id: fixture-query', 'editRoot: src/query', 'humanDoc: /docs/query', '---', '', '# Query', '', 'Owns parsing and ranking entry points.'].join('\n'),
  )
  write(root, 'docs/for-agents/INDEX.md', '# Agent docs\n\nStart here.\n')
  write(root, 'docs/architecture.md', '# Architecture\n\nRanking lives in `src/ranking`.\n')
  return root
}

/** Two packages, so package scope still has something to aggregate to. */
const multiPackage = (): string => {
  const root = mkdtempSync(join(tmpdir(), 'doc-bridge-areas-multi-'))
  temporary.push(root)
  writeFileSync(join(root, 'package.json'), JSON.stringify({ name: 'root', workspaces: ['packages/*'] }), 'utf8')
  write(root, 'packages/app/package.json', JSON.stringify({ name: '@fixture/app', dependencies: { '@fixture/core': '1.0.0' } }))
  write(root, 'packages/app/src/routes/home.ts', "import { value } from '@fixture/core'\nexport const home = (): number => value\n")
  write(root, 'packages/core/package.json', JSON.stringify({ name: '@fixture/core' }))
  write(root, 'packages/core/src/index.ts', 'export const value = 1\n')
  write(root, 'docs/for-agents/INDEX.md', '# Agent docs\n')
  return root
}

const declaredSnapshot = (root: string, snapshot: DiscoverySnapshotV1, settings: DocBridgeConfigV1): DiscoverySnapshotV1 =>
  applyDocumentationDeclarations(
    snapshot,
    snapshot.entities
      .filter((entity) => entity.kind === 'document' && entity.path)
      .map((entity) => ({ path: entity.path as string, content: readDocument(root, entity.path as string) })),
    { agentRoot: settings.corpus.agent.root },
  ).snapshot

const readDocument = (root: string, path: string): string => readFileSync(join(root, path), 'utf8')

describe('area derivation', () => {
  it('takes the level below a source root, and nothing for a module sitting in one', () => {
    const module = { moduleId: 'module:src/query/search.ts', path: 'src/query/search.ts', packageId: 'package:fixture', packagePath: '.' }
    expect(conventionalAreaPath(module)).toBe('src/query')
    expect(conventionalAreaPath({ ...module, path: 'src/index.ts' })).toBeUndefined()
    expect(conventionalAreaPath({ ...module, path: 'scripts/release.mjs' })).toBe('scripts')
    expect(conventionalAreaPath({ ...module, path: 'src/query/nested/deep.ts' })).toBe('src/query')
    expect(conventionalAreaPath({ ...module, path: 'src/query/nested/deep.ts' }, 2)).toBe('src/query/nested')
    expect(DEFAULT_AREA_DEPTH).toBe(1)

    const scoped = { moduleId: 'm', path: 'packages/app/src/routes/home.ts', packageId: 'package:@fixture/app', packagePath: 'packages/app' }
    expect(conventionalAreaPath(scoped)).toBe('packages/app/src/routes')
  })

  it('assigns each module to the most specific area and records the parent', () => {
    const modules = [
      { moduleId: 'module:src/index.ts', path: 'src/index.ts', packageId: 'package:fixture', packagePath: '.' },
      { moduleId: 'module:src/query/search.ts', path: 'src/query/search.ts', packageId: 'package:fixture', packagePath: '.' },
    ]
    const areas = deriveAreas({ modules, ownership: [{ id: 'root', path: 'src' }] })

    expect(areas.map((area) => area.path)).toEqual(['src', 'src/query'])
    expect(areas[0]).toMatchObject({ id: 'area:src', moduleIds: ['module:src/index.ts'], ownershipId: 'root' })
    expect(areas[0]?.parentId).toBeUndefined()
    expect(areas[1]).toMatchObject({ id: 'area:src/query', parentId: 'area:src', moduleIds: ['module:src/query/search.ts'] })
  })

  it('ignores an ownership path that holds no code, and reports one that holds nothing at all', () => {
    const modules = [{ moduleId: 'module:src/query/search.ts', path: 'src/query/search.ts', packageId: 'package:fixture', packagePath: '.' }]
    expect(deriveAreas({ modules, ownership: [{ id: 'docs', path: 'docs' }] }).map((area) => area.path)).toEqual(['src/query'])

    const ownership = [{ id: 'good', path: 'src/query' }, { id: 'bad', path: 'src/nowhere' }]
    expect(unobservedOwnershipPaths(ownership, ['src/query/search.ts', 'docs/guide.md'])).toEqual([
      { id: 'bad', path: 'src/nowhere' },
    ])
  })
})

describe('areas in the snapshot', () => {
  it('adds area entities with containment from their package and to their modules', () => {
    const root = singlePackage()
    const snapshot = discoverRepository({ root, config: config() })
    const areas = snapshot.entities.filter((entity) => entity.kind === 'area')

    expect(areas.map((entity) => entity.id)).toEqual(['area:scripts', 'area:src/query', 'area:src/ranking'])
    expect(areas.find((entity) => entity.id === 'area:src/query')).toMatchObject({
      kind: 'area',
      name: 'query',
      path: 'src/query',
      provenance: 'observed',
      metadata: { moduleCount: 2, ownershipId: 'fixture-query' },
    })
    expect(areas.find((entity) => entity.id === 'area:src/query')?.evidence[0]).toMatchObject({
      source: 'derived',
      path: 'src/query',
    })

    const contains = snapshot.relations.filter((relation) => relation.kind === 'contains')
    expect(contains).toContainEqual(expect.objectContaining({ from: 'package:fixture', to: 'area:src/query' }))
    expect(contains).toContainEqual(expect.objectContaining({ from: 'area:src/query', to: 'module:src/query/search.ts' }))
    expect(contains).toContainEqual(expect.objectContaining({ from: 'area:src/query', to: 'module:src/query/parse.ts' }))
  })

  it('keeps the snapshot schema and stays deterministic', () => {
    const root = singlePackage()
    const first = discoverRepository({ root, config: config() })
    expect(first.schemaVersion).toBe(1)
    expect(first.contentHash).toBe(discoverRepository({ root, config: config() }).contentHash)
  })

  it('lets configuration change the derived areas without a code change', () => {
    const root = singlePackage()
    const deeper = discoverRepository({
      root,
      config: config({ analysis: { areas: { roots: [] } } }),
    })
    /*
     * With no source roots declared, the first level under the package is the area — `src` rather
     * than `src/query`. `src/query` survives because an ownership record names it: a declared
     * area does not depend on the convention.
     */
    expect(deeper.entities.filter((entity) => entity.kind === 'area').map((entity) => entity.id)).toEqual([
      'area:scripts',
      'area:src',
      'area:src/query',
    ])
    expect(deeper.entities.find((entity) => entity.id === 'area:src')?.metadata?.moduleCount).toBe(2)

    const twoDeep = discoverRepository({ root, config: config({ analysis: { areas: { depth: 2 } } }) })
    expect(twoDeep.entities.filter((entity) => entity.kind === 'area').map((entity) => entity.id)).toContain('area:src/query')
  })

  it('resolves a directory named in documentation to its area', () => {
    const root = singlePackage()
    const snapshot = discoverRepository({ root, config: config() })
    expect(snapshot.relations).toContainEqual(
      expect.objectContaining({ kind: 'mentions', from: 'document:docs/architecture.md', to: 'area:src/ranking' }),
    )
  })
})

describe('reconciliation at area scope', () => {
  it('finds undocumented relations a single package hides at package scope', () => {
    const root = singlePackage()
    const settings = config()
    const snapshot = discoverRepository({ root, config: settings })
    const declared = declaredSnapshot(root, snapshot, settings)
    const options = { requiredRelationKinds: ['imports', 're-exports'], requiredRelationTargets: 'internal' as const }

    const atPackage = reconcileKnowledge(snapshot, declared, { ...options, scope: 'package' })
    expect(atPackage.diagnostics.filter((item) => item.code === 'RELATION_UNDOCUMENTED')).toEqual([])

    const atArea = reconcileKnowledge(snapshot, declared, { ...options, scope: 'area' })
    const undocumented = atArea.diagnostics.filter((item) => item.code === 'RELATION_UNDOCUMENTED')
    expect(undocumented.length).toBeGreaterThan(0)
    expect(undocumented[0]?.evidence[0]).toMatchObject({ source: 'code', path: expect.stringContaining('src/') })
    expect(undocumented[0]?.evidence[0]?.lineStart).toBeGreaterThan(0)
  })

  it('leaves a multi-package repository on its package-scope behaviour', () => {
    const root = multiPackage()
    const settings = config()
    const snapshot = discoverRepository({ root, config: settings })
    const declared = declaredSnapshot(root, snapshot, settings)
    const report = reconcileKnowledge(snapshot, declared, {
      scope: 'package',
      requiredRelationKinds: ['imports', 'depends-on'],
      requiredRelationTargets: 'internal',
    })

    const aggregated = report.diagnostics.filter((item) => item.code === 'RELATION_UNDOCUMENTED')
    expect(aggregated.length).toBeGreaterThan(0)
    expect(snapshot.entities.filter((entity) => entity.kind === 'package')).toHaveLength(3)
  })

  it('reports an ownership path that matches nothing observed', () => {
    const root = singlePackage()
    const settings = config()
    const snapshot = discoverRepository({ root, config: settings })
    const declared = declaredSnapshot(root, snapshot, settings)
    const report = reconcileKnowledge(snapshot, declared, {
      ownership: [
        { id: 'fixture-query', path: 'src/query' },
        { id: 'fixture-missing', path: 'src/nowhere' },
      ],
      ownershipSource: 'doc-bridge.config.json',
    })

    const unobserved = report.diagnostics.filter((item) => item.code === 'OWNERSHIP_PATH_UNOBSERVED')
    expect(unobserved).toHaveLength(1)
    expect(unobserved[0]).toMatchObject({ status: 'stale-or-unverified', severity: 'warn' })
    expect(unobserved[0]?.message).toContain('src/nowhere')
    expect(unobserved[0]?.evidence[0]).toMatchObject({ source: 'configuration', path: 'doc-bridge.config.json' })

    // Without the records there is nothing to check, and nothing is claimed.
    expect(
      reconcileKnowledge(snapshot, declared, {}).diagnostics.filter((item) => item.code === 'OWNERSHIP_PATH_UNOBSERVED'),
    ).toEqual([])
  })
})

describe('documentation audit on a single package', () => {
  it('measures coverage against areas instead of an empty package list', () => {
    const root = singlePackage()
    const settings = config()
    const snapshot = discoverRepository({ root, config: settings })
    const declared = declaredSnapshot(root, snapshot, settings)
    const reconciliation = reconcileKnowledge(snapshot, declared, { includeOrphanedDocuments: true })
    const report = auditDocumentation({ root, snapshot, declared, reconciliation, declarationDiagnostics: [], config: {} })

    expect(report.metrics.coverageUnit).toBe('area')
    expect(report.metrics.packageCount).toBeGreaterThan(0)
    // The sidecar declares `id` + `editRoot`, which is a coverage declaration for that area.
    expect(report.metrics.coveredPackageCount).toBe(1)
    expect(report.findings.some((finding) => finding.code === 'AREA_DOCUMENTATION_MISSING')).toBe(true)
    expect(report.findings.some((finding) => finding.code === 'PACKAGE_DOCUMENTATION_MISSING')).toBe(false)
  })

  it('keeps counting packages when there is more than one', () => {
    const root = multiPackage()
    const settings = config()
    const snapshot = discoverRepository({ root, config: settings })
    const declared = declaredSnapshot(root, snapshot, settings)
    const reconciliation = reconcileKnowledge(snapshot, declared, {})
    const report = auditDocumentation({ root, snapshot, declared, reconciliation, declarationDiagnostics: [], config: {} })

    expect(report.metrics.coverageUnit).toBe('package')
    expect(report.findings.some((finding) => finding.code === 'PACKAGE_DOCUMENTATION_MISSING')).toBe(true)
  })
})
