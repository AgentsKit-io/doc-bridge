import type { ExecutionProfile } from '../execution/profile.js'
import { z } from 'zod'

export const StorageHashSchema = z.string().regex(/^[a-f0-9]{64}$/)
export const StoragePathSchema = z.string().min(1).max(512).refine(path => !path.includes('\\') && !path.includes('\0') && !path.includes(':') && !path.startsWith('/') && path.split('/').every(part => part !== '' && part !== '.' && part !== '..'), 'Expected relative POSIX path')
export const PartitionSchema = z.object({ repositoryId: z.string().min(1).max(256), revision: z.string().min(1).max(256) }).strict()
export type Partition = Readonly<z.infer<typeof PartitionSchema>>
export const StorageLimitsSchema = z.object({ maxFiles: z.number().int().positive(), maxBytes: z.number().int().positive(), maxFileBytes: z.number().int().positive(), maxTimeMs: z.number().int().positive(), maxMemoryMb: z.number().positive() }).strict()
export type StorageLimits = Readonly<z.infer<typeof StorageLimitsSchema>>
export const StorageFailureCodeSchema = z.enum(['PARTITION_MISMATCH', 'CONTENT_MISMATCH', 'REVISION_MISMATCH', 'PATH_DENIED', 'NOT_FOUND', 'FILE_LIMIT', 'BYTE_LIMIT', 'TIME_LIMIT', 'MEMORY_LIMIT', 'ABORTED', 'IO_ERROR', 'INVALID_CONTRACT', 'CAS_CONFLICT'])
export const StorageFailureSchema = z.object({ status: z.enum(['missing', 'mismatch', 'denied', 'limit', 'cancelled', 'error']), code: StorageFailureCodeSchema }).strict()
export type StorageFailure = Readonly<z.infer<typeof StorageFailureSchema>>
export type StorageResult<T> = Readonly<{ status: 'ok'; value: T }> | StorageFailure
export const storageResultSchema = <T extends z.ZodType>(value: T) => z.union([z.object({ status: z.literal('ok'), value }).strict(), StorageFailureSchema])
export const ContentRefSchema = z.object({ algorithm: z.literal('sha256-normalized-v1'), hash: StorageHashSchema }).strict()
export type ContentRef = Readonly<z.infer<typeof ContentRefSchema>>
export const FileMetaSchema = z.object({ path: StoragePathSchema, kind: z.enum(['file', 'directory', 'symlink']), bytes: z.number().int().nonnegative(), content: ContentRefSchema.optional() }).strict()
export type FileMeta = Readonly<z.infer<typeof FileMetaSchema>>
export const StorageRequestSchema = z.object({ partition: PartitionSchema, signal: z.instanceof(AbortSignal) }).strict()
export type StorageRequest = Readonly<z.infer<typeof StorageRequestSchema> & { profile?: ExecutionProfile }>
const patterns = z.array(z.string().min(1).max(512)).max(128)
export const RepositoryListRequestSchema = StorageRequestSchema.extend({ under: z.union([z.literal('.'), StoragePathSchema]), include: patterns, exclude: patterns }).strict()
export const RepositoryStatRequestSchema = StorageRequestSchema.extend({ path: StoragePathSchema }).strict()
export const RepositoryReadRequestSchema = RepositoryStatRequestSchema.extend({ expected: ContentRefSchema.optional() }).strict()
export const RepositoryListingSchema = z.object({ entries: z.array(FileMetaSchema), complete: z.boolean(), limitation: StorageFailureCodeSchema.optional(), visibilityPolicyHash: StorageHashSchema }).strict().refine(value => value.complete ? value.limitation === undefined : value.limitation !== undefined, 'Partial listings require a limitation')
export type RepositoryListing = Readonly<Omit<z.infer<typeof RepositoryListingSchema>, 'entries'> & { entries: readonly FileMeta[] }>
export interface RepositoryReadV1 {
  readonly version: 1
  readonly partition: Partition
  readonly limits: StorageLimits
  list(request: z.infer<typeof RepositoryListRequestSchema>): Promise<StorageResult<RepositoryListing>>
  stat(request: z.infer<typeof RepositoryStatRequestSchema>): Promise<StorageResult<FileMeta>>
  read(request: z.infer<typeof RepositoryReadRequestSchema>): Promise<StorageResult<Readonly<{ bytes: Uint8Array; content: ContentRef }>>>
}
export const ArtifactKindSchema = z.enum(['snapshot', 'index', 'overlay', 'cache', 'approval', 'workflow', 'proposal'])
export type ArtifactKind = z.infer<typeof ArtifactKindSchema>
export const ArtifactKeySchema = z.object({ kind: ArtifactKindSchema, name: z.string().regex(/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,127}$/) }).strict()
export type ArtifactKey = Readonly<z.infer<typeof ArtifactKeySchema>>
export const ArtifactEnvelopeSchema = z.object({ ioVersion: z.literal(1), partition: PartitionSchema, key: ArtifactKeySchema, payloadSchema: z.string().min(1).max(128), payloadSchemaVersion: z.number().int().positive(), contentHashAlgo: z.enum(['sha256-normalized-v1', 'sha256-raw-v1']), contentHash: StorageHashSchema, byteHash: StorageHashSchema, payloadEncoding: z.enum(['json', 'base64']), payload: z.instanceof(Uint8Array) }).strict()
export type ArtifactEnvelope = Readonly<z.infer<typeof ArtifactEnvelopeSchema>>
export const ArtifactReadRequestSchema = StorageRequestSchema.extend({ key: ArtifactKeySchema }).strict()
export const ArtifactReplaceRequestSchema = StorageRequestSchema.extend({ artifact: ArtifactEnvelopeSchema, expectedPreviousByteHash: StorageHashSchema.nullable() }).strict()
export const ArtifactListRequestSchema = StorageRequestSchema.extend({ kind: ArtifactKindSchema, maxItems: z.number().int().positive() }).strict()
export interface ArtifactIOV1 {
  readonly version: 1
  readonly partition: Partition
  readonly limits: StorageLimits
  read(request: z.infer<typeof ArtifactReadRequestSchema>): Promise<StorageResult<ArtifactEnvelope>>
  replaceAtomic(request: z.infer<typeof ArtifactReplaceRequestSchema>): Promise<StorageResult<Readonly<{ byteHash: string }>>>
  list(request: z.infer<typeof ArtifactListRequestSchema>): Promise<StorageResult<readonly ArtifactKey[]>>
}
export const samePartition = (left: Partition, right: Partition): boolean => left.repositoryId === right.repositoryId && left.revision === right.revision
export const intersectStorageLimits = (...limits: readonly StorageLimits[]): StorageLimits => {
  if (!limits.length) throw new Error('INVALID_CONTRACT')
  limits.forEach(value => StorageLimitsSchema.parse(value))
  return Object.freeze(Object.fromEntries(Object.keys(limits[0]!).map(key => [key, Math.min(...limits.map(value => value[key as keyof StorageLimits]))])) as StorageLimits)
}
