import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, relative, resolve } from 'node:path'
import { afterEach, expect, it } from 'vitest'
import {
  applyConfigDefaults, DocBridgeConfigV1Schema, createLocalRepositoryRead,
  createLocalArtifactIO, contentRef, safeWalkFiles, discoverRepositoryWithRead,
  writeStoredSnapshot, readStoredSnapshot, buildStoredDocBridgeIndex,
  loadStoredDocBridgeIndex, loadFreshStoredDocBridgeIndex, runQuery,
  diffSnapshotsWithRead, handleMcpRequest, MCP_TOOLS,
  type DiscoveryPluginV2, type SnapshotReadBinding,
} from '../src/index.js'
import { toySourcePlugin, toyLimits } from './toy-plugin.js'

const roots: string[] = []
const temporary = () => { const root = mkdtempSync(join(tmpdir(), 'doc-bridge-entrypoints-')); roots.push(root); return root }
afterEach(() => roots.splice(0).forEach(root => rmSync(root, { recursive: true, force: true })))

it('runs discovery, snapshot persistence, partitioned index/query and revision findings through root exports', async () => {
  const artifactRoot = temporary()
  const config = applyConfigDefaults(DocBridgeConfigV1Schema.parse({ schemaVersion: 1, corpus: { agent: { root: 'docs' } } }))
  const plugin: DiscoveryPluginV2 = toySourcePlugin
  const scan = async (revision: 'base' | 'head') => {
    const root = temporary()
    cpSync(resolve('tests/fixtures/toy-ecosystem', revision), root, { recursive: true })
    const partition = { repositoryId: 'doc-bridge-fixture', revision }
    const request = { partition, signal: new AbortController().signal }
    const inventory = Object.fromEntries(safeWalkFiles(root).files.map(path => [relative(root, path).replaceAll('\\', '/'), contentRef(readFileSync(path))]))
    const repository = await createLocalRepositoryRead({ root, partition, limits: toyLimits, inventory })
    const artifacts = await createLocalArtifactIO({ root: artifactRoot, partition, limits: toyLimits })
    const discovered = await discoverRepositoryWithRead(repository, { root: 'doc-bridge-fixture', config, plugins: [plugin], replaceSourcePlugins: true })
    const binding: SnapshotReadBinding = discovered.binding
    expect((await writeStoredSnapshot(artifacts, request, discovered.snapshot, null)).status).toBe('ok')
    const restored = await readStoredSnapshot(artifacts, request)
    if (restored.status !== 'ok') throw new Error(restored.code)
    expect(restored.value.value).toEqual(discovered.snapshot)
    const built = await buildStoredDocBridgeIndex({ ...request, repository, artifacts, config, snapshot: restored.value.value, snapshotBinding: binding, overlay: 'ignore' })
    if (built.status !== 'ok') throw new Error(built.code)
    expect(built.value.limitations).toEqual([])
    const loaded = await loadStoredDocBridgeIndex(artifacts, request)
    if (loaded.status !== 'ok') throw new Error(loaded.code)
    expect(loaded.value.index).toEqual(built.value.index)
    expect((await loadFreshStoredDocBridgeIndex(artifacts, repository, request, config)).status).toBe('ok')
    expect(JSON.stringify(runQuery(loaded.value.index, config, { kind: 'search', term: 'Guide' }))).toContain('docs/guide.md')
    const context = { root, config, loadIndex: () => loaded.value.index }
    expect((handleMcpRequest(context, { method: 'tools/list' }) as { tools: unknown }).tools).toBe(MCP_TOOLS)
    const call = { method: 'tools/call', params: { name: 'doc.get', arguments: { path: 'docs/guide.md' } } }
    const local = handleMcpRequest(context, call)
    const injected = handleMcpRequest({ ...context, readDocument: (path: string) => readFileSync(join(root, path), 'utf8') }, call)
    expect(injected).toEqual(local)
    expect(() => handleMcpRequest({ ...context, readDocument: () => { throw new Error('CONTENT_UNAVAILABLE') } }, call)).toThrow('CONTENT_UNAVAILABLE')
    return { root, repository, snapshot: restored.value.value }
  }
  const base = await scan('base'), head = await scan('head')
  const result = await diffSnapshotsWithRead(base.snapshot, head.snapshot, head.repository)
  expect(result.changeSet.baseRevision).toBe('base')
  expect(result.changeSet.headRevision).toBe('head')
  expect(result.changeSet.changes.some(change => change.kind === 'cli-flag' && change.op === 'removed')).toBe(true)
  expect(result.findings).toHaveLength(2)
  expect(result.findings.every(finding => finding.status === 'conflict')).toBe(true)
  writeFileSync(join(head.root, 'docs/guide.md'), '# Changed bytes\n')
  expect((await diffSnapshotsWithRead(base.snapshot, head.snapshot, head.repository)).findings.every(finding => finding.status === 'stale-or-unverified')).toBe(true)
  await expect(diffSnapshotsWithRead(base.snapshot, head.snapshot, base.repository)).rejects.toThrow('HEAD_PARTITION_MISMATCH')
})
