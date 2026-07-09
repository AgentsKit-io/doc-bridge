import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import type { DocBridgeConfigV1 } from '../config/schema.js'
import type { DocBridgeIndexV1 } from '../schemas/doc-bridge-index.js'
import { defaultVectorStorePath, resolveIntelligenceRuntime } from './adapter.js'
import { importPeer } from './peers.js'

export type RagSearchHit = {
  readonly id?: string
  readonly content: string
  readonly score?: number
  readonly source?: string
  readonly metadata?: Record<string, unknown>
}

export type DocBridgeRag = {
  readonly ingest: () => Promise<{ documentCount: number; storePath: string }>
  readonly search: (query: string, topK?: number) => Promise<RagSearchHit[]>
  readonly retriever: unknown
  readonly storePath: string
}

const loadDocuments = (
  root: string,
  index: DocBridgeIndexV1,
  sources: readonly string[],
): Array<{ id: string; content: string; source: string; metadata: Record<string, unknown> }> => {
  const includeAgent = sources.includes('agent') || sources.length === 0
  const docs: Array<{ id: string; content: string; source: string; metadata: Record<string, unknown> }> = []

  if (includeAgent) {
    for (const entry of index.knowledge) {
      const abs = join(root, entry.path)
      let content = ''
      try {
        content = readFileSync(abs, 'utf8')
      } catch {
        content = [entry.title, entry.description].filter(Boolean).join('\n\n')
      }
      docs.push({
        id: entry.id,
        content,
        source: entry.path,
        metadata: { type: entry.type, title: entry.title, path: entry.path },
      })
    }
  }

  // Human corpus is linked via humanDoc URLs; optional future: ingest human paths from adapters
  return docs
}

export const createDocBridgeRag = async (
  root: string,
  config: DocBridgeConfigV1,
  index: DocBridgeIndexV1,
): Promise<DocBridgeRag> => {
  const { embed } = await resolveIntelligenceRuntime(config)
  const ragMod = await importPeer<typeof import('@agentskit/rag')>('@agentskit/rag')
  const memoryMod = await importPeer<typeof import('@agentskit/memory')>('@agentskit/memory')

  const storePath =
    typeof config.intelligence?.retriever?.options?.storePath === 'string'
      ? join(root, config.intelligence.retriever.options.storePath)
      : defaultVectorStorePath(root)

  const store = memoryMod.fileVectorMemory({ path: storePath })
  const rag = ragMod.createRAG({
    embed,
    store,
    topK: 6,
    chunkSize: 900,
    chunkOverlap: 120,
  })

  const sources = config.intelligence?.chat?.sources ?? ['agent', 'human']

  return {
    storePath,
    retriever: rag,
    ingest: async () => {
      const documents = loadDocuments(root, index, sources)
      await rag.ingest(documents)
      return { documentCount: documents.length, storePath }
    },
    search: async (query, topK = 6) => {
      const hits = await rag.search(query, { topK })
      return hits.map((hit) => ({
        ...(hit.id ? { id: hit.id } : {}),
        content: hit.content,
        ...(hit.score !== undefined ? { score: hit.score } : {}),
        ...(hit.source ? { source: hit.source } : {}),
        ...(hit.metadata ? { metadata: hit.metadata } : {}),
      }))
    },
  }
}
