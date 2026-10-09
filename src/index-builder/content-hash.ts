import { createHash } from 'node:crypto'
import { z } from 'zod'

const sortValue = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(sortValue)
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>
    const sorted: Record<string, unknown> = {}
    for (const key of Object.keys(record).sort()) {
      const value = sortValue(record[key])
      if (key === '__proto__') Object.defineProperty(sorted, key, { value, enumerable: true, writable: true, configurable: true })
      else sorted[key] = value
    }
    return sorted
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
  const hash = createHash('sha256')
  // JSON object ordering puts integer keys first, even after lexical insertion.
  const keys = Object.keys(Object.fromEntries(Object.keys(payload).sort().map(key => [key, null])))
  hash.update('{')
  let separator = ''
  for (const key of keys) {
    const value = payload[key]
    const orderedArray = Array.isArray(value) && ['coverage', 'entities', 'relations'].includes(key)
    const json = orderedArray ? undefined : canonicalJsonV1(value)
    if (!orderedArray && json === undefined) continue
    hash.update(`${separator}${JSON.stringify(key)}:`)
    separator = ','
    if (orderedArray) {
      const entries = (key === 'coverage' ? value.filter(entry => !(entry.analyzer === 'repository' && entry.scope === 'reused-entities')) : value)
        .map(canonicalJsonV1).sort((a, b) => a.localeCompare(b))
      hash.update('[')
      for (let i = 0; i < entries.length; i++) hash.update(`${i ? ',' : ''}${entries[i]}`)
      hash.update(']')
    } else hash.update(json!)
  }
  return hash.update('}').digest('hex')
}

/** The legacy public index used a narrower projection than knowledge artifacts. */
export const contentHashForIndex = (index: import('../schemas/doc-bridge-index.js').DocBridgeIndexV1): string => {
  VersionedHashAlgorithmSchema.parse(index.contentHashAlgo)
  if (index.knowledgeEntities && index.contentHashAlgo === LEGACY_HASH_ALGORITHM) throw new Error('Knowledge entities require sha256-semantic-v1; disable entities for legacy index readers.')
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
