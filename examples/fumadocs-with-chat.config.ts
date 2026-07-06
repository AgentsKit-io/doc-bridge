import { defineConfig } from 'doc-bridge'

/** Standard profile: monorepo + Fumadocs human bridge + optional chat (any provider) */
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
      apiKeyEnv: '', // local — no key
    },
    chat: {
      enabled: true,
      sources: ['agent', 'human'],
      handoffFirst: true,
    },
    runtime: 'agentskit',
  },
})