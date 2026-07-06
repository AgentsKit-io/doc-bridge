import { defineConfig } from '@agentskit/doc-bridge'

/** Monorepo — ownership routing, standard gates, still no LLM */
export default defineConfig({
  schemaVersion: 1,
  corpus: {
    agent: { root: 'docs/for-agents' },
  },
  routing: {
    plugin: 'pnpm-monorepo',
    options: {
      packages: ['packages/*', 'apps/*'],
    },
  },
  gates: { preset: 'standard' },
  surfaces: {
    mcp: { enabled: true, tools: ['handoff.resolve', 'doc.search', 'doc.get'] },
  },
})