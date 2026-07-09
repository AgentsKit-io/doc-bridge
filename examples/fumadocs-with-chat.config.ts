import { defineConfig } from '@agentskit/doc-bridge'

/**
 * Standard profile: monorepo + Fumadocs human bridge + Layer 1 chat/RAG.
 * Requires optional peers:
 *   npm i -D @agentskit/rag @agentskit/ink @agentskit/adapters @agentskit/memory react
 * Then: ak-docs index && ak-docs rag ingest && ak-docs chat
 */
export default defineConfig({
  schemaVersion: 1,
  corpus: {
    agent: { root: 'docs/for-agents' },
    human: {
      plugin: 'fumadocs',
      options: {
        contentDir: 'apps/web/content/docs',
        urlPrefix: '/docs',
        metaFile: 'meta.json',
      },
    },
  },
  routing: { plugin: 'pnpm-monorepo' },
  gates: { preset: 'standard' },
  intelligence: {
    enabled: true,
    adapter: {
      provider: 'ollama',
      model: 'llama3.2',
      apiKeyEnv: '', // local — no cloud key
    },
    chat: {
      enabled: true,
      sources: ['agent', 'human'],
      handoffFirst: true,
    },
    retriever: {
      enabled: true,
      mode: 'agentskit-rag',
    },
    runtime: 'agentskit',
  },
})