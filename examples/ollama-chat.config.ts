import { defineConfig } from '@agentskit/doc-bridge/config'

/**
 * Local Ollama chat demo — zero cloud API key.
 *
 * Prerequisites:
 *   ollama serve
 *   ollama pull llama3.2
 *   ollama pull nomic-embed-text
 *   npm i -D @agentskit/rag @agentskit/ink @agentskit/adapters @agentskit/memory react
 *
 * Then:
 *   ak-docs index
 *   ak-docs rag ingest
 *   ak-docs ask "who owns auth?" --chat
 *   ak-docs chat
 */
export default defineConfig({
  schemaVersion: 1,
  corpus: {
    agent: { root: 'docs/for-agents' },
  },
  intelligence: {
    enabled: true,
    adapter: {
      provider: 'ollama',
      model: 'llama3.2',
      baseUrl: 'http://127.0.0.1:11434',
      options: { embedModel: 'nomic-embed-text' },
    },
    chat: {
      enabled: true,
      sources: ['agent'],
      handoffFirst: true,
    },
    retriever: {
      enabled: true,
      mode: 'agentskit-rag',
    },
    runtime: 'agentskit',
  },
})