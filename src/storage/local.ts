import { constants } from 'node:fs'
import { lstat, open, opendir, realpath } from 'node:fs/promises'
import { join, relative, resolve, sep, isAbsolute } from 'node:path'
import { createHash } from 'node:crypto'
import { minimatch } from 'minimatch'
import { z } from 'zod'
import { createIgnoreFilter } from '../lib/ignore-filter.js'
import { DEFAULT_SAFETY_EXCLUDES } from '../safety/repository.js'
import { fileContentHash } from '../discovery/incremental.js'
import { ContentRefSchema, PartitionSchema, StorageLimitsSchema, RepositoryListRequestSchema, RepositoryReadRequestSchema, RepositoryStatRequestSchema, StoragePathSchema, samePartition, type ContentRef, type FileMeta, type Partition, type RepositoryReadV1, type StorageFailure, type StorageLimits, type StorageRequest, type StorageResult } from './contract.js'

export const rawByteHash = (bytes: Uint8Array): string => createHash('sha256').update(bytes).digest('hex')
export const contentRef = (bytes: Uint8Array): ContentRef => ({ algorithm: 'sha256-normalized-v1', hash: fileContentHash(Buffer.from(bytes).toString('utf8')) })
export class StorageFault extends Error {
  constructor(readonly failure: StorageFailure) { super(failure.code) }
}
export const fail = (status: StorageFailure['status'], code: StorageFailure['code']): never => { throw new StorageFault({ status, code }) }
export const storageFailure = (error: unknown): StorageFailure => error instanceof StorageFault ? error.failure : error instanceof z.ZodError ? { status: 'denied', code: 'INVALID_CONTRACT' } : { status: (error as NodeJS.ErrnoException)?.code === 'ENOENT' ? 'missing' : 'error', code: (error as NodeJS.ErrnoException)?.code === 'ENOENT' ? 'NOT_FOUND' : 'IO_ERROR' }

/** Cooperative per-capability ledger. Counts actual entries and bytes, including rejected selections. */
export class StorageLedger {
  private entries = 0
  private bytes = 0
  private readonly started = performance.now()
  constructor(readonly partition: Partition, readonly limits: StorageLimits) {}
  check(request: StorageRequest): void {
    if (!samePartition(this.partition, request.partition)) fail('denied', 'PARTITION_MISMATCH')
    if (request.signal.aborted) fail('cancelled', 'ABORTED')
    if (performance.now() - this.started >= this.limits.maxTimeMs) fail('limit', 'TIME_LIMIT')
    if (process.memoryUsage().heapUsed > this.limits.maxMemoryMb * 1024 * 1024) fail('limit', 'MEMORY_LIMIT')
  }
  entry(request: StorageRequest): void {
    this.check(request)
    if (++this.entries > this.limits.maxFiles) fail('limit', 'FILE_LIMIT')
  }
  charge(request: StorageRequest, bytes: number): void {
    this.check(request)
    if (bytes > this.limits.maxFileBytes || this.bytes + bytes > this.limits.maxBytes) fail('limit', 'BYTE_LIMIT')
    this.bytes += bytes
  }
}

export const boundedDirectory = async (directory: string, request: StorageRequest, ledger: StorageLedger): Promise<string[]> => {
  ledger.check(request)
  const names: string[] = []
  const handle = await opendir(directory)
  for await (const entry of handle) { ledger.entry(request); names.push(entry.name) }
  return names.sort()
}

export const checkedPath = async (root: string, path: string): Promise<string> => {
  if (!StoragePathSchema.safeParse(path).success) fail('denied', 'PATH_DENIED')
  if (await realpath(root) !== root) fail('denied', 'PATH_DENIED')
  let target = root
  for (const part of path.split('/')) {
    target = join(target, part)
    if ((await lstat(target)).isSymbolicLink()) fail('denied', 'PATH_DENIED')
  }
  const canonical = await realpath(target)
  const rel = relative(root, canonical)
  if (isAbsolute(rel) || rel === '..' || rel.startsWith(`..${sep}`)) fail('denied', 'PATH_DENIED')
  return canonical
}

/** Same open/fstat/budget/close discipline as readBoundedText, retaining raw bytes. */
export const readDescriptor = async (root: string, path: string, request: StorageRequest, ledger: StorageLedger): Promise<Uint8Array> => {
  ledger.entry(request)
  const target = await checkedPath(root, path)
  ledger.check(request)
  const descriptor = await open(target, constants.O_RDONLY | constants.O_NOFOLLOW)
  try {
    const stat = await descriptor.stat()
    if (!stat.isFile()) fail('denied', 'PATH_DENIED')
    ledger.charge(request, stat.size)
    const current = await lstat(await checkedPath(root, path))
    if (current.dev !== stat.dev || current.ino !== stat.ino) fail('mismatch', 'REVISION_MISMATCH')
    const bytes = Buffer.alloc(stat.size)
    let offset = 0
    while (offset < bytes.length) {
      ledger.check(request)
      const result = await descriptor.read(bytes, offset, Math.min(64 * 1024, bytes.length - offset), offset)
      if (!result.bytesRead) fail('mismatch', 'REVISION_MISMATCH')
      offset += result.bytesRead
    }
    const after = await descriptor.stat()
    const final = await lstat(await checkedPath(root, path))
    if (after.size !== stat.size || after.mtimeMs !== stat.mtimeMs || after.ctimeMs !== stat.ctimeMs || final.dev !== stat.dev || final.ino !== stat.ino) fail('mismatch', 'REVISION_MISMATCH')
    ledger.check(request)
    return bytes
  } finally { await descriptor.close() }
}

export type LocalRepositoryReadOptions = Readonly<{
  root: string
  partition: Partition
  limits: StorageLimits
  /** Caller-confirmed exact revision inventory; no implicit latest/Git fallback. */
  inventory: Readonly<Record<string, ContentRef>>
}>

export const createLocalRepositoryRead = async (options: LocalRepositoryReadOptions): Promise<RepositoryReadV1> => {
  const partition = Object.freeze(PartitionSchema.parse(options.partition))
  const limits = Object.freeze(StorageLimitsSchema.parse(options.limits))
  const inventory = z.record(StoragePathSchema, ContentRefSchema).parse(options.inventory)
  for (const value of Object.values(inventory)) Object.freeze(value)
  Object.freeze(inventory)
  const root = await realpath(resolve(options.root))
  const ledger = new StorageLedger(partition, limits)
  // Caller setup only: reuse the repository's existing Git/nested-ignore policy.
  const ignored = createIgnoreFilter(root)
  const excluded = (path: string) => DEFAULT_SAFETY_EXCLUDES.some(pattern => minimatch(path, pattern, { dot: true }))
  const verify = async (request: StorageRequest, path: string, expected?: ContentRef) => {
    if (excluded(path)) fail('denied', 'PATH_DENIED')
    const pinned = inventory[path]
    if (!pinned) fail('mismatch', 'REVISION_MISMATCH')
    if (ignored.isIgnored(await checkedPath(root, path), false)) fail('denied', 'PATH_DENIED')
    const bytes = await readDescriptor(root, path, request, ledger)
    const content = contentRef(bytes)
    if (content.hash !== pinned!.hash || (expected && (expected.algorithm !== content.algorithm || expected.hash !== content.hash))) fail('mismatch', 'CONTENT_MISMATCH')
    return { bytes, content }
  }
  return Object.freeze({
    version: 1 as const, partition, limits,
    async read(input): Promise<StorageResult<{ bytes: Uint8Array; content: ContentRef }>> {
      try { const request = RepositoryReadRequestSchema.parse(input); ledger.check(request); return { status: 'ok', value: await verify(request, request.path, request.expected) } } catch (error) { return storageFailure(error) }
    },
    async stat(input): Promise<StorageResult<FileMeta>> {
      try {
        const request = RepositoryStatRequestSchema.parse(input); ledger.check(request)
        if (excluded(request.path)) fail('denied', 'PATH_DENIED')
        ledger.entry(request)
        const target = await checkedPath(root, request.path)
        const stat = await lstat(target)
        if (ignored.isIgnored(target, stat.isDirectory())) fail('denied', 'PATH_DENIED')
        if (stat.isFile()) {
          const verified = await verify(request, request.path)
          return { status: 'ok', value: { path: request.path, kind: 'file', bytes: verified.bytes.length, content: verified.content } }
        }
        if (!stat.isDirectory()) fail('denied', 'PATH_DENIED')
        ledger.check(request)
        return { status: 'ok', value: { path: request.path, kind: 'directory', bytes: 0 } }
      } catch (error) { return storageFailure(error) }
    },
    async list(input) {
      try {
        const request = RepositoryListRequestSchema.parse(input); ledger.check(request)
        const entries: FileMeta[] = []
        const decisions: [string, string, boolean][] = []
        const observed = new Set<string>()
        const hiddenPaths = new Set<string>()
        let limitation: StorageFailure['code'] | undefined
        const visit = async (directory: string, prefix: string): Promise<void> => {
          ledger.check(request)
          for (const name of await boundedDirectory(directory, request, ledger)) {
            ledger.check(request)
            const path = prefix ? `${prefix}/${name}` : name
            const target = join(directory, name)
            const stat = await lstat(target)
            ledger.check(request)
            const hidden = excluded(path) || stat.isSymbolicLink() || ignored.isIgnored(target, stat.isDirectory())
            decisions.push([path, stat.isDirectory() ? 'directory' : stat.isSymbolicLink() ? 'symlink' : 'file', hidden])
            if (hidden) { hiddenPaths.add(path); continue }
            await checkedPath(root, path)
            if (stat.isDirectory()) { await visit(target, path); continue }
            if (!stat.isFile()) continue
            if (!inventory[path]) fail('mismatch', 'REVISION_MISMATCH')
            observed.add(path)
            if ((request.include.length === 0 || request.include.some(pattern => minimatch(path, pattern, { dot: true }))) && !request.exclude.some(pattern => minimatch(path, pattern, { dot: true }))) {
              ledger.charge(request, stat.size)
              entries.push({ path, kind: 'file', bytes: stat.size, content: inventory[path] })
            }
          }
        }
        const start = request.under === '.' ? root : await checkedPath(root, request.under)
        if (request.under !== '.' && (excluded(request.under) || ignored.isIgnored(start, true))) fail('denied', 'PATH_DENIED')
        try { await visit(start, request.under === '.' ? '' : request.under) } catch (error) {
          if (!(error instanceof StorageFault) || error.failure.status !== 'limit') throw error
          limitation = error.failure.code
        }
        if (!limitation) for (const path of Object.keys(inventory)) {
          const under = request.under === '.' || path.startsWith(`${request.under}/`)
          const parts = path.split('/')
          const hidden = parts.some((_, index) => hiddenPaths.has(parts.slice(0, index + 1).join('/')))
          if (under && !hidden && !excluded(path) && !ignored.isIgnored(join(root, path), false) && !observed.has(path)) fail('mismatch', 'REVISION_MISMATCH')
        }
        return { status: 'ok' as const, value: { entries: entries.sort((a,b) => a.path.localeCompare(b.path)), complete: limitation === undefined, ...(limitation ? { limitation } : {}), visibilityPolicyHash: rawByteHash(Buffer.from(JSON.stringify({ mode: ignored.mode, excludes: DEFAULT_SAFETY_EXCLUDES, decisions }))) } }
      } catch (error) { return storageFailure(error) }
    },
  } satisfies RepositoryReadV1)
}
