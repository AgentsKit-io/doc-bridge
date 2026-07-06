/**
 * Appendix: AgentsKit OS consumer profile (reference scale).
 * Not the default quick start — see minimal-plain-markdown.config.ts first.
 */
import { defineConfig } from '@agentskit/doc-bridge'

export default defineConfig({
  schemaVersion: 1,
  project: { name: 'agentskit-os' },
  corpus: {
    agent: { root: 'docs/for-agents', okf: { requireType: false } },
    human: {
      plugin: 'fumadocs',
      options: {
        contentDir: 'apps/web/content/docs',
        urlPrefix: '/docs',
      },
    },
  },
  index: {
    outFile: 'docs/internal/index.generated.json',
    llmsTxt: { outFile: 'llms.txt' },
  },
  routing: {
    plugin: 'pnpm-monorepo',
    options: { packages: ['packages/*', 'apps/*'] },
  },
  gates: { preset: 'strict' },
  federation: {
    enabled: true,
    sources: [
      { id: 'playbook', llmsTxt: 'https://playbook.agentskit.io/llms.txt', includeInRetriever: true },
    ],
  },
  intelligence: {
    enabled: true,
    adapter: { provider: 'openrouter', apiKeyEnv: 'OPENROUTER_API_KEY' },
    chat: { enabled: true, handoffFirst: true, sources: ['agent', 'human', 'federation'] },
    memory: { enabled: true, adapters: ['cursor-rules', 'playbook-memory'], classify: false },
    runtime: 'agentskit',
  },
})