/** Ambient types for optional Layer-1 peers (not installed with Layer 0). */

declare module '@agentskit/rag' {
  export type InputDocument = {
    id?: string
    content: string
    source?: string
    metadata?: Record<string, unknown>
  }
  export type RAG = {
    ingest: (documents: InputDocument[]) => Promise<void>
    search: (
      query: string,
      options?: { topK?: number; threshold?: number },
    ) => Promise<
      ReadonlyArray<{
        id?: string
        content: string
        score?: number
        metadata?: Record<string, unknown>
        source?: string
      }>
    >
    retrieve: (request: { query: string }) => Promise<unknown[]>
  }
  export function createRAG(config: {
    embed: unknown
    store: unknown
    chunkSize?: number
    chunkOverlap?: number
    topK?: number
  }): RAG
}

declare module '@agentskit/memory' {
  export function fileVectorMemory(options: { path: string }): unknown
}

declare module '@agentskit/adapters' {
  export function ollama(options: { model?: string; baseUrl?: string }): unknown
  export function openai(options: { apiKey: string; model?: string; baseUrl?: string }): unknown
  export function anthropic(options: { apiKey: string; model?: string }): unknown
  export function openrouter(options: { apiKey: string; model?: string }): unknown
  export function ollamaEmbedder(options?: { model?: string; baseUrl?: string }): unknown
  export function openaiEmbedder(options: { apiKey: string; model?: string }): unknown
}

declare module '@agentskit/core' {
  export function createChatController(config: Record<string, unknown>): {
    send: (input: string) => Promise<{ content?: string; messages?: unknown[] }>
    messages?: unknown[]
  }
  export function formatRetrievedDocuments(docs: unknown[]): string
  export function createStaticRetriever(docs: unknown[]): unknown
}

declare module '@agentskit/ink' {
  export function useChat(config: Record<string, unknown>): {
    messages: ReadonlyArray<{ id: string; role: string; content: string }>
    send: (input: string) => Promise<void>
    isStreaming?: boolean
  }
  export const ChatContainer: unknown
  export const Message: unknown
  export const InputBar: unknown
}

declare module 'ink' {
  export function render(node: unknown): { unmount: () => void; waitUntilExit: () => Promise<void> }
}

declare module 'react' {
  export function createElement(
    type: unknown,
    props?: Record<string, unknown> | null,
    ...children: unknown[]
  ): unknown
  const React: { createElement: typeof createElement }
  export default React
}
