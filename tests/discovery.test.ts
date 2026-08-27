import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import type { DocBridgeConfigV1 } from '../src/config/schema.js'
import { discoverRepository } from '../src/discovery/repository.js'

const fixture = (): string => {
  const root = mkdtempSync(join(tmpdir(), 'doc-bridge-discovery-'))
  mkdirSync(join(root, 'packages', 'app', 'src'), { recursive: true })
  mkdirSync(join(root, 'docs'), { recursive: true })
  writeFileSync(
    join(root, 'package.json'),
    JSON.stringify({
      name: 'fixture-root',
      workspaces: ['packages/*'],
      dependencies: { 'external-lib': '^1.0.0' },
    }),
  )
  writeFileSync(join(root, 'packages', 'app', 'package.json'), JSON.stringify({ name: '@fixture/app', dependencies: { 'external-lib': '^1.0.0' } }))
  writeFileSync(join(root, 'packages', 'app', 'src', 'index.ts'), "import { helper } from './helper.js'\nimport { helper as helper2 } from './helper.js'\nexport { helper } from './helper.js'\nexport const app = helper + helper2\n")
  writeFileSync(join(root, 'packages', 'app', 'src', 'helper.ts'), "export const helper = 1\n")
  writeFileSync(join(root, 'packages', 'app', 'src', 'dynamic.ts'), "export const value = import(variable)\n")
  writeFileSync(join(root, 'src-alias.ts'), "import { helper } from '@app/helper'\nexport const aliased = helper\n")
  writeFileSync(join(root, 'tsconfig.json'), JSON.stringify({ compilerOptions: { baseUrl: '.', paths: { '@app/*': ['packages/app/src/*'] } } }))
  writeFileSync(join(root, 'docs', 'architecture.md'), '# Architecture\n')
  return root
}

describe('repository discovery', () => {
  it('discovers packages, modules, documents and static relations without config', () => {
    const snapshot = discoverRepository({ root: fixture() })
    const entityIds = snapshot.entities.map((entity) => entity.id)
    const relationKinds = snapshot.relations.map((relation) => relation.kind)

    expect(entityIds).toContain('package:fixture-root')
    expect(entityIds).toContain('package:@fixture/app')
    expect(entityIds).toContain('module:packages/app/src/index.ts')
    expect(entityIds).toContain('document:docs/architecture.md')
    expect(entityIds).toContain('external:external-lib')
    expect(relationKinds).toContain('contains')
    expect(relationKinds).toContain('imports')
    expect(relationKinds).toContain('re-exports')
    expect(relationKinds).toContain('depends-on')
    expect(snapshot.relations.some((relation) => relation.from === 'module:src-alias.ts' && relation.to === 'module:packages/app/src/helper.ts')).toBe(true)
    expect(snapshot.relations.find((relation) => relation.from === 'module:packages/app/src/index.ts' && relation.kind === 'imports')?.evidence).toHaveLength(2)
  })

  it('makes unsupported dynamic behavior explicit and remains deterministic', () => {
    const root = fixture()
    const first = discoverRepository({ root })
    const second = discoverRepository({ root })

    expect(first.contentHash).toBe(second.contentHash)
    expect(first.sourceRevisionKind).toBe('content')
    expect(first.coverage.some((entry) => entry.status === 'not-analyzed' && entry.scope.startsWith('dynamic-imports'))).toBe(true)
    expect(first.coverage.some((entry) => entry.scope === 'runtime-wiring')).toBe(true)
    expect(first.entities.find((entity) => entity.id === 'module:packages/app/src/dynamic.ts')?.metadata).toEqual({ exports: ['value'], test: false })

    writeFileSync(join(root, 'packages', 'app', 'src', 'helper.ts'), 'export const helper = 2\n')
    expect(discoverRepository({ root }).sourceRevision).not.toBe(first.sourceRevision)
  })

  it('rejects duplicate package identities', () => {
    const root = fixture()
    mkdirSync(join(root, 'packages', 'other'), { recursive: true })
    writeFileSync(join(root, 'packages', 'other', 'package.json'), JSON.stringify({ name: '@fixture/app' }))

    expect(() => discoverRepository({ root })).toThrow('Package identity collision')
  })

  it('covers JavaScript module forms, exports, unsupported runtime behavior and resolution fallbacks', () => {
    const root = mkdtempSync(join(tmpdir(), 'doc-bridge-discovery-edges-'))
    mkdirSync(join(root, 'packages', 'edge', 'src', 'dir'), { recursive: true })
    writeFileSync(join(root, 'package.json'), JSON.stringify({ name: 'edge-root', workspaces: { packages: ['packages/*'] }, packageManager: 'pnpm@10.0.0', dependencies: { '@fixture/edge': '^1.0.0', 'root-runtime': '^1.0.0' }, devDependencies: { 'dev-runtime': '^1.0.0' }, peerDependencies: { 'peer-runtime': '^1.0.0' }, optionalDependencies: { 'optional-runtime': '^1.0.0' } }))
    writeFileSync(join(root, 'packages', 'edge', 'package.json'), JSON.stringify({ name: '@fixture/edge' }))

    for (const extension of ['js', 'jsx', 'mjs', 'cjs', 'tsx', 'mts', 'cts']) {
      writeFileSync(join(root, 'packages', 'edge', 'src', `form.${extension}`), 'export const form = 1\n')
    }
    writeFileSync(join(root, 'packages', 'edge', 'src', 'dir', 'index.ts'), 'export const directory = 1\n')
    writeFileSync(join(root, 'packages', 'edge', 'src', 'exports.ts'), 'export class EdgeClass {}\nexport function edgeFunction() {}\nexport interface EdgeInterface {}\nexport type EdgeType = string\nexport enum EdgeEnum { A }\nexport namespace EdgeNamespace {}\nexport const first = 1, second = 2\nexport default first\n')
    writeFileSync(join(root, 'packages', 'edge', 'src', 'star.ts'), "export * from './dir'\n")
    writeFileSync(join(root, 'packages', 'edge', 'src', 'imports.ts'), "import edge = require('@fixture/edge')\nconst literal = require('unlisted-runtime')\nconst dynamic = require(runtimeName)\nconst lazy = import(runtimeName)\nimport './dir'\nimport './missing'\nmodule.register()\nexport { edge, literal, dynamic, lazy }\n")

    const snapshot = discoverRepository({ root })
    const exports = snapshot.entities.find((entity) => entity.id === 'module:packages/edge/src/exports.ts')?.metadata
    const scopes = snapshot.coverage.map((entry) => entry.scope)

    expect(exports).toEqual({ exports: ['EdgeClass', 'EdgeEnum', 'EdgeInterface', 'EdgeNamespace', 'EdgeType', 'default', 'edgeFunction', 'first', 'second'], test: false })
    expect(snapshot.entities.map((entity) => entity.id)).toContain('external:unlisted-runtime')
    expect(snapshot.relations).toContainEqual(expect.objectContaining({ from: 'module:packages/edge/src/imports.ts', to: 'module:packages/edge/src/dir/index.ts', kind: 'imports' }))
    expect(snapshot.relations).toContainEqual(expect.objectContaining({ from: 'module:packages/edge/src/imports.ts', to: 'package:@fixture/edge', kind: 'imports' }))
    expect(scopes).toContain('dynamic-imports:packages/edge/src/imports.ts')
    expect(scopes).toContain('runtime-wiring:packages/edge/src/imports.ts')
    expect(snapshot.coverage.find((entry) => entry.scope === 'package-manager')?.status).toBe('complete')
  })

  it('uses configured package patterns and reports malformed manifests and compiler configuration', () => {
    const root = mkdtempSync(join(tmpdir(), 'doc-bridge-discovery-config-'))
    mkdirSync(join(root, 'modules', 'named'), { recursive: true })
    mkdirSync(join(root, 'modules', 'invalid'), { recursive: true })
    writeFileSync(join(root, 'package.json'), JSON.stringify({ name: 'configured-root' }))
    writeFileSync(join(root, 'modules', 'named', 'package.json'), '{}')
    writeFileSync(join(root, 'modules', 'invalid', 'package.json'), '[')
    writeFileSync(join(root, 'tsconfig.json'), '{')
    writeFileSync(join(root, 'modules', 'named', 'index.ts'), 'export const named = true\n')

    const config = { routing: { options: { packages: ['modules/*'] } } } as DocBridgeConfigV1
    const snapshot = discoverRepository({ root, config })

    expect(snapshot.entities.map((entity) => entity.id)).toContain('package:modules/named')
    expect(snapshot.coverage.find((entry) => entry.scope === 'workspace-packages')).toMatchObject({ status: 'partial' })
    expect(snapshot.coverage.find((entry) => entry.scope === 'static-imports-and-exports')).toMatchObject({ status: 'partial' })
    expect(snapshot.configurationHash).not.toBe(discoverRepository({ root }).configurationHash)
  })

  it('reads pnpm workspace metadata and marks missing project metadata as partial', () => {
    const root = mkdtempSync(join(tmpdir(), 'doc-bridge-discovery-pnpm-'))
    mkdirSync(join(root, 'packages', 'yaml'), { recursive: true })
    writeFileSync(join(root, 'package.json'), JSON.stringify({ name: 'yaml-root' }))
    writeFileSync(join(root, 'pnpm-workspace.yaml'), 'packages:\n  - "packages/*"\n  # keep scanning\ncatalog:\n  shared: 1\n')
    writeFileSync(join(root, 'packages', 'yaml', 'package.json'), JSON.stringify({ name: '@fixture/yaml' }))

    const snapshot = discoverRepository({ root })
    expect(snapshot.entities.map((entity) => entity.id)).toContain('package:@fixture/yaml')
    expect(snapshot.coverage.find((entry) => entry.scope === 'package-manager')?.status).toBe('complete')

    const emptyRoot = mkdtempSync(join(tmpdir(), 'doc-bridge-discovery-empty-'))
    mkdirSync(join(emptyRoot, 'src'), { recursive: true })
    writeFileSync(join(emptyRoot, 'package.json'), '{')
    writeFileSync(join(emptyRoot, 'tsconfig.json'), '{')
    writeFileSync(join(emptyRoot, 'src', 'index.ts'), 'import "external"\n')
    const partial = discoverRepository({ root: emptyRoot })
    expect(partial.coverage.find((entry) => entry.scope === 'package-manager')).toMatchObject({ status: 'partial' })
    expect(partial.coverage.find((entry) => entry.scope === 'static-imports-and-exports')).toMatchObject({ status: 'partial' })
  })
})
