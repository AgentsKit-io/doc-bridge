import { createArtifactEnvelope } from '../storage/artifacts.js'
import { samePartition, type ArtifactIOV1, type ArtifactKey, type StorageRequest, type StorageResult } from '../storage/contract.js'

/** Partition and payload metadata are checked here even for caller-provided stores. */
export const readJsonArtifact = async <T>(
  io: ArtifactIOV1,
  request: StorageRequest,
  key: ArtifactKey,
  payloadSchema: string,
  parse: (value: unknown) => T,
): Promise<StorageResult<{ value: T; byteHash: string }>> => {
  if (!samePartition(io.partition, request.partition)) return { status: 'denied', code: 'PARTITION_MISMATCH' }
  const result = await io.read({ ...request, key })
  if (result.status !== 'ok') return result
  const artifact = result.value
  if (!samePartition(artifact.partition, request.partition)) return { status: 'denied', code: 'PARTITION_MISMATCH' }
  if (artifact.key.kind !== key.kind || artifact.key.name !== key.name || artifact.payloadSchema !== payloadSchema || artifact.payloadSchemaVersion !== 1 || artifact.payloadEncoding !== 'json') return { status: 'denied', code: 'INVALID_CONTRACT' }
  try {
    const expected = createArtifactEnvelope(artifact)
    if (expected.byteHash !== artifact.byteHash || expected.contentHash !== artifact.contentHash) return { status: 'mismatch', code: 'CONTENT_MISMATCH' }
    return { status: 'ok', value: { value: parse(JSON.parse(Buffer.from(artifact.payload).toString('utf8'))), byteHash: artifact.byteHash } }
  } catch { return { status: 'denied', code: 'INVALID_CONTRACT' } }
}

export const writeJsonArtifact = async (
  io: ArtifactIOV1,
  request: StorageRequest,
  key: ArtifactKey,
  payloadSchema: string,
  value: unknown,
  expectedPreviousByteHash: string | null,
): Promise<StorageResult<{ byteHash: string }>> => {
  if (!samePartition(io.partition, request.partition)) return { status: 'denied', code: 'PARTITION_MISMATCH' }
  try {
    const artifact = createArtifactEnvelope({ ioVersion: 1, partition: request.partition, key, payloadSchema, payloadSchemaVersion: 1, contentHashAlgo: 'sha256-normalized-v1', payloadEncoding: 'json', payload: Buffer.from(JSON.stringify(value)) })
    return await io.replaceAtomic({ ...request, artifact, expectedPreviousByteHash })
  } catch { return { status: 'denied', code: 'INVALID_CONTRACT' } }
}
