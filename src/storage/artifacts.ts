import { mkdir, open, opendir, rename, rm, lstat, realpath } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { randomUUID } from 'node:crypto'
import { z } from 'zod'
import { canonicalJsonV1, sha256NormalizedV1 } from '../index-builder/content-hash.js'
import { ArtifactEnvelopeSchema, ArtifactReadRequestSchema, ArtifactReplaceRequestSchema, ArtifactListRequestSchema, PartitionSchema, StorageLimitsSchema, samePartition, type ArtifactEnvelope, type ArtifactIOV1, type ArtifactKey, type Partition, type StorageLimits } from './contract.js'
import { checkedPath, fail, rawByteHash, readDescriptor, StorageLedger, storageFailure } from './local.js'

const WireEnvelopeSchema = ArtifactEnvelopeSchema.omit({ byteHash: true, payload: true }).extend({ payload: z.unknown() }).strict()
const payloadHash = (artifact: Pick<ArtifactEnvelope, 'contentHashAlgo' | 'payload' | 'payloadEncoding'>): string => artifact.contentHashAlgo === 'sha256-raw-v1' ? rawByteHash(artifact.payload) : sha256NormalizedV1(artifact.payloadEncoding === 'json' ? JSON.parse(Buffer.from(artifact.payload).toString('utf8')) : Buffer.from(artifact.payload).toString('utf8'))
const serialize = (artifact: ArtifactEnvelope): Uint8Array => {
  const { byteHash: _byteHash, payload, ...metadata } = artifact
  const wirePayload: unknown = artifact.payloadEncoding === 'json' ? JSON.parse(Buffer.from(payload).toString('utf8')) : Buffer.from(payload).toString('base64')
  if (artifact.payloadEncoding === 'json' && canonicalJsonV1(wirePayload) !== Buffer.from(payload).toString('utf8')) fail('denied', 'INVALID_CONTRACT')
  if (payloadHash(artifact) !== artifact.contentHash) fail('mismatch', 'CONTENT_MISMATCH')
  return Buffer.from(canonicalJsonV1({ ...metadata, payload: wirePayload }))
}
export const createArtifactEnvelope = (input: Omit<ArtifactEnvelope, 'byteHash' | 'contentHash'>): ArtifactEnvelope => {
  const payload = input.payloadEncoding === 'json' ? Buffer.from(canonicalJsonV1(JSON.parse(Buffer.from(input.payload).toString('utf8')))) : Uint8Array.from(input.payload)
  const artifact = ArtifactEnvelopeSchema.parse({ ...input, payload, contentHash: payloadHash({ ...input, payload }), byteHash: '0'.repeat(64) })
  return { ...artifact, byteHash: rawByteHash(serialize(artifact)) }
}
export const parseArtifactEnvelope = (bytes: Uint8Array): ArtifactEnvelope => {
  const wire = WireEnvelopeSchema.parse(JSON.parse(Buffer.from(bytes).toString('utf8')))
  if (wire.payloadEncoding === 'base64' && (typeof wire.payload !== 'string' || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(wire.payload))) fail('denied', 'INVALID_CONTRACT')
  const payload = wire.payloadEncoding === 'json' ? Buffer.from(canonicalJsonV1(wire.payload)) : Uint8Array.from(Buffer.from(wire.payload as string, 'base64'))
  const artifact = ArtifactEnvelopeSchema.parse({ ...wire, payload, byteHash: rawByteHash(bytes) })
  if (payloadHash(artifact) !== artifact.contentHash) fail('mismatch', 'CONTENT_MISMATCH')
  if (!Buffer.from(serialize(artifact)).equals(Buffer.from(bytes))) fail('denied', 'INVALID_CONTRACT')
  return artifact
}
export type LocalArtifactIOOptions = Readonly<{
  root: string
  partition: Partition
  limits: StorageLimits
  /** Test-only fault checkpoint; production callers omit it. No crash-durability guarantee. */
  beforeRename?: () => Promise<void> | void
}>
export const createLocalArtifactIO = async (options: LocalArtifactIOOptions): Promise<ArtifactIOV1> => {
  const partition = Object.freeze(PartitionSchema.parse(options.partition))
  const limits = Object.freeze(StorageLimitsSchema.parse(options.limits))
  await mkdir(resolve(options.root), { recursive: true })
  const root = await realpath(resolve(options.root))
  const ledger = new StorageLedger(partition, limits)
  const scope = rawByteHash(Buffer.from(canonicalJsonV1(partition)))
  const pathFor = (key: ArtifactKey) => `${scope}/${key.kind}/${key.name}.json`
  const verify = (artifact: ArtifactEnvelope, key: ArtifactKey) => {
    if (!samePartition(partition, artifact.partition)) fail('denied', 'PARTITION_MISMATCH')
    if (artifact.key.kind !== key.kind || artifact.key.name !== key.name) fail('denied', 'INVALID_CONTRACT')
  }
  const ensureDirectory = async (directory: string) => {
    let path = root
    let logical = ''
    if (await realpath(root) !== root) fail('denied', 'PATH_DENIED')
    for (const part of directory.split('/')) {
      path = join(path, part)
      logical = logical ? `${logical}/${part}` : part
      try { await mkdir(path) } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error }
      if (!(await lstat(path)).isDirectory() || (await lstat(path)).isSymbolicLink()) fail('denied', 'PATH_DENIED')
      await checkedPath(root, logical)
    }
  }
  return Object.freeze({ version: 1 as const, partition, limits,
    async read(input) {
      try {
        const request = ArtifactReadRequestSchema.parse(input); ledger.check(request)
        const artifact = parseArtifactEnvelope(await readDescriptor(root, pathFor(request.key), request, ledger))
        verify(artifact, request.key)
        return { status: 'ok' as const, value: artifact }
      } catch (error) { return storageFailure(error) }
    },
    async list(input) {
      try {
        const request = ArtifactListRequestSchema.parse(input); ledger.check(request)
        const path = await checkedPath(root, `${scope}/${request.kind}`)
        const keys: ArtifactKey[] = []
        for await (const entry of await opendir(path)) {
          ledger.entry(request)
          const name = entry.name
          if (!name.endsWith('.json')) continue
          const target = await checkedPath(root, `${scope}/${request.kind}/${name}`)
          if (!(await lstat(target)).isFile()) fail('denied', 'PATH_DENIED')
          if (keys.length >= request.maxItems) fail('limit', 'FILE_LIMIT')
          keys.push(ArtifactReadRequestSchema.shape.key.parse({ kind: request.kind, name: name.slice(0,-5) }))
        }
        return { status: 'ok' as const, value: keys.sort((a,b) => a.name.localeCompare(b.name)) }
      } catch (error) { return storageFailure(error) }
    },
    async replaceAtomic(input) {
      let lock: string | undefined
      let temporary: string | undefined
      try {
        const request = ArtifactReplaceRequestSchema.parse(input); ledger.check(request)
        const artifact = request.artifact
        verify(artifact, artifact.key)
        const bytes = serialize(artifact)
        if (rawByteHash(bytes) !== artifact.byteHash) fail('mismatch', 'CONTENT_MISMATCH')
        ledger.entry(request); ledger.charge(request, bytes.length)
        const path = pathFor(artifact.key)
        await ensureDirectory(`${scope}/${artifact.key.kind}`)
        ledger.check(request)
        const lockPath = join(root, `${path}.lock`)
        let descriptor
        try { descriptor = await open(lockPath, 'wx', 0o600) } catch (error) {
          if ((error as NodeJS.ErrnoException).code === 'EEXIST') fail('mismatch', 'CAS_CONFLICT')
          throw error
        }
        lock = lockPath
        await descriptor.close()
        let previous: ArtifactEnvelope | undefined
        try {
          previous = parseArtifactEnvelope(await readDescriptor(root, path, request, ledger))
          verify(previous, artifact.key)
        } catch (error) { if (storageFailure(error).status !== 'missing') throw error }
        if ((previous?.byteHash ?? null) !== request.expectedPreviousByteHash) fail('mismatch', 'CAS_CONFLICT')
        temporary = join(root, `${path}.${randomUUID()}.tmp`)
        const writer = await open(temporary, 'wx', 0o600)
        try { await writer.writeFile(bytes) } finally { await writer.close() }
        await options.beforeRename?.()
        ledger.check(request)
        await checkedPath(root, `${scope}/${artifact.key.kind}`)
        // A pre-existing target symlink is never followed/replaced.
        try { await checkedPath(root, path) } catch (error) { if (storageFailure(error).status !== 'missing') throw error }
        await rename(temporary, join(root, path))
        temporary = undefined
        return { status: 'ok' as const, value: { byteHash: artifact.byteHash } }
      } catch (error) { return storageFailure(error) }
      finally {
        try {
          if (temporary) await rm(temporary, { force: true })
          if (lock) await rm(lock, { force: true })
        } catch (error) { return storageFailure(error) }
      }
    },
  } satisfies ArtifactIOV1)
}
