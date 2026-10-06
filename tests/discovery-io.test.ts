import fs from 'node:fs'
import { join, relative, resolve } from 'node:path'
import { tmpdir } from 'node:os'
import * as ts from 'typescript'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { discoverRepository, discoverRepositoryWithRead } from '../src/discovery/repository.js'
import { safeWalkFiles } from '../src/safety/repository.js'
import { surfaceFactFromEntity, packageFactFromEntity, surfaceFactEntityId } from '../src/storage/facts.js'
import { contentRef } from '../src/storage/local.js'
import type { RepositoryReadV1 } from '../src/storage/contract.js'
import { createDiscoveryRegistryV2, type DiscoveryPluginV2 } from '../src/plugins/contract.js'
import { createJsTsPluginV2 } from '../src/discovery/plugins/js-ts.js'
import { createMarkdownPluginV2 } from '../src/discovery/plugins/markdown.js'

const roots: string[] = []
afterEach(() => { vi.restoreAllMocks(); for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true }) })
const fixture = () => {
  const root = fs.mkdtempSync(join(tmpdir(), 'doc-bridge-discovery-io-')); roots.push(root)
  fs.mkdirSync(join(root, 'src'))
  fs.writeFileSync(join(root, 'package.json'), '{"name":"doc-bridge","packageManager":"pnpm@10"}')
  fs.writeFileSync(join(root, 'base.json'), '{"compilerOptions":{"baseUrl":".","paths":{"@src/*":["src/*"]}}}')
  fs.writeFileSync(join(root, 'tsconfig.json'), '{"extends":"./base.json","include":["src/**/*"]}')
  fs.writeFileSync(join(root, 'src/a.ts'), 'export const Keep = 1\n')
  fs.writeFileSync(join(root, 'src/b.ts'), 'export {Keep} from "@src/a"\n')
  fs.writeFileSync(join(root, 'README.md'), '\ufeff# Guide\r\n`Keep` and [source](src/a.ts)\r\n')
  return root
}
const memory = (root: string, revision: string): RepositoryReadV1 => {
  const bytes = new Map(safeWalkFiles(root).files.map(path => [relative(root, path).split('\\').join('/'), fs.readFileSync(path)]))
  return {
    version: 1, partition: { repositoryId: 'doc-bridge', revision },
    limits: { maxFiles: 100_000, maxBytes: 512 * 1024 * 1024, maxFileBytes: 64 * 1024 * 1024, maxTimeMs: 60_000, maxMemoryMb: 2048 },
    async list() { return { status: 'ok', value: { entries: [...bytes].map(([path, value]) => ({ path, kind: 'file', bytes: value.length, content: contentRef(value) })), complete: true, visibilityPolicyHash: '0'.repeat(64) } } },
    async read(request) { const value = bytes.get(request.path); return value ? { status: 'ok', value: { bytes: value, content: contentRef(value) } } : { status: 'missing', code: 'NOT_FOUND' } },
    async stat(request) { const value = bytes.get(request.path); return value ? { status: 'ok', value: { path: request.path, kind: 'file', bytes: value.length, content: contentRef(value) } } : { status: 'missing', code: 'NOT_FOUND' } },
  }
}

const injected = async (...args: Parameters<typeof discoverRepositoryWithRead>) => (await discoverRepositoryWithRead(...args)).snapshot

describe('bounded discovery acquisition', () => {
  it('has byte-identical local/injected cold and warm snapshots without native reads', async () => {
    const root = fixture()
    const cold = discoverRepository({ root })
    const warm = discoverRepository({ root, previous: cold })
    const read = memory(root, cold.sourceRevision)
    for (const method of ['readFileSync', 'readdirSync', 'lstatSync', 'statSync', 'realpathSync'] as const) vi.spyOn(fs, method).mockImplementation(() => { throw new Error('NATIVE_FS_FORBIDDEN') })
    for (const method of ['fileExists', 'readFile', 'readDirectory', 'directoryExists', 'realpath'] as const) if (ts.sys[method]) vi.spyOn(ts.sys, method).mockImplementation(() => { throw new Error('TS_SYS_FORBIDDEN') })
    expect(JSON.stringify(await injected(read, { root }))).toBe(JSON.stringify(cold))
    expect(JSON.stringify(await injected(read, { root, previous: cold }))).toBe(JSON.stringify(warm))
  })

  it('runs both built-in v2 plugins through strict output validation', async () => {
    const root = fixture()
    const read = memory(root, 'fixture-revision')
    const source = createJsTsPluginV2()
    const markdown = createMarkdownPluginV2()
    const registry = createDiscoveryRegistryV2({ builtIns: [{ plugin: source, analyzerVersions: { 'js-ts': source.manifest.version } }, { plugin: markdown, analyzerVersions: { markdown: markdown.manifest.version } }] })
    registry.register(source); registry.register(markdown)
    const input = { read, signal: new AbortController().signal, configuration: {}, resolution: { entities: [], relations: [] } }
    const extracted = await registry.discover('js-ts', input)
    expect(extracted.entities.some(entity => entity.id === 'module:src/a.ts')).toBe(true)
    expect(extracted.facts).toEqual([])
    const documents = await registry.discover('markdown', { ...input, resolution: { entities: extracted.entities, relations: extracted.relations } })
    expect(documents.entities.some(entity => entity.id === 'document:README.md')).toBe(true)
    expect(documents.relations.some(relation => relation.kind === 'mentions-symbol')).toBe(true)
  })

  it('keeps partition-external compiler configuration unsupported', async () => {
    const root = fixture()
    fs.writeFileSync(join(root, 'tsconfig.json'), '{"extends":"../outside.json"}')
    const result = await injected(memory(root, 'bounded'), { root })
    expect(result.coverage.find(entry => entry.scope === 'static-imports-and-exports')?.status).toBe('partial')
  })
  it('seals caller-registered source output without language changes in core', async () => {
    const root = fixture()
    fs.writeFileSync(join(root, 'main.toy'), 'Keep')
    const read = memory(root, 'generic')
    const template = createJsTsPluginV2().manifest
    const plugin: DiscoveryPluginV2 = {
      manifest: { ...template, id: 'toy', languages: ['toy'], inputPatterns: ['**/*.toy', 'package.json'], capabilities: ['manifest', 'symbols'] },
      async discover(input) {
        const result = await input.read.read({ partition: input.read.partition, signal: input.signal, path: 'main.toy' })
        if (result.status !== 'ok') throw new Error(result.code)
        const manifest = await input.read.read({ partition: input.read.partition, signal: input.signal, path: 'package.json' })
        if (manifest.status !== 'ok') throw new Error(manifest.code)
        const evidence = [{ source: 'code', path: 'main.toy', lineStart: 1, contentHash: result.value.content.hash }]
        const packageEvidence = [{ source: 'configuration', path: 'package.json', contentHash: manifest.value.content.hash }]
        return {
          entities: [{ id: 'module:main.toy', kind: 'module', name: 'main', path: 'main.toy', provenance: 'observed', evidence, metadata: { exports: ['Keep'] } }, { id: 'package:doc-bridge', kind: 'package', name: 'doc-bridge', provenance: 'observed', evidence: packageEvidence, metadata: { fixture: true } }],
          relations: [],
          facts: [{ kind: 'symbol', id: surfaceFactEntityId('symbol', 'module:main.toy', 'Keep'), ownerId: 'module:main.toy', name: 'Keep', valueHash: result.value.content.hash, evidence }],
          packages: [{ id: 'package:doc-bridge', purl: 'pkg:generic/doc-bridge', dependencies: [], evidence: packageEvidence }],
          diagnostics: [], coverage: [{ analyzer: 'toy', scope: 'symbols', status: 'complete' }, { analyzer: 'toy', scope: 'manifest', status: 'complete' }],
        }
      },
    }
    const snapshot = await injected(read, { root, plugins: [plugin], replaceSourcePlugins: true })
    expect(snapshot.entities.some(entity => entity.id === 'module:main.toy')).toBe(true)
    expect(snapshot.entities.some(entity => entity.id === 'module:src/a.ts')).toBe(false)
    expect(snapshot.relations.some(relation => relation.kind === 'mentions-symbol' && relation.to === 'module:main.toy')).toBe(true)
    expect(snapshot.analyzerVersions.toy).toBe(template.version)
    const fact = snapshot.entities.find(entity => entity.id === surfaceFactEntityId('symbol', 'module:main.toy', 'Keep'))!
    expect(surfaceFactFromEntity(fact)).toMatchObject({ ownerId: 'module:main.toy', name: 'Keep' })
    const pkg = snapshot.entities.find(entity => entity.id === 'package:doc-bridge')!
    expect(packageFactFromEntity(pkg)).toMatchObject({ purl: 'pkg:generic/doc-bridge', dependencies: [] })
    expect(pkg.metadata?.fixture).toBe(true)
    expect(snapshot.relations.filter(relation => relation.kind === 'mentions-symbol' && relation.metadata?.symbol === 'Keep')).toHaveLength(1)
  })

  it('rejects out-of-inventory built-in evidence and hashless third-party evidence', async () => {
    const root = fixture()
    const read = memory(root, 'policy')
    const template = createJsTsPluginV2().manifest
    for (const builtIn of [false, true]) {
      const plugin: DiscoveryPluginV2 = {
        manifest: { ...template, id: 'policy' },
        async discover(input) {
          await input.read.read({ partition: input.read.partition, signal: input.signal, path: 'src/a.ts' })
          return { entities: [{ id: 'module:policy', kind: 'module', path: builtIn ? 'outside.ts' : 'src/a.ts', name: 'policy', provenance: 'observed', evidence: [{ source: 'code', path: builtIn ? 'outside.ts' : 'src/a.ts' }] }], relations: [], facts: [], packages: [], diagnostics: [], coverage: [] }
        },
      }
      const registry = createDiscoveryRegistryV2({ ...(builtIn ? { builtIns: [{ plugin, analyzerVersions: { policy: template.version } }] } : {}) })
      registry.register(plugin)
      const output = await registry.discover('policy', { read, signal: new AbortController().signal, configuration: {}, resolution: { entities: [], relations: [] } })
      expect(output.coverage[0]?.reason).toBe('PLUGIN_FAILED')
    }
  })

  it('rejects documentation evidence hashed with the code codec for a BOM document', async () => {
    const root = fixture()
    const read = memory(root, 'codecs')
    const plugin: DiscoveryPluginV2 = {
      manifest: createMarkdownPluginV2().manifest,
      async discover(input) {
        const result = await input.read.read({ partition: input.read.partition, signal: input.signal, path: 'README.md' })
        if (result.status !== 'ok') throw new Error(result.code)
        return { entities: [{ id: 'document:README.md', kind: 'document', path: 'README.md', name: 'Guide', provenance: 'observed', evidence: [{ source: 'documentation', path: 'README.md', contentHash: result.value.content.hash }] }], relations: [], facts: [], packages: [], diagnostics: [], coverage: [] }
      },
    }
    const registry = createDiscoveryRegistryV2({ builtIns: [{ plugin, analyzerVersions: { markdown: plugin.manifest.version } }] })
    registry.register(plugin)
    const output = await registry.discover('markdown', { read, signal: new AbortController().signal, configuration: {}, resolution: { entities: [], relations: [] } })
    expect(output.coverage[0]?.reason).toBe('PLUGIN_FAILED')
  })

  it('matches every on-disk discovery fixture in both modes', async () => {
    const root = resolve('tests/fixtures/sample-project')
    const cold = discoverRepository({ root })
    const read = memory(root, cold.sourceRevision)
    expect(JSON.stringify(await injected(read, { root, sourceRevisionKind: cold.sourceRevisionKind }))).toBe(JSON.stringify(cold))
    const warm = discoverRepository({ root, previous: cold })
    expect(JSON.stringify(await injected(read, { root, previous: cold, sourceRevisionKind: cold.sourceRevisionKind }))).toBe(JSON.stringify(warm))
  })

  it('reports each partition-external compiler mapping explicitly', async () => {
    const root = fixture()
    fs.writeFileSync(join(root, 'tsconfig.json'), JSON.stringify({ compilerOptions: { baseUrl: '..', paths: { '@first/*': ['outside/*'], '@second': ['other'] }, rootDirs: ['../one', '../two'] }, include: ['src/**/*'] }))
    const snapshot = await injected(memory(root, 'mappings'), { root })
    const unsupported = snapshot.coverage.filter(entry => entry.scope.startsWith('configuration:'))
    expect(unsupported.map(entry => entry.scope)).toEqual(['configuration:baseUrl', 'configuration:paths:@first/*:0', 'configuration:paths:@second:0', 'configuration:rootDirs:0', 'configuration:rootDirs:1'])
    expect(unsupported.every(entry => entry.status === 'not-analyzed')).toBe(true)
  })

  it('reports oversized acquisition without reading the sparse source file', () => {
    const root = fixture()
    const path = join(root, 'src', 'huge.ts')
    fs.writeFileSync(path, '')
    fs.truncateSync(path, 64 * 1024 * 1024 + 1)
    const snapshot = discoverRepository({ root })
    expect(snapshot.entities.some(entity => entity.path === 'src/huge.ts')).toBe(false)
    expect(snapshot.coverage).toContainEqual(expect.objectContaining({ analyzer: 'repository', scope: 'limits:source', status: 'partial', reason: 'Repository scan exceeded the built-in acquisition byte limits.' }))
  })

  it('rejects a broader capability before acquiring repository bytes', async () => {
    const root = fixture()
    const read = memory(root, 'limits')
    const list = vi.fn(read.list)
    await expect(discoverRepositoryWithRead({ ...read, list, limits: { ...read.limits, maxFileBytes: 65 * 1024 * 1024 } }, { root })).rejects.toThrow('INCOMPATIBLE_RESOURCE_LIMITS')
    expect(list).not.toHaveBeenCalled()
  })

  it('keeps contained paths inherited from a nested config inside the partition', async () => {
    const root = fixture()
    fs.mkdirSync(join(root, 'config'))
    fs.writeFileSync(join(root, 'config', 'base.json'), '{"compilerOptions":{"paths":{"@src/*":["../src/*"]}}}')
    fs.writeFileSync(join(root, 'tsconfig.json'), '{"extends":"./config/base.json","include":["src/**/*"]}')
    const cold = discoverRepository({ root })
    expect(cold.coverage.filter(entry => entry.scope.startsWith('configuration:'))).toEqual([])
    expect(cold.relations).toContainEqual(expect.objectContaining({ from: 'module:src/b.ts', to: 'module:src/a.ts', kind: 're-exports' }))
    expect(JSON.stringify(await injected(memory(root, cold.sourceRevision), { root }))).toBe(JSON.stringify(cold))
  })

  it('returns the exact listing policy and sealed snapshot binding', async () => {
    const root = fixture()
    const read = memory(root, 'binding-revision')
    const result = await discoverRepositoryWithRead(read, { root })
    expect(result.binding).toEqual({ partition: read.partition, snapshotHash: result.snapshot.contentHash, visibilityPolicyHash: '0'.repeat(64) })
  })

})
