import { createHash } from 'node:crypto'
import { z } from 'zod'

const sortValue = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(sortValue)
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>
    return Object.fromEntries(
      Object.keys(record)
        .sort()
        .map((key) => [key, sortValue(record[key])]),
    )
  }
  return value
}

export const canonicalJsonV1 = (payload: unknown): string => JSON.stringify(sortValue(payload))

export const sha256NormalizedV1 = (payload: unknown): string => {
  const normalized = canonicalJsonV1(payload)
  return createHash('sha256').update(normalized, 'utf8').digest('hex')
}

export const contentHashForArtifactV1 = <T extends { readonly contentHash: string }>(artifact: T): string => {
  const { contentHash: _contentHash, ...payload } = artifact
  return sha256NormalizedV1(payload)
}

export const LEGACY_HASH_ALGORITHM = 'sha256-normalized-v1' as const
export const SEMANTIC_HASH_ALGORITHM = 'sha256-semantic-v1' as const
export const VersionedHashAlgorithmSchema = z.enum([LEGACY_HASH_ALGORITHM, SEMANTIC_HASH_ALGORITHM], {
  error: 'Unsupported contentHashAlgo. Install a compatible doc-bridge version and explicitly regenerate with ak-docs index.',
})
export type HashAlgorithm = z.infer<typeof VersionedHashAlgorithmSchema>

/** Legacy seals remain byte-for-byte unchanged, including study and exact approval bindings. */
export const contentHashForVersionedArtifact = <T extends { readonly contentHash: string; readonly contentHashAlgo: string }>(artifact: T): string => {
  const algorithm = VersionedHashAlgorithmSchema.parse(artifact.contentHashAlgo)
  if (algorithm === LEGACY_HASH_ALGORITHM) return contentHashForArtifactV1(artifact)
  const { contentHash: _hash, sourceRevision: _revision, sourceRevisionKind: _kind, generatedAt: _generated, ...payload } = artifact as Record<string, unknown>
  if (Array.isArray(payload.coverage)) {
    payload.coverage = payload.coverage.filter((entry) => !(entry.analyzer === 'repository' && entry.scope === 'reused-entities'))
      .sort((a, b) => canonicalJsonV1(a).localeCompare(canonicalJsonV1(b)))
  }
  for (const key of ['entities', 'relations']) {
    if (Array.isArray(payload[key])) payload[key] = [...payload[key]].sort((a, b) => canonicalJsonV1(a).localeCompare(canonicalJsonV1(b)))
  }
  return sha256NormalizedV1(payload)
}

/** The legacy public index used a narrower projection than knowledge artifacts. */
export const contentHashForIndex = (index: import('../schemas/doc-bridge-index.js').DocBridgeIndexV1): string => {
  VersionedHashAlgorithmSchema.parse(index.contentHashAlgo)
  if (index.contentHashAlgo !== LEGACY_HASH_ALGORITHM) return contentHashForVersionedArtifact(index)
  return sha256NormalizedV1({
    schemaVersion: index.schemaVersion,
    knowledge: index.knowledge,
    handoffs: index.handoffs,
    lookup: index.lookup,
    retrieval: index.retrieval,
    ...(index.inputs ? { inputs: index.inputs } : {}),
    ...(index.projection ? { projection: index.projection.contentHash } : {}),
  })
}

export const sameHashIdentity = (left: { contentHash: string; contentHashAlgo: string }, right: { contentHash: string; contentHashAlgo: string }): boolean =>
  left.contentHashAlgo === right.contentHashAlgo && left.contentHash === right.contentHash
