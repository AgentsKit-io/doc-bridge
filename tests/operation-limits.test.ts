import { createArtifactEnvelope } from '../src/storage/artifacts.js'
import { spawn } from 'node:child_process'
import { mkdtempSync, writeFileSync, readdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { discoverRepositoryWithRead } from '../src/discovery/repository.js'
import { diffSnapshotsWithRead } from '../src/diff/change-set.js'
import { buildStoredDocBridgeIndex } from '../src/index-builder/build-index.js'
import { contentRef } from '../src/storage/local.js'
import { applyConfigDefaults } from '../src/config/defaults.js'
import { DocBridgeConfigV1Schema } from '../src/config/schema.js'
import type { ArtifactIOV1, RepositoryReadV1 } from '../src/storage/contract.js'
import type { ProgressEvent } from '../src/storage/operation.js'
const limits = { maxFiles: 100_000, maxBytes: 512 * 1024 * 1024, maxFileBytes: 64 * 1024 * 1024, maxTimeMs: 60_000, maxMemoryMb: 2048 }
const reader = (): RepositoryReadV1 => {
  const files = new Map(Object.entries({ 'package.json': '{"name":"doc-bridge"}', 'README.md': '# Doc Bridge\n`Keep`\n', 'src/main.ts': 'export const Keep = 1\n' }).map(([path, text]) => [path, Buffer.from(text)]))
  return { version: 1, partition: { repositoryId: 'doc-bridge', revision: 'head' }, limits,
    async list() { return { status: 'ok', value: { entries: [...files].map(([path, bytes]) => ({ path, bytes: bytes.length, kind: 'file', content: contentRef(bytes) })), complete: true, visibilityPolicyHash: '0'.repeat(64) } } },
    async stat({ path }) { const bytes = files.get(path); return bytes ? { status: 'ok', value: { path, bytes: bytes.length, kind: 'file', content: contentRef(bytes) } } : { status: 'missing', code: 'NOT_FOUND' } },
    async read({ path }) { const bytes = files.get(path); return bytes ? { status: 'ok', value: { bytes, content: contentRef(bytes) } } : { status: 'missing', code: 'NOT_FOUND' } },
  }
}
const config = applyConfigDefaults(DocBridgeConfigV1Schema.parse({ schemaVersion: 1, corpus: { agent: { root: '.' } } }))
describe('operation limits and telemetry', () => {
  it('returns explicit cancelled coverage after a mid-acquisition abort', async () => {
    const controller = new AbortController()
    const result = await discoverRepositoryWithRead(reader(), { signal: controller.signal, collectMetrics: true, onProgress: event => { if (event.processed === 1) controller.abort() } })
    expect(result.status).toBe('cancelled')
    expect(result.snapshot.coverage).toContainEqual(expect.objectContaining({ scope: 'limits:acquisition', status: 'partial', reason: 'ABORTED' }))
    expect(result.metrics!.filesRead).toBe(1)
  })
  it('reports caller file, byte, duration and heap ceilings', async () => {
    for (const [options, code] of [[{ limits: { maxFiles: 1 } }, 'FILE_LIMIT'], [{ limits: { maxBytes: 1 } }, 'BYTE_LIMIT'], [{ limits: { maxMemoryMb: 0.001 } }, 'MEMORY_LIMIT']] as const) {
      const result = await discoverRepositoryWithRead(reader(), options)
      expect(result.status).toBe('partial')
      expect(result.snapshot.coverage.some(entry => entry.reason === code)).toBe(true)
    }
    const read = reader()
    const result = await discoverRepositoryWithRead({ ...read, async list(request) { await new Promise(resolve => setTimeout(resolve, 15)); return read.list(request) } }, { maxDurationMs: 1 })
    expect(result.status).toBe('partial')
    expect(result.snapshot.coverage.some(entry => entry.reason === 'TIME_LIMIT')).toBe(true)
  })
  it('keeps snapshots and deltas byte-identical with bounded deterministic progress', async () => {
    const events: ProgressEvent[][] = [[], []]
    const plain = await discoverRepositoryWithRead(reader())
    expect(plain.metrics).toBeUndefined()
    expect(plain.status).toBeUndefined()
    for (const list of events) {
      const result = await discoverRepositoryWithRead(reader(), { collectMetrics: true, onProgress: event => list.push(event) })
      expect(JSON.stringify(result.snapshot)).toBe(JSON.stringify(plain.snapshot))
      expect(result.metrics!.filesRead).toBe(3)
      expect(result.metrics!.bytesRead).toBeGreaterThan(0)
      expect(result.metrics!.peakHeapBytes).toBeGreaterThan(0)
    }
    const withoutTime = (list: ProgressEvent[]) => list.map(({ elapsedMs: _elapsed, ...event }) => event)
    expect(withoutTime(events[0]!)).toEqual(withoutTime(events[1]!))
    const plainDiff = await diffSnapshotsWithRead(plain.snapshot, plain.snapshot, reader())
    const progressDiff = await diffSnapshotsWithRead(plain.snapshot, plain.snapshot, reader(), { collectMetrics: true, onProgress: () => {} })
    expect(plainDiff.metrics).toBeUndefined()
    expect(progressDiff.metrics?.filesRead).toBe(1)
    expect(progressDiff.changeSet).toEqual(plainDiff.changeSet)
    expect(progressDiff.findings).toEqual(plainDiff.findings)
    const stopped = await diffSnapshotsWithRead(plain.snapshot, plain.snapshot, reader(), { limits: { maxBytes: 1 } })
    expect(stopped.status).toBe('partial')
    expect(stopped.changeSet.coverage).toContainEqual(expect.objectContaining({ scope: 'limits:diff-documents', reason: 'BYTE_LIMIT' }))
  })
  it('never publishes a cancelled or limited partitioned build', async () => {
    const repository = reader()
    const snapshot = (await discoverRepositoryWithRead(repository)).snapshot
    let writes = 0
    const artifacts: ArtifactIOV1 = { version: 1, partition: repository.partition, limits,
      read: async () => ({ status: 'missing', code: 'NOT_FOUND' }), list: async () => ({ status: 'ok', value: [] }),
      replaceAtomic: async () => { writes++; return { status: 'ok', value: { byteHash: '0'.repeat(64) } } },
    }
    const controller = new AbortController()
    const result = await buildStoredDocBridgeIndex({ repository, artifacts, snapshot, config, partition: repository.partition, signal: controller.signal, collectMetrics: true, onProgress: event => { if (event.stage === 'index-publication') controller.abort() } })
    expect(result.status).toBe('cancelled')
    expect(writes).toBe(0)
    const limited = await buildStoredDocBridgeIndex({ repository: reader(), artifacts, snapshot, config, partition: repository.partition, signal: new AbortController().signal, limits: { maxBytes: 1 } })
    expect(limited.status).toBe('limit')
    expect(writes).toBe(0)
    const complete = await buildStoredDocBridgeIndex({ repository: reader(), artifacts, snapshot, config, partition: repository.partition, signal: new AbortController().signal, write: false })
    expect(complete.status).toBe('ok')
    if (complete.status !== 'ok') return
    const envelope = createArtifactEnvelope({ ioVersion: 1, partition: repository.partition, key: { kind: 'index', name: 'index' }, payloadSchema: 'DocBridgeIndexV1', payloadSchemaVersion: 1, contentHashAlgo: 'sha256-normalized-v1', payloadEncoding: 'json', payload: Buffer.from(JSON.stringify(complete.value.index)) })
    const events: ProgressEvent[] = []
    const withProgress = await buildStoredDocBridgeIndex({ repository: reader(), artifacts: { ...artifacts, read: async () => ({ status: 'ok', value: envelope }) }, snapshot, config, partition: repository.partition, signal: new AbortController().signal, write: false, collectMetrics: true, onProgress: event => events.push(event) })
    expect(withProgress.status).toBe('ok')
    if (withProgress.status === 'ok') expect(JSON.stringify(withProgress.value.index)).toBe(JSON.stringify(complete.value.index))
    expect(complete.value.metrics).toBeUndefined()
    if (withProgress.status === 'ok') expect(withProgress.value.metrics?.filesRead).toBeGreaterThan(0)
    expect(events.map(event => event.stage)).toContain('index-projection')
    const incomplete = await discoverRepositoryWithRead(reader(), { limits: { maxFiles: 1 } })
    const rejected = await buildStoredDocBridgeIndex({ repository: reader(), artifacts, snapshot: incomplete.snapshot, config, partition: repository.partition, signal: new AbortController().signal })
    expect(rejected.status).toBe('limit')
    expect(writes).toBe(0)
  })
})

it('handles real CLI SIGINT without publishing or leaving temporary files', async () => {
  const root = mkdtempSync(join(tmpdir(), 'doc-bridge-abort-'))
  try {
    writeFileSync(join(root, 'package.json'), '{"name":"doc-bridge"}')
    writeFileSync(join(root, 'README.md'), '# Doc Bridge\n')
    writeFileSync(join(root, 'doc-bridge.config.json'), JSON.stringify({ schemaVersion: 1, corpus: { agent: { root: '.' } } }))
    const child = spawn(process.execPath, [resolve('bin/ak-docs.js'), 'index', '--root', root, '--progress'], { cwd: root, stdio: ['ignore', 'pipe', 'pipe'] })
    let stderr = ''
    let signalled = false
    child.stderr.on('data', chunk => {
      stderr += String(chunk)
      if (!signalled && stderr.includes('acquisition:')) { signalled = true; child.kill('SIGINT') }
    })
    const code = await new Promise<number | null>((resolveExit, reject) => { child.on('error', reject); child.on('exit', resolveExit) })
    expect(signalled).toBe(true)
    expect(code).not.toBe(0)
    expect(stderr).toContain('ABORTED')
    expect(readdirSync(root).sort()).toEqual(['README.md', 'doc-bridge.config.json', 'package.json'])
  } finally { rmSync(root, { recursive: true, force: true }) }
}, 30_000)
