import { basename, dirname, extname, join, relative, resolve } from 'node:path'
import { toPosix } from '@agentskit/cross-platform'
import * as ts from 'typescript'
import { minimatch } from 'minimatch'
import { PartitionSchema, StorageLimitsSchema, FileMetaSchema, RepositoryListingSchema, type RepositoryReadV1 } from '../storage/contract.js'
import { StorageLedger, contentRef, StorageFault } from '../storage/local.js'
import type { SafeWalkOptions, SafeWalkResult } from '../safety/repository.js'
import type { ScanIO } from './scan-io.js'

/** All synchronous host operations consult this verified partition map only. */
export const preloadScan = async (read: RepositoryReadV1, signal: AbortSignal, root: string): Promise<ScanIO> => {
  if (read.version !== 1) throw new Error('INVALID_CONTRACT')
  PartitionSchema.parse(read.partition); StorageLimitsSchema.parse(read.limits)
  const request = { partition: read.partition, signal }
  const ledger = new StorageLedger(read.partition, read.limits)
  ledger.check(request)
  const listing = await read.list({ ...request, under: '.', include: [], exclude: [] })
  if (listing.status !== 'ok') throw new StorageFault(listing)
  RepositoryListingSchema.parse(listing.value)
  const files = new Map<string, { text: string; bytes: number }>()
  const directories = new Set([resolve(root)])
  for (const entry of listing.value.entries) {
    FileMetaSchema.parse(entry)
    ledger.entry(request)
    const absolute = resolve(root, entry.path)
    if (entry.kind === 'directory') directories.add(absolute)
    if (entry.kind !== 'file') continue
    const result = await read.read({ ...request, path: entry.path, ...(entry.content ? { expected: entry.content } : {}) })
    ledger.check(request)
    if (result.status !== 'ok') throw new StorageFault(result)
    ledger.charge(request, result.value.bytes.length)
    if (contentRef(result.value.bytes).hash !== result.value.content.hash) throw new Error('INVALID_READ_EVIDENCE')
    if (entry.content && entry.content.hash !== result.value.content.hash) throw new Error('CONTENT_MISMATCH')
    if (files.has(absolute)) throw new Error('DUPLICATE_INPUT')
    files.set(absolute, { text: Buffer.from(result.value.bytes).toString('utf8'), bytes: result.value.bytes.length })
    for (let directory = dirname(absolute); directory !== dirname(directory); directory = dirname(directory)) {
      directories.add(directory)
      if (directory === resolve(root)) break
    }
  }
  return { ...createScanMap(root, files, directories, { value: read.partition.revision, kind: 'content' }, listing.value.complete, listing.value.limitation, () => ledger.check(request)), visibilityPolicyHash: listing.value.visibilityPolicyHash }
}

export const createScanMap = (root: string, files: ReadonlyMap<string, { readonly text: string; readonly bytes: number }>, directories: ReadonlySet<string>, revision: { readonly value: string; readonly kind: 'git' | 'content' }, listingComplete = true, listingLimitation?: string, check = (): void => {}): ScanIO => {
  const pathOf = (path: string): string => toPosix(relative(root, path))
  const host: ts.ParseConfigHost & ts.ModuleResolutionHost = {
    useCaseSensitiveFileNames: true,
    fileExists: path => { check(); return files.has(resolve(path)) },
    readFile: path => { check(); return files.get(resolve(path))?.text },
    directoryExists: path => { check(); return directories.has(resolve(path)) },
    realpath: path => { check(); return resolve(path) },
    readDirectory: (directory, extensions, excludes, includes, depth) => {
      check()
      const base = resolve(directory)
      return [...files.keys()].filter(path => {
        const rel = toPosix(relative(base, path))
        if (rel === '..' || rel.startsWith('../') || rel.startsWith('/')) return false
        if (depth !== undefined && rel.split('/').length > depth) return false
        if (extensions?.length && !extensions.includes(extname(path))) return false
        const matches = (pattern: string) => minimatch(rel, pattern, { dot: true }) || minimatch(rel, `${pattern.replace(/\/$/, '')}/**/*`, { dot: true })
        return !(excludes ?? []).some(matches) && (!includes?.length || includes.some(matches))
      }).sort()
    },
  }
  const exists = (path: string): boolean => files.has(resolve(path)) || directories.has(resolve(path))
  return {
    host,
    revision: { value: revision.value, kind: revision.kind },
    readText(path) { check(); const file = files.get(resolve(path)); if (!file) throw new Error('NOT_FOUND'); return file.text },
    exists,
    workspaceDirectories(patterns) {
      const selected = new Set<string>()
      for (const pattern of patterns) {
        const normalized = pattern.replace(/\/$/, '')
        if (!normalized.includes('*')) { const path = join(root, normalized); if (exists(path)) selected.add(path); continue }
        const base = join(root, normalized.slice(0, normalized.indexOf('*')).replace(/\/$/, ''))
        for (const directory of directories) if (dirname(directory) === base) selected.add(directory)
      }
      return [...selected].sort()
    },
    packageManager() {
      if (exists(join(root, 'pnpm-lock.yaml')) || exists(join(root, 'pnpm-workspace.yaml'))) return 'pnpm'
      if (exists(join(root, 'yarn.lock'))) return 'yarn'
      if (exists(join(root, 'bun.lock')) || exists(join(root, 'bun.lockb'))) return 'bun'
      return 'npm'
    },
    walk(extensions: readonly string[], options: SafeWalkOptions): SafeWalkResult {
      const selected: string[] = []
      let bytes = 0
      let reason = listingComplete ? undefined : `Repository scan exceeded storage ${listingLimitation}.`
      for (const [path, file] of [...files].sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)) {
        if (!extensions.some(extension => basename(path).endsWith(extension)) || options.exclude?.some(pattern => minimatch(pathOf(path), pattern, { dot: true }))) continue
        if (selected.length >= (options.maxFiles ?? 10_000)) { reason = `Repository scan exceeded the ${options.maxFiles ?? 10_000} file limit.`; break }
        bytes += file.bytes
        if (options.maxBytes !== undefined && bytes > options.maxBytes) { reason = `Repository scan exceeded the ${options.maxBytes} byte limit.`; break }
        selected.push(path)
      }
      return { files: selected.sort(), incomplete: reason !== undefined, ...(reason ? { reason } : {}) }
    },
  }
}
