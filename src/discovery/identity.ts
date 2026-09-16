import { sha256NormalizedV1 } from '../index-builder/content-hash.js'

/**
 * Entity and relation identity, in one place.
 *
 * Every analyzer and every projection has to agree on what a module or a document is called, or
 * the graph silently grows two nodes for one file and nothing joins. The hash suffix keeps a very
 * long path addressable without exceeding the schema's identifier bound.
 */

const MAX_ID_LENGTH = 256
const ID_HASH_LENGTH = 32

export const entityId = (kind: string, value: string): string => {
  const fullId = `${kind}:${value}`
  if (fullId.length <= MAX_ID_LENGTH) return fullId

  const suffix = `:${sha256NormalizedV1(fullId).slice(0, ID_HASH_LENGTH)}`
  return `${fullId.slice(0, MAX_ID_LENGTH - suffix.length)}${suffix}`
}

/** Identity of an observed relation: its endpoints and kind, plus an optional discriminator. */
export const relationId = (from: string, kind: string, to: string, discriminator?: string): string =>
  entityId('relation', discriminator ? `${from}:${kind}:${to}:${discriminator}` : `${from}:${kind}:${to}`)
