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

export const sha256NormalizedV1 = (payload: unknown): string => {
  const normalized = JSON.stringify(sortValue(payload))
  return createHash('sha256').update(normalized, 'utf8').digest('hex')
}