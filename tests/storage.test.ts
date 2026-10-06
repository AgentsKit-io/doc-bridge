import { afterEach, describe, expect, it } from 'vitest'
import { mkdtemp, mkdir, writeFile, readFile, readdir, rm, symlink, chmod } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createLocalRepositoryRead, contentRef, rawByteHash } from '../src/storage/local.js'
import { createArtifactEnvelope, createLocalArtifactIO, parseArtifactEnvelope } from '../src/storage/artifacts.js'
import { ArtifactEnvelopeSchema, ContentRefSchema, FileMetaSchema, PartitionSchema, StorageLimitsSchema, storageResultSchema, RepositoryListingSchema, intersectStorageLimits } from '../src/storage/contract.js'
const limits = { maxFiles: 1000, maxBytes: 4_000_000, maxFileBytes: 1_000_000, maxTimeMs: 60_000, maxMemoryMb: 2048 }
const partition = { repositoryId: 'fixture', revision: 'base' }
const signal = () => new AbortController().signal
const roots: string[] = []
const temporary = async () => { const root = await mkdtemp(join(tmpdir(), 'doc-bridge-storage-')); roots.push(root); return root }
const fixture = async (text = 'old') => {
  const root = await temporary(); await writeFile(join(root, 'same.txt'), text)
  return { root, inventory: { 'same.txt': contentRef(Buffer.from(text)) } }
}
const reader = async (text = 'old', overrides = {}) => createLocalRepositoryRead({ ...await fixture(text), partition, limits, ...overrides })
const envelope = (text: string, at = partition) => createArtifactEnvelope({ ioVersion: 1, partition: at, key: { kind: 'index', name: 'main' }, payloadSchema: 'fixture-v1', payloadSchemaVersion: 1, payloadEncoding: 'json', contentHashAlgo: 'sha256-normalized-v1', payload: Buffer.from(JSON.stringify({ text })) })
afterEach(async () => { await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true }))) })

describe('storage contracts with real local files', () => {
  it('strictly roundtrips contracts and intersects immutable limits', () => {
    expect(PartitionSchema.parse(JSON.parse(JSON.stringify(partition)))).toEqual(partition)
    expect(PartitionSchema.safeParse({ ...partition, unknown: true }).success).toBe(false)
    expect(ContentRefSchema.safeParse({ algorithm: 'other', hash: 'a'.repeat(64) }).success).toBe(false)
    expect(FileMetaSchema.safeParse({ path: '../escape', kind: 'file', bytes: 0 }).success).toBe(false)
    expect(StorageLimitsSchema.safeParse({ ...limits, maxFiles: 0 }).success).toBe(false)
    const effective = intersectStorageLimits(limits, { ...limits, maxFiles: 2 })
    expect(effective.maxFiles).toBe(2); expect(Object.isFrozen(effective)).toBe(true)
    expect(storageResultSchema(PartitionSchema).parse({ status: 'ok', value: partition })).toEqual({ status: 'ok', value: partition })
    expect(RepositoryListingSchema.safeParse({ entries: [], complete: false, visibilityPolicyHash: 'a'.repeat(64) }).success).toBe(false)
  })
  it('never cross-reads two repositories and two revisions with identical paths', async () => {
    const readers = []
    for (const repositoryId of ['one','two']) for (const revision of ['base','head']) {
      const read = await reader(`${repositoryId}-${revision}`, { partition: { repositoryId, revision } }); readers.push(read)
    }
    for (const read of readers) for (const other of readers) {
      const result = await read.read({ partition: other.partition, signal: signal(), path: 'same.txt' })
      if (read === other) { expect(result.status).toBe('ok'); if (result.status === 'ok') expect(Buffer.from(result.value.bytes).toString()).toBe(`${read.partition.repositoryId}-${read.partition.revision}`) }
      else expect(result).toEqual({ status: 'denied', code: 'PARTITION_MISMATCH' })
    }
  })
  it('pins caller inventory, detects mutable-workspace changes and expected hash mismatch', async () => {
    const data = await fixture('old'); const read = await createLocalRepositoryRead({ ...data, partition, limits })
    expect((await read.read({ partition, signal: signal(), path: 'same.txt', expected: contentRef(Buffer.from('wrong')) })).status).toBe('mismatch')
    await writeFile(join(data.root, 'same.txt'), 'new')
    expect(await read.read({ partition, signal: signal(), path: 'same.txt' })).toEqual({ status: 'mismatch', code: 'CONTENT_MISMATCH' })
    expect((await read.stat({ partition, signal: signal(), path: 'same.txt' })).status).toBe('mismatch')
    await writeFile(join(data.root, 'added.txt'), 'new')
    expect((await read.list({ partition, signal: signal(), under: '.', include: [], exclude: [] })).status).toBe('mismatch')
    await rm(join(data.root, 'added.txt')); await rm(join(data.root, 'same.txt'))
    expect((await read.list({ partition, signal: signal(), under: '.', include: [], exclude: [] })).status).toBe('mismatch')
  })
  it('counts excluded traversal entries and returns deterministic sorted partial listings', async () => {
    const data = await fixture(); await writeFile(join(data.root, 'a.txt'), 'a'); await writeFile(join(data.root, 'b.txt'), 'b')
    const inventory = { ...data.inventory, 'a.txt': contentRef(Buffer.from('a')), 'b.txt': contentRef(Buffer.from('b')) }
    const results = []
    for (let run = 0; run < 2; run++) {
      const read = await createLocalRepositoryRead({ root: data.root, inventory, partition, limits: { ...limits, maxFiles: 2 } })
      results.push(await read.list({ partition, signal: signal(), under: '.', include: ['**'], exclude: ['a.txt'] }))
    }
    expect(results[0]).toEqual(results[1]); expect(results[0]).toMatchObject({ status: 'ok', value: { complete: false, limitation: 'FILE_LIMIT', entries: [] } })
    const hidden = await createLocalRepositoryRead({ root: data.root, inventory, partition, limits: { ...limits, maxFiles: 1 } })
    expect(await hidden.list({ partition, signal: signal(), under: '.', include: ['nothing'], exclude: ['**'] })).toMatchObject({ status: 'ok', value: { complete: false, entries: [], limitation: 'FILE_LIMIT' } })
  })
  it('denies traversal, absolute, drive, backslash, and real symlinks inside/outside root', async () => {
    const data = await fixture(); const outside = await fixture('outside')
    await symlink(join(data.root, 'same.txt'), join(data.root, 'inside.txt'))
    await symlink(outside.root, join(data.root, 'outside'))
    await symlink(join(outside.root, 'same.txt'), join(data.root, 'escape.txt'))
    const read = await createLocalRepositoryRead({ ...data, inventory: { ...data.inventory, 'inside.txt': data.inventory['same.txt'], 'escape.txt': data.inventory['same.txt'], 'outside/same.txt': data.inventory['same.txt'] }, partition, limits })
    for (const path of ['../same.txt', '/same.txt', 'C:/same.txt', 'a\\b', 'inside.txt', 'escape.txt', 'outside/same.txt']) {
      expect((await read.read({ partition, signal: signal(), path })).status).toBe('denied')
      expect((await read.stat({ partition, signal: signal(), path })).status).toBe('denied')
    }
    const listed = await read.list({ partition, signal: signal(), under: '.', include: [], exclude: [] })
    expect(listed).toMatchObject({ status: 'ok', value: { entries: [{ path: 'same.txt' }] } })
  })
  it('stops operations after cancellation and enforces cumulative bytes and memory/time budgets', async () => {
    const read = await reader(); const abort = new AbortController()
    expect((await read.read({ partition, signal: abort.signal, path: 'same.txt' })).status).toBe('ok'); abort.abort()
    expect(await read.read({ partition, signal: abort.signal, path: 'same.txt' })).toEqual({ status: 'cancelled', code: 'ABORTED' })
    expect((await read.list({ partition, signal: abort.signal, under: '.', include: [], exclude: [] })).status).toBe('cancelled')
    expect((await read.stat({ partition, signal: abort.signal, path: 'same.txt' })).status).toBe('cancelled')
    const bounded = await reader('old', { limits: { ...limits, maxBytes: 3 } })
    expect((await bounded.read({ partition, signal: signal(), path: 'same.txt' })).status).toBe('ok')
    expect(await bounded.read({ partition, signal: signal(), path: 'same.txt' })).toEqual({ status: 'limit', code: 'BYTE_LIMIT' })
    const memory = await reader('old', { limits: { ...limits, maxMemoryMb: 0.00001 } })
    expect((await memory.read({ partition, signal: signal(), path: 'same.txt' })).status).toBe('limit')
    const timed = await reader('old', { limits: { ...limits, maxTimeMs: 1 } })
    await new Promise(resolve => setTimeout(resolve, 5))
    expect(await timed.read({ partition, signal: signal(), path: 'same.txt' })).toEqual({ status: 'limit', code: 'TIME_LIMIT' })
  })
  it('publishes readable JSON atomically with create-if-absent and exact raw-byte CAS', async () => {
    const root = await temporary(); const io = await createLocalArtifactIO({ root, partition, limits })
    const old = envelope('old'), next = envelope('new')
    expect(ArtifactEnvelopeSchema.parse(old)).toEqual(old)
    expect(await io.replaceAtomic({ partition, signal: signal(), artifact: old, expectedPreviousByteHash: null })).toEqual({ status: 'ok', value: { byteHash: old.byteHash } })
    expect((await io.replaceAtomic({ partition, signal: signal(), artifact: next, expectedPreviousByteHash: null })).status).toBe('mismatch')
    expect(await io.replaceAtomic({ partition, signal: signal(), artifact: next, expectedPreviousByteHash: old.byteHash })).toEqual({ status: 'ok', value: { byteHash: next.byteHash } })
    expect(await io.read({ partition, signal: signal(), key: old.key })).toEqual({ status: 'ok', value: next })
    const scope = (await readdir(root))[0]!
    const raw = await readFile(join(root, scope, 'index', 'main.json'))
    expect(JSON.parse(raw.toString()).payload).toEqual({ text: 'new' })
    expect(JSON.parse(raw.toString()).byteHash).toBeUndefined()
    expect(rawByteHash(raw)).toBe(next.byteHash); expect(parseArtifactEnvelope(raw)).toEqual(next)
    const tampered = JSON.parse(raw.toString()); tampered.payload.text = 'tampered'
    expect(() => parseArtifactEnvelope(Buffer.from(JSON.stringify(tampered)))).toThrow()
  })
  it('partitions artifacts across two repositories and two revisions', async () => {
    const root = await temporary()
    const cases = []
    for (const repositoryId of ['one','two']) for (const revision of ['base','head']) {
      const at = { repositoryId, revision }, io = await createLocalArtifactIO({ root, partition: at, limits }), artifact = envelope(`${repositoryId}-${revision}`, at)
      expect((await io.replaceAtomic({ partition: at, signal: signal(), artifact, expectedPreviousByteHash: null })).status).toBe('ok')
      cases.push({ at, io, artifact })
    }
    for (const own of cases) for (const other of cases) {
      const result = await own.io.read({ partition: other.at, signal: signal(), key: other.artifact.key })
      if (own === other) expect(result).toEqual({ status: 'ok', value: own.artifact })
      else expect(result).toEqual({ status: 'denied', code: 'PARTITION_MISMATCH' })
      if (own !== other) expect((await own.io.replaceAtomic({ partition: own.at, signal: signal(), artifact: other.artifact, expectedPreviousByteHash: own.artifact.byteHash })).status).toBe('denied')
    }
  })
  it('leaves old complete bytes on interrupted writes and cleans temporary files', async () => {
    const root = await temporary(); const io = await createLocalArtifactIO({ root, partition, limits }); const old = envelope('old')
    await io.replaceAtomic({ partition, signal: signal(), artifact: old, expectedPreviousByteHash: null })
    const broken = await createLocalArtifactIO({ root, partition, limits, beforeRename: async () => {
      const scope = (await readdir(root))[0]!, dir = join(root, scope, 'index'), temp = (await readdir(dir)).find(name => name.endsWith('.tmp'))!
      await writeFile(join(dir, temp), 'interrupted partial bytes'); throw new Error('injected fault')
    } })
    expect((await broken.replaceAtomic({ partition, signal: signal(), artifact: envelope('new'), expectedPreviousByteHash: old.byteHash })).status).toBe('error')
    expect(await io.read({ partition, signal: signal(), key: old.key })).toEqual({ status: 'ok', value: old })
    const scope = (await readdir(root))[0]!
    expect(await readdir(join(root, scope, 'index'))).toEqual(['main.json'])
  })
  it('roundtrips binary payloads and bounds real artifact listing', async () => {
    const root = await temporary(), io = await createLocalArtifactIO({ root, partition, limits })
    const artifact = createArtifactEnvelope({ ioVersion: 1, partition, key: { kind: 'cache', name: 'binary' }, payloadSchema: 'binary-v1', payloadSchemaVersion: 1, payloadEncoding: 'base64', contentHashAlgo: 'sha256-raw-v1', payload: Uint8Array.from([0, 255, 128, 10]) })
    expect((await io.replaceAtomic({ partition, signal: signal(), artifact, expectedPreviousByteHash: null })).status).toBe('ok')
    expect(await io.read({ partition, signal: signal(), key: artifact.key })).toEqual({ status: 'ok', value: artifact })
    expect(await io.list({ partition, signal: signal(), kind: 'cache', maxItems: 1 })).toEqual({ status: 'ok', value: [artifact.key] })
    const second = createArtifactEnvelope({ ...artifact, key: { kind: 'cache', name: 'second' } })
    await io.replaceAtomic({ partition, signal: signal(), artifact: second, expectedPreviousByteHash: null })
    expect(await io.list({ partition, signal: signal(), kind: 'cache', maxItems: 1 })).toEqual({ status: 'limit', code: 'FILE_LIMIT' })
  })
  it('returns a safe error if interrupted-write cleanup is denied', async () => {
    const root = await temporary(); let directory = ''
    const io = await createLocalArtifactIO({ root, partition, limits, beforeRename: async () => {
      directory = join(root, (await readdir(root))[0]!, 'index'); await chmod(directory, 0o500); throw new Error('fault')
    } })
    try { await expect(io.replaceAtomic({ partition, signal: signal(), artifact: envelope('new'), expectedPreviousByteHash: null })).resolves.toEqual({ status: 'error', code: 'IO_ERROR' }) }
    finally { if (directory) await chmod(directory, 0o700) }
  })
  it('allows only one of two independent concurrent publishers to win', async () => {
    const root = await temporary(); const left = await createLocalArtifactIO({ root, partition, limits }), right = await createLocalArtifactIO({ root, partition, limits })
    const initial = envelope('old'); await left.replaceAtomic({ partition, signal: signal(), artifact: initial, expectedPreviousByteHash: null })
    const results = await Promise.all([left,right].map((io,index) => io.replaceAtomic({ partition, signal: signal(), artifact: envelope(String(index)), expectedPreviousByteHash: initial.byteHash })))
    expect(results.filter(result => result.status === 'ok')).toHaveLength(1)
    expect(results.filter(result => result.status === 'mismatch')).toHaveLength(1)
    expect((await left.read({ partition, signal: signal(), key: initial.key })).status).toBe('ok')
  })
  it('denies artifact symlink escape and cancellation before publication', async () => {
    const root = await temporary(), outside = await temporary(), io = await createLocalArtifactIO({ root, partition, limits }), artifact = envelope('new')
    const scope = rawByteHash(Buffer.from(JSON.stringify({ repositoryId: partition.repositoryId, revision: partition.revision })))
    await symlink(outside, join(root, scope))
    expect((await io.replaceAtomic({ partition, signal: signal(), artifact, expectedPreviousByteHash: null })).status).toBe('denied')
    expect(await readdir(outside)).toEqual([])
    const abort = new AbortController(); abort.abort()
    expect((await io.replaceAtomic({ partition, signal: abort.signal, artifact, expectedPreviousByteHash: null })).status).toBe('cancelled')
  })
})
