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
  writeFileSync(join(root, 'packages', 'app', 'src', 'dynamic.ts'), "const helperSpecifier = './helper'\nconst composedSpecifier = './' + 'helper'\nexport const value = import(variable)\nexport const loaded = import('./helper')\nexport const loadedViaBinding = import(helperSpecifier)\nexport const loadedViaExpression = import(composedSpecifier)\nexport const requiredViaExpression = require(composedSpecifier)\n")
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
    expect(snapshot.entities.find((entity) => entity.id === 'document:docs/architecture.md')?.metadata).toEqual({ classification: 'human' })
    expect(entityIds).toContain('external:external-lib')
    expect(relationKinds).toContain('contains')
    expect(relationKinds).toContain('imports')
    expect(relationKinds).toContain('re-exports')
    expect(relationKinds).toContain('depends-on')
    expect(snapshot.relations.some((relation) => relation.from === 'module:src-alias.ts' && relation.to === 'module:packages/app/src/helper.ts')).toBe(true)
    expect(snapshot.relations.find((relation) => relation.from === 'module:packages/app/src/index.ts' && relation.kind === 'imports')?.evidence).toHaveLength(2)
  })

  it('keeps archived documentation out of the current human-doc classification', () => {
    const root = fixture()
    mkdirSync(join(root, 'docs-archive'), { recursive: true })
    writeFileSync(join(root, 'docs-archive', 'legacy.md'), '# Legacy\n')

    const document = discoverRepository({ root }).entities.find((entity) => entity.id === 'document:docs-archive/legacy.md')
    expect(document?.metadata).toEqual({ classification: 'archive' })
  })

  it('makes unsupported dynamic behavior explicit and remains deterministic', () => {
    const root = fixture()
    const first = discoverRepository({ root })
    const second = discoverRepository({ root })

    expect(first.contentHash).toBe(second.contentHash)
    expect(first.sourceRevisionKind).toBe('content')
    expect(first.coverage.some((entry) => entry.status === 'not-analyzed' && entry.scope.startsWith('dynamic-imports'))).toBe(true)
    expect(first.coverage.find((entry) => entry.scope === 'dynamic-imports')).toMatchObject({ status: 'partial' })
    expect(first.coverage.find((entry) => entry.scope === 'dynamic-imports')?.evidence).toEqual(expect.arrayContaining([
      expect.objectContaining({ path: 'packages/app/src/dynamic.ts', lineStart: 3, lineEnd: 3 }),
    ]))
    expect(first.coverage.find((entry) => entry.scope === 'dynamic-imports:packages/app/src/dynamic.ts')?.evidence).toEqual(expect.arrayContaining([
      expect.objectContaining({ path: 'packages/app/src/dynamic.ts', lineStart: 3, lineEnd: 3 }),
      expect.objectContaining({ path: 'packages/app/src/dynamic.ts', lineStart: 6, lineEnd: 6 }),
    ]))
    expect(first.relations).toContainEqual(expect.objectContaining({ from: 'module:packages/app/src/dynamic.ts', to: 'module:packages/app/src/helper.ts', kind: 'imports', metadata: { detection: 'dynamic-literal' } }))
    expect(first.coverage.some((entry) => entry.scope === 'runtime-wiring')).toBe(true)
    expect(first.entities.find((entity) => entity.id === 'module:packages/app/src/dynamic.ts')?.metadata).toEqual({ exports: ['loaded', 'loadedViaBinding', 'loadedViaExpression', 'requiredViaExpression', 'value'], test: false })
    expect(first.relations.filter((relation) => relation.from === 'module:packages/app/src/dynamic.ts' && relation.to === 'module:packages/app/src/helper.ts' && relation.kind === 'imports')).toHaveLength(1)
    expect(first.relations.find((relation) => relation.from === 'module:packages/app/src/dynamic.ts' && relation.to === 'module:packages/app/src/helper.ts' && relation.kind === 'imports')?.evidence).toHaveLength(4)

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
    writeFileSync(join(root, 'packages', 'edge', 'src', 'imports.ts'), "import edge = require('@fixture/edge')\nimport listenTarget = require('listen-runtime')\nconst literal = require('unlisted-runtime')\nconst dynamic = require(runtimeName)\nconst lazy = import(runtimeName)\nimport './dir'\nimport './missing'\nmodule.register(edge)\nmodule.register(unbound)\nmodule.listen(listenTarget)\nexport { edge, literal, dynamic, lazy }\n")
    writeFileSync(join(root, 'packages', 'edge', 'src', 'local-wiring.ts'), "const registry = { register(value: unknown) {} }\nexport class LocalDispatcher { run(value: unknown) { this.register(value) } register(value: unknown) {} }\nregistry.register('local')\n")
    writeFileSync(join(root, 'packages', 'edge', 'src', 'wiring.test.ts'), "import edge = require('@fixture/edge')\nmodule.register(edge)\n")

    const snapshot = discoverRepository({ root })
    const exports = snapshot.entities.find((entity) => entity.id === 'module:packages/edge/src/exports.ts')?.metadata
    const scopes = snapshot.coverage.map((entry) => entry.scope)

    expect(exports).toEqual({ exports: ['EdgeClass', 'EdgeEnum', 'EdgeInterface', 'EdgeNamespace', 'EdgeType', 'default', 'edgeFunction', 'first', 'second'], test: false })
    expect(snapshot.entities.map((entity) => entity.id)).toContain('external:unlisted-runtime')
    expect(snapshot.relations).toContainEqual(expect.objectContaining({ from: 'module:packages/edge/src/imports.ts', to: 'module:packages/edge/src/dir/index.ts', kind: 'imports' }))
    expect(snapshot.relations).toContainEqual(expect.objectContaining({ from: 'module:packages/edge/src/imports.ts', to: 'package:@fixture/edge', kind: 'imports' }))
    expect(snapshot.relations).toContainEqual(expect.objectContaining({ from: 'module:packages/edge/src/imports.ts', to: 'package:@fixture/edge', kind: 'runtime-wiring', metadata: { detection: 'runtime-wiring-static' } }))
    expect(snapshot.relations.some((relation) => relation.from === 'module:packages/edge/src/imports.ts' && relation.to === 'external:listen-runtime' && relation.kind === 'runtime-wiring')).toBe(false)
    expect(scopes).toContain('dynamic-imports:packages/edge/src/imports.ts')
    expect(scopes).toContain('runtime-wiring:packages/edge/src/imports.ts')
    expect(snapshot.coverage.find((entry) => entry.scope === 'package-manager')?.status).toBe('complete')

    const configured = discoverRepository({ root, config: { analysis: { jsTs: { runtimeWiringMethods: ['register'], runtimeWiringAdapters: [{ id: 'node-runtime', methods: ['listen'] }] } } } as DocBridgeConfigV1 })
    expect(configured.relations).toContainEqual(expect.objectContaining({ from: 'module:packages/edge/src/imports.ts', to: 'external:listen-runtime', kind: 'runtime-wiring', metadata: { detection: 'runtime-wiring-static' } }))

    expect(snapshot.coverage.some((entry) => entry.scope === 'runtime-wiring:packages/edge/src/wiring.test.ts')).toBe(false)
    expect(snapshot.coverage.some((entry) => entry.scope === 'runtime-wiring:packages/edge/src/local-wiring.ts')).toBe(false)
    const configuredTests = discoverRepository({ root, config: { analysis: { jsTs: { includeTestRuntimeWiring: true } } } as DocBridgeConfigV1 })
    expect(configuredTests.relations).toContainEqual(expect.objectContaining({ from: 'module:packages/edge/src/wiring.test.ts', to: 'package:@fixture/edge', kind: 'runtime-wiring', metadata: { detection: 'runtime-wiring-static' } }))
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

  it('marks dynamic loading and runtime wiring as not applicable when absent', () => {
    const root = mkdtempSync(join(tmpdir(), 'doc-bridge-discovery-no-dynamic-'))
    writeFileSync(join(root, 'package.json'), JSON.stringify({ name: 'static-root' }))
    writeFileSync(join(root, 'index.ts'), 'export const value = 1\n')

    const snapshot = discoverRepository({ root })

    expect(snapshot.coverage.find((entry) => entry.scope === 'dynamic-imports')).toMatchObject({ status: 'not-applicable' })
    expect(snapshot.coverage.find((entry) => entry.scope === 'runtime-wiring')).toMatchObject({ status: 'not-applicable' })
    expect(snapshot.coverage.every((entry) => entry.analyzerVersion)).toBe(true)
  })

  it('bounds dynamic-loading evidence at the schema limit', () => {
    const root = mkdtempSync(join(tmpdir(), 'doc-bridge-discovery-dynamic-limit-'))
    writeFileSync(join(root, 'package.json'), JSON.stringify({ name: 'dynamic-limit-root' }))
    writeFileSync(join(root, 'dynamic.ts'), Array.from({ length: 40 }, (_, index) => `export const value${index} = import(runtimeName${index})`).join('\n') + '\n')

    const snapshot = discoverRepository({ root })
    const coverage = snapshot.coverage.find((entry) => entry.scope === 'dynamic-imports:dynamic.ts')

    expect(coverage?.status).toBe('not-analyzed')
    expect(coverage?.evidence).toHaveLength(32)
  })

  it('honors configured repository file limits and ignores non-package workspace directories', () => {
    const root = mkdtempSync(join(tmpdir(), 'doc-bridge-discovery-limits-'))
    mkdirSync(join(root, 'packages', 'generated', 'dist'), { recursive: true })
    writeFileSync(join(root, 'package.json'), JSON.stringify({ name: 'limited-root' }))
    writeFileSync(join(root, 'pnpm-workspace.yaml'), 'packages:\n  - "packages/*"\n')
    writeFileSync(join(root, 'packages', 'generated', 'dist', 'index.js'), 'export {}\n')
    writeFileSync(join(root, 'src.ts'), 'export const value = 1\n')

    const snapshot = discoverRepository({ root, config: { safety: { maxFiles: 1 } } as DocBridgeConfigV1 })

    expect(snapshot.coverage.find((entry) => entry.scope === 'workspace-packages')).toMatchObject({ status: 'complete' })
    expect(snapshot.coverage.some((entry) => entry.reason?.includes('10000'))).toBe(false)
    expect(snapshot.coverage.some((entry) => entry.reason?.includes('1 file limit'))).toBe(true)
  })

  it('bounds long module and relation identities without losing determinism', () => {
    const root = mkdtempSync(join(tmpdir(), 'doc-bridge-discovery-long-'))
    const longDirectory = 'nested-' + 'x'.repeat(240)
    mkdirSync(join(root, 'src', longDirectory), { recursive: true })
    writeFileSync(join(root, 'package.json'), JSON.stringify({ name: 'long-root' }))
    writeFileSync(join(root, 'src', longDirectory, 'index.ts'), 'import external from "external"\nexport default external\n')

    const first = discoverRepository({ root })
    const second = discoverRepository({ root })

    expect(first.contentHash).toBe(second.contentHash)
    expect(first.entities.every((entity) => entity.id.length <= 256)).toBe(true)
    expect(first.relations.every((relation) => relation.id.length <= 256)).toBe(true)
  })
})
