import type { DocBridgeIndexV1 } from '../schemas/doc-bridge-index.js'
import { searchIndex, type SearchMatch } from '../query/search.js'

/**
 * Doc Bridge as a `Retriever`.
 *
 * The types below mirror `RetrievedDocument`, `RetrieverRequest` and `Retriever` from
 * `@agentskit/core`, which is an optional peer: a published type that only resolves when an
 * optional package is installed breaks a clean install. A test asserts assignability against the
 * real package and runs the real hybrid retriever over this one, so a drift fails there rather
 * than at a consumer.
 */
export type RetrievedDocument = {
  readonly id: string
  readonly content: string
  readonly source?: string
  readonly score?: number
  readonly metadata?: Record<string, unknown>
}

export type RetrieverRequest = {
  readonly query: string
  readonly messages: readonly unknown[]
}

export type Retriever = {
  readonly retrieve: (request: RetrieverRequest) => RetrievedDocument[] | Promise<RetrievedDocument[]>
}

export type DocBridgeRetrieverOptions = {
  readonly property?: string
  readonly limit?: number
  /** The `--agent` prior. */
  readonly agent?: boolean
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

export type DocBridgeRetriever = Retriever & {
  /** The original calling convention, kept: a query string and an optional limit. */
  readonly retrieve: ((request: RetrieverRequest) => RetrievedDocument[]) &
    ((query: string, options?: Pick<DocBridgeRetrieverOptions, 'limit'>) => RetrievedDocument[])
}

const chunkKey = (property: string, type: string, id: string): string => `${property}:${type}:${id}`

export const retrieveDocBridgeChunks = (
  index: DocBridgeIndexV1,
  query: string,
  options: DocBridgeRetrieverOptions = {},
): DocBridgeRetrievedChunk[] => {
  const property = options.property ?? index.project?.name ?? 'local'
  const limit = options.limit ?? 8

  return searchIndex(index, query, limit, options.agent ? { agent: true } : {}).map((match) => {
    const knowledge = index.knowledge.find((entry) => entry.id === match.id && entry.path === match.path)
    const owner = index.lookup?.ownership?.[match.id]
    const type = match.type === 'ownership' ? 'ownership' : (knowledge?.type ?? match.type)
    const summary = match.summary ?? owner?.purpose
    const title = knowledge?.title ?? index.projection?.entries.find((entry) => entry.id === match.entityId)?.title
    return {
      chunkKey: chunkKey(property, type, match.id),
      property,
      type,
      id: match.id,
      path: match.path,
      ...(title ? { title } : {}),
      ...(summary ? { summary } : {}),
      score: match.score,
    }
  })
}

/**
 * What a retrieved document's content is: the projected text, in the order a reader wants it.
 *
 * Title, then summary, then the search body — the same bounded text the ranker matched, so what
 * a model reads is what the score was computed over. Without a projection the record has only
 * its title and description, which is what the legacy index carried.
 */
const contentFor = (index: DocBridgeIndexV1, match: SearchMatch): string => {
  const entry = match.entityId ? index.projection?.entries.find((item) => item.id === match.entityId) : undefined
  if (entry) {
    return [entry.title, entry.summary, entry.fields.body].filter((part): part is string => Boolean(part && part.trim())).join('\n\n')
  }
  const knowledge = index.knowledge.find((item) => item.id === match.id && item.path === match.path)
  return [knowledge?.title ?? match.id, knowledge?.description ?? match.summary, knowledge?.body].filter((part): part is string => Boolean(part)).join('\n\n')
}

/**
 * Rank the index and return the results as `RetrievedDocument`s.
 *
 * `metadata` carries what the ecosystem consumers read after the content: the record kind, its
 * path, the evidence that backs it, the explanation of its rank and its confidence. A hybrid or
 * reranked retriever wraps this one with no adapter, because the shape is the contract's.
 */
export const retrieveDocBridgeDocuments = (
  index: DocBridgeIndexV1,
  query: string,
  options: DocBridgeRetrieverOptions = {},
): RetrievedDocument[] => {
  const limit = options.limit ?? 8
  return searchIndex(index, query, limit, { explain: true, ...(options.agent ? { agent: true } : {}) }).map((match) => ({
    id: match.entityId ?? match.id,
    content: contentFor(index, match),
    source: match.path,
    score: match.score,
    metadata: {
      kind: match.kind ?? match.type,
      type: match.type,
      id: match.id,
      path: match.path,
      ...(match.evidence ? { evidence: match.evidence } : {}),
      ...(match.explain ? { explain: match.explain } : {}),
      ...(match.confidence ? { confidence: match.confidence } : {}),
      ...(match.provenance ? { provenance: match.provenance } : {}),
    },
  }))
}

export const createDocBridgeRetriever = (index: DocBridgeIndexV1, options: DocBridgeRetrieverOptions = {}): DocBridgeRetriever => {
  const retrieve = (request: RetrieverRequest | string, req: Pick<DocBridgeRetrieverOptions, 'limit'> = {}): RetrievedDocument[] =>
    typeof request === 'string'
      ? retrieveDocBridgeDocuments(index, request, { ...options, ...req })
      : retrieveDocBridgeDocuments(index, request.query, options)
  return { retrieve: retrieve as DocBridgeRetriever['retrieve'] }
}

/**
 * The prose rendering of retrieved documents, as `formatRetrievedDocuments` in `@agentskit/core`
 * renders them: a numbered block per document, its source when it has one, then its content.
 * Mirrored for the same reason the types above are — the peer is optional and the knowledge
 * tools must render text without it — and asserted identical to the real function by test.
 */
export const formatRetrievedDocuments = (documents: readonly RetrievedDocument[]): string =>
  documents.length === 0
    ? ''
    : documents.map((document, position) => `[${position + 1}]\n${document.source ? `Source: ${document.source}\n` : ''}${document.content}`).join('\n\n')
