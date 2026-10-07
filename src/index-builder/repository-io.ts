import { toPosix } from '@agentskit/cross-platform'
import { MAX_DOCUMENT_BYTES, MAX_CORPUS_BYTES, type TextReadBudget } from '../lib/bounded-text.js'
import type { DiscoverySnapshotV1 } from '../schemas/knowledge.js'
import { SOURCE_EXTENSIONS } from '../discovery/inputs.js'
import { markdownContentHash } from '../discovery/markdown.js'
import { posix } from 'node:path'
import { Minimatch } from 'minimatch'
import { samePartition, ContentRefSchema, type ContentRef, type Partition, type RepositoryReadV1, type StorageFailure, type StorageRequest } from '../storage/contract.js'

export type AvailabilityLimitation = StorageFailure & { readonly partition: Partition; readonly path: string }
export type SnapshotReadBinding = Readonly<{ partition: Partition; snapshotHash: string; visibilityPolicyHash: string }>

export type RepositoryFiles = ReadonlyMap<string, string>
// Scan-local path metadata proves directory existence without pretending unread source bytes exist.
const inventories = new WeakMap<RepositoryFiles, { paths: readonly string[]; sizes: ReadonlyMap<string, number> }>()

export const repositoryContainedPath = (root: string, path: string): string | undefined => {
  const target = posix.resolve(root, path)
  const relative = posix.relative(root, target)
  return relative === '..' || relative.startsWith('../') || posix.isAbsolute(relative) ? undefined : target
}

export const repositoryPath = (root: string, path: string): string => posix.relative(root, toPosix(path))
export const repositoryText = (files: RepositoryFiles, root: string, path: string): string => {
  const value = files.get(repositoryPath(root, path))
  if (value === undefined) throw new Error('Repository content unavailable')
  return value
}
/** Preserve local corpus/parser ceilings even when the caller grants larger storage limits. */
export const repositoryBoundedText = (files: RepositoryFiles, root: string, path: string, budget: TextReadBudget, maxFileBytes = MAX_DOCUMENT_BYTES, maxCorpusBytes = MAX_CORPUS_BYTES): string => {
  const text = repositoryText(files, root, path)
  const bytes = inventories.get(files)?.sizes.get(repositoryPath(root, path)) ?? Buffer.byteLength(text)
  if (bytes > maxFileBytes) throw new Error(`Documentation file exceeds the ${maxFileBytes} byte limit: ${path}`)
  if (budget.used + bytes > maxCorpusBytes) throw new Error(`Documentation corpus exceeds the ${maxCorpusBytes} byte read budget.`)
  budget.used += bytes
  return text
}
export const repositoryHas = (files: RepositoryFiles, root: string, path: string): boolean => {
  const relative = repositoryPath(root, path).replace(/\/$/, '')
  return relative === '' || files.has(relative) || (inventories.get(files)?.paths ?? [...files.keys()]).some(key => key === relative || key.startsWith(`${relative}/`))
}
export const repositoryWalk = (files: RepositoryFiles, root: string, under: string, extensions: readonly string[], skip = new Set(['node_modules', '.git', 'dist', 'coverage', '.doc-bridge'])): string[] => {
  const prefix = repositoryPath(root, under)
  const paths = [...files.keys()].filter(path => {
    const relative = prefix ? path.startsWith(`${prefix}/`) ? path.slice(prefix.length + 1) : undefined : path
    return relative !== undefined && !relative.split('/').slice(0, -1).some(part => skip.has(part)) && extensions.some(extension => path.endsWith(extension))
  }).map(path => posix.join(root, path)).sort()
  if (paths.length > 10_000) throw new Error('Documentation corpus exceeds the 10000 file limit.')
  return paths
}

/** Hydrate only selected, verified bytes; no native reads and no cross-revision fallback. */
export const readRepositoryFiles = async (
  reader: RepositoryReadV1,
  request: StorageRequest,
  include: readonly string[],
  documentationHashes: ReadonlyMap<string, string> = new Map(),
  sourceCapture?: { readonly snapshot: DiscoverySnapshotV1; readonly binding: SnapshotReadBinding; readonly consumedPaths: ReadonlySet<string> },
): Promise<{ files: Map<string, string>; contentRefs: Map<string, ContentRef>; byteSizes: Map<string, number>; limitations: AvailabilityLimitation[] }> => {
  const files = new Map<string, string>()
  const contentRefs = new Map<string, ContentRef>()
  const byteSizes = new Map<string, number>()
  const limitations: AvailabilityLimitation[] = []
  const note = (path: string, failure: StorageFailure) => limitations.push({ ...failure, partition: request.partition, path })
  if (!samePartition(reader.partition, request.partition)) {
    note('.', { status: 'denied', code: 'PARTITION_MISMATCH' })
    return { files, contentRefs, byteSizes, limitations }
  }
  const listed = await reader.list({ ...request, under: '.', include: [...include], exclude: [] })
  if (listed.status !== 'ok') note('.', listed)
  if (listed.status === 'ok' && !listed.value.complete) note('.', { status: 'limit', code: listed.value.limitation ?? 'FILE_LIMIT' })
  const entries = listed.status === 'ok' ? listed.value.entries : []
  for (const entry of entries) byteSizes.set(entry.path, entry.bytes)
  const patterns = include.map(pattern => new Minimatch(pattern, { dot: true }))
  const refs = new Map(entries.filter(entry => entry.kind === 'file' && patterns.some(pattern => pattern.match(entry.path))).map(entry => [entry.path, entry.content]))
  for (const path of documentationHashes.keys()) if (!refs.has(path)) refs.set(path, undefined)
  inventories.set(files, { paths: [...refs.keys()], sizes: byteSizes })
  const bound = sourceCapture && listed.status === 'ok' && listed.value.complete &&
    samePartition(sourceCapture.binding.partition, request.partition) &&
    sourceCapture.snapshot.sourceRevision === request.partition.revision &&
    sourceCapture.binding.snapshotHash === sourceCapture.snapshot.contentHash &&
    sourceCapture.binding.visibilityPolicyHash === listed.value.visibilityPolicyHash
  if (bound) {
    const evidenceHashes = new Map<string, Set<string>>()
    for (const entity of sourceCapture.snapshot.entities) for (const evidence of entity.evidence) {
      if (evidence.source !== 'code' || !evidence.path || !evidence.contentHash) continue
      const hashes = evidenceHashes.get(evidence.path) ?? new Set<string>()
      hashes.add(evidence.contentHash)
      evidenceHashes.set(evidence.path, hashes)
    }
    const inventoryMatches = [...evidenceHashes].every(([path, hashes]) => !SOURCE_EXTENSIONS.some(extension => path.endsWith(extension)) || (hashes.size === 1 && hashes.has(refs.get(path)?.hash ?? '')))
    for (const [path, ref] of refs) {
      if (!inventoryMatches || !ref || !ContentRefSchema.safeParse(ref).success || documentationHashes.has(path) || sourceCapture.consumedPaths.has(path) || !SOURCE_EXTENSIONS.some(extension => path.endsWith(extension))) continue
      const hashes = evidenceHashes.get(path)
      if (hashes?.size === 1 && hashes.has(ref.hash)) { contentRefs.set(path, ref); refs.delete(path) }
    }
  }
  const selections = [...refs].sort(([a], [b]) => a.localeCompare(b))
  // ponytail: 16 concurrent verified reads; caller capability budgets still bound total bytes.
  for (let offset = 0; offset < selections.length; offset += 16) {
    const results = await Promise.all(selections.slice(offset, offset + 16).map(async ([path, listedRef]) => {
      let ref = listedRef
      if (!ref) {
        const stat = await reader.stat({ ...request, path })
        if (stat.status !== 'ok') return { path, failure: stat }
        ref = stat.value.content
      }
      if (!ContentRefSchema.safeParse(ref).success) return { path, failure: { status: 'denied', code: 'INVALID_CONTRACT' } as const }
      if (!ref) return { path, failure: { status: 'denied', code: 'INVALID_CONTRACT' } as const }
      const result = await reader.read({ ...request, path, expected: ref })
      if (result.status !== 'ok') return { path, failure: result }
      if (!(result.value.bytes instanceof Uint8Array)) return { path, failure: { status: 'denied', code: 'INVALID_CONTRACT' } as const }
      const bytes = result.value.bytes
      const text = Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength).toString('utf8')
      if (result.value.content.algorithm !== ref.algorithm || result.value.content.hash !== ref.hash) return { path, failure: { status: 'mismatch', code: 'CONTENT_MISMATCH' } as const }
      const documentHash = documentationHashes.get(path)
      if (documentHash && (text.charCodeAt(0) === 0xFEFF ? markdownContentHash(text) : result.value.content.hash) !== documentHash) return { path, failure: { status: 'mismatch', code: 'CONTENT_MISMATCH' } as const }
      return { path, text, content: result.value.content, bytes: result.value.bytes.length }
    }))
    for (const result of results) {
      if (result.failure) note(result.path, result.failure)
      else if (result.text !== undefined && result.content) { files.set(result.path, result.text); contentRefs.set(result.path, result.content); byteSizes.set(result.path, result.bytes) }
    }
    if (limitations.some(limitation => limitation.status === 'limit' || limitation.status === 'cancelled')) break
  }
  return { files, contentRefs, byteSizes, limitations }
}

export const INDEX_READ_PATTERNS = ['**/*.md', '**/*.mdx', '**/*.ts', '**/*.tsx', '**/*.js', '**/*.jsx', '**/*.mjs', '**/*.cjs', '**/*.mts', '**/*.cts', '**/*.json', '**/*.yaml', '**/*.yml', '**/*.lock', '**/bun.lockb'] as const
