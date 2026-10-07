import { afterEach, describe, expect, it, vi } from 'vitest'
import { mkdtemp, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { AnalyzerPluginManifestSchema, AnalyzerPluginOutputSchema, createAnalyzerRegistry, createDiscoveryRegistryV2, DiscoveryPluginInputV2Schema, DiscoveryPluginManifestV2Schema, DiscoveryPluginOutputV2Schema, resolutionSchema, ReleaseEventSchema, type DiscoveryPluginManifestV2 } from '../src/plugins/contract.js'
import { createLocalRepositoryRead, contentRef } from '../src/storage/local.js'
import { PackageFactSchema, packageFactToEntity, packageFactFromEntity, surfaceFactEntityId, surfaceFactToEntity, surfaceFactFromEntity } from '../src/storage/facts.js'
const limits = { maxFiles: 100, maxBytes: 1_000_000, maxFileBytes: 100_000, maxTimeMs: 60_000, maxMemoryMb: 2048 }
const partition = { repositoryId: 'fixture', revision: 'base' }
const manifest = (overrides = {}): DiscoveryPluginManifestV2 => ({ contractVersion: 2, id: 'fixture', version: '1', knowledgeSchemaVersion: 1, pipelineMajor: 1, languages: ['fixture'], capabilities: ['symbols'], inputPatterns: ['**/*.txt'], unsupportedConstructs: [], resourceLimits: limits, ...overrides })
const empty = () => ({ entities: [], relations: [], facts: [], packages: [], coverage: [], diagnostics: [] })
const roots: string[] = []
const input = async (customLimits = limits) => {
  const root = await mkdtemp(join(tmpdir(), 'doc-bridge-plugin-')); roots.push(root)
  await writeFile(join(root, 'source.txt'), 'symbol Keep\n')
  const read = await createLocalRepositoryRead({ root, partition, limits: customLimits, inventory: { 'source.txt': contentRef(Buffer.from('symbol Keep\n')) } })
  return { read, signal: new AbortController().signal, configuration: {}, resolution: { entities: [], relations: [] } }
}
afterEach(async () => { await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true }))) })
describe('discovery v2 and v1 compatibility', () => {
  it('strictly roundtrips both versions without changing the v1 field set', async () => {
    const v1 = AnalyzerPluginManifestSchema.parse({ id: 'old', version: '1', languages: ['fixture'], capabilities: ['entities'], knowledgeSchemaVersion: 1, compatibility: { pipelineMajor: 1 } })
    const output = AnalyzerPluginOutputSchema.parse({})
    expect(AnalyzerPluginManifestSchema.parse(JSON.parse(JSON.stringify(v1)))).toEqual(v1)
    expect(AnalyzerPluginOutputSchema.parse(JSON.parse(JSON.stringify(output)))).toEqual(output)
    expect(AnalyzerPluginManifestSchema.safeParse({ ...v1, contractVersion: 2 }).success).toBe(false)
    expect(AnalyzerPluginOutputSchema.safeParse({ ...output, facts: [] }).success).toBe(false)
    expect(DiscoveryPluginManifestV2Schema.parse(JSON.parse(JSON.stringify(manifest())))).toEqual(manifest())
    expect(DiscoveryPluginOutputV2Schema.parse(JSON.parse(JSON.stringify(empty())))).toEqual(empty())
    expect(DiscoveryPluginManifestV2Schema.safeParse(v1).success).toBe(false)
    expect(DiscoveryPluginOutputV2Schema.safeParse({ ...empty(), unknown: true }).success).toBe(false)
    const value = await input()
    expect(DiscoveryPluginInputV2Schema.parse(value).read).toBe(value.read)
    expect(DiscoveryPluginInputV2Schema.safeParse({ ...value, root: '/other' }).success).toBe(false)
    const registry = createAnalyzerRegistry(); registry.register({ manifest: v1, analyze: () => output })
    expect(await registry.analyze('old', { language: 'fixture', files: [] })).toEqual(output)
  })
  it('rejects contract, pipeline, duplicate, and resource incompatibility before execution', async () => {
    const registry = createDiscoveryRegistryV2(), discover = vi.fn(async () => empty())
    expect(() => registry.register({ manifest: manifest({ contractVersion: 1 }), discover })).toThrow()
    expect(() => registry.register({ manifest: manifest({ pipelineMajor: 2 }), discover })).toThrow('INCOMPATIBLE_PIPELINE')
    expect(() => registry.register({ manifest: manifest({ capabilities: ['versions'] }), discover })).toThrow('MISSING_VERSION_CAPABILITY')
    registry.register({ manifest: manifest(), discover })
    expect(() => registry.register({ manifest: manifest(), discover })).toThrow('DUPLICATE_PLUGIN')
    await expect(registry.discover('fixture', await input({ ...limits, maxFiles: 101 }))).rejects.toThrow('INCOMPATIBLE_RESOURCE_LIMITS')
    expect(discover).not.toHaveBeenCalled()
    expect(Object.isFrozen(registry.list()[0])).toBe(true)
  })
  it('validates issued-read evidence, generic fact ownership, and strict persisted codecs', async () => {
    const registry = createDiscoveryRegistryV2()
    registry.register({ manifest: manifest(), discover: async value => {
      const source = await value.read.read({ partition, signal: value.signal, path: 'source.txt' })
      if (source.status !== 'ok') throw new Error('read failed')
      const evidence = [{ source: 'code' as const, path: 'source.txt', lineStart: 1, contentHash: source.value.content.hash }]
      const owner = { id: 'module:source.txt', kind: 'module', name: 'source', path: 'source.txt', provenance: 'observed' as const, evidence }
      const fact = { kind: 'symbol' as const, id: surfaceFactEntityId('symbol', owner.id, 'Keep'), ownerId: owner.id, name: 'Keep', valueHash: source.value.content.hash, evidence }
      expect(surfaceFactFromEntity(JSON.parse(JSON.stringify(surfaceFactToEntity(fact))))).toEqual(fact)
      expect(() => surfaceFactFromEntity({ ...surfaceFactToEntity(fact), metadata: { ...surfaceFactToEntity(fact).metadata, unknown: true } })).toThrow()
      return { ...empty(), entities: [owner], facts: [fact], coverage: [{ analyzer: 'wrong', scope: 'symbols', status: 'complete' }] }
    } })
    const output = await registry.discover('fixture', await input())
    expect(output.facts).toHaveLength(1); expect(output.coverage).toContainEqual({ analyzer: 'fixture', analyzerVersion: '1', scope: 'symbols', status: 'complete' })
    expect(output.coverage).toContainEqual({ analyzer: 'fixture', analyzerVersion: '1', scope: 'versions', status: 'not-analyzed', reason: 'UNSUPPORTED_CAPABILITY' })
    expect(DiscoveryPluginOutputV2Schema.parse(JSON.parse(JSON.stringify(output)))).toEqual(output)
    const pkg = PackageFactSchema.parse({ id: 'package:demo', purl: 'pkg:generic/demo', version: '2', dependencies: [{ purl: 'pkg:generic/helper', range: 'vers:fixture/>=1', lockedVersion: '3' }], evidence: output.facts[0]!.evidence })
    const existing = { id: pkg.id, kind: 'package', name: 'demo', provenance: 'observed' as const, evidence: pkg.evidence, metadata: { workspace: true } }
    const entity = packageFactToEntity(pkg, existing)
    expect(entity.id).toBe(existing.id); expect(entity.evidence).toEqual(existing.evidence); expect(entity.metadata?.workspace).toBe(true)
    expect(packageFactFromEntity(JSON.parse(JSON.stringify(entity)))).toEqual(pkg)
    expect(() => packageFactFromEntity({ ...entity, metadata: { ...entity.metadata, package: { purl: pkg.purl, dependencies: [], unknown: true } } })).toThrow()
    expect(resolutionSchema(ReleaseEventSchema).safeParse({ status: 'ambiguous', reason: 'multiple', evidence: [] }).success).toBe(true)
  })
  it.each(['evidence','owner','endpoint','duplicate','oversized','exception'])('fails safely on invalid %s without leaking plugin exceptions', async issue => {
    const registry = createDiscoveryRegistryV2()
    registry.register({ manifest: manifest(), discover: async value => {
      if (issue === 'exception') throw new Error('sensitive exception text')
      if (issue === 'oversized') return { ...empty(), diagnostics: 'x'.repeat(limits.maxBytes + 1) }
      const read = await value.read.read({ partition, signal: value.signal, path: 'source.txt' })
      if (read.status !== 'ok') throw new Error()
      const evidence = [{ source: 'code' as const, path: 'source.txt', contentHash: issue === 'evidence' ? '0'.repeat(64) : read.value.content.hash }]
      const entity = { id: 'module:one', kind: 'module', name: 'one', provenance: 'observed' as const, evidence }
      if (issue === 'owner') return { ...empty(), facts: [{ kind: 'symbol', id: 'symbol:missing:x', ownerId: 'missing', name: 'x', valueHash: read.value.content.hash, evidence }] }
      if (issue === 'endpoint') return { ...empty(), entities: [entity], relations: [{ id: 'rel', kind: 'imports', from: entity.id, to: 'missing', provenance: 'observed', evidence }] }
      return { ...empty(), entities: issue === 'duplicate' ? [entity, entity] : [entity] }
    } })
    const result = await registry.discover('fixture', await input())
    expect(result.entities).toEqual([]); expect(result.coverage).toMatchObject([{ status: 'not-analyzed', reason: 'PLUGIN_FAILED' }])
    expect(JSON.stringify(result)).not.toContain('sensitive')
  })
  it('cancels before execution and aborts late plugin operations after timeout', async () => {
    const registry = createDiscoveryRegistryV2(), discover = vi.fn(async () => empty()), value = await input()
    registry.register({ manifest: manifest(), discover })
    const abort = new AbortController(); abort.abort()
    expect((await registry.discover('fixture', { ...value, signal: abort.signal })).coverage[0]?.status).toBe('not-analyzed'); expect(discover).not.toHaveBeenCalled()
    const timeout = createDiscoveryRegistryV2(); let lateStatus: string | undefined
    timeout.register({ manifest: manifest({ resourceLimits: { ...limits, maxTimeMs: 10 } }), discover: async late => {
      await new Promise(resolve => setTimeout(resolve, 25))
      try { await late.read.read({ partition, signal: new AbortController().signal, path: 'source.txt' }); lateStatus = 'unexpected' } catch { lateStatus = 'cancelled' }
      return empty()
    } })
    expect((await timeout.discover('fixture', await input({ ...limits, maxTimeMs: 10 }))).coverage[0]?.status).toBe('not-analyzed')
    await new Promise(resolve => setTimeout(resolve, 35)); expect(lateStatus).toBe('cancelled')
  })
})
