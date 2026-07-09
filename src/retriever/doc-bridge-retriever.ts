import type { DocBridgeIndexV1 } from '../schemas/doc-bridge-index.js'
import { searchIndex } from '../query/search.js'

export type DocBridgeRetrieverOptions = {
  readonly property?: string
  readonly limit?: number
}

export type DocBridgeRetrievedChunk = {
  readonly chunkKey: string
  readonly property: string
  readonly type: string
  readonly id: string
  readonly path: string
  readonly title?: string
  readonly summary?: string
  readonly score: number
}

export type DocBridgeRetriever = {
  readonly retrieve: (
    query: string,
    options?: Pick<DocBridgeRetrieverOptions, 'limit'>,
  ) => DocBridgeRetrievedChunk[]
}

const chunkKey = (property: string, type: string, id: string): string =>
  `${property}:${type}:${id}`

export const retrieveDocBridgeChunks = (
  index: DocBridgeIndexV1,
  query: string,
  options: DocBridgeRetrieverOptions = {},
): DocBridgeRetrievedChunk[] => {
  const property = options.property ?? index.project?.name ?? 'local'
  const limit = options.limit ?? 8

  return searchIndex(index, query, limit).map((match) => {
    const knowledge = index.knowledge.find((entry) => entry.id === match.id && entry.path === match.path)
    const owner = index.lookup?.ownership?.[match.id]
    const type = match.type === 'ownership' ? 'ownership' : (knowledge?.type ?? match.type)
    const summary = match.summary ?? owner?.purpose
    return {
      chunkKey: chunkKey(property, type, match.id),
      property,
      type,
      id: match.id,
      path: match.path,
      ...(knowledge?.title ? { title: knowledge.title } : {}),
      ...(summary ? { summary } : {}),
      score: match.score,
    }
  })
}

export const createDocBridgeRetriever = (
  index: DocBridgeIndexV1,
  options: DocBridgeRetrieverOptions = {},
): DocBridgeRetriever => ({
  retrieve: (query, req = {}) =>
    retrieveDocBridgeChunks(index, query, { ...options, ...req }),
})
