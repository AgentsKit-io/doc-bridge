import { createHash } from 'node:crypto'

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
