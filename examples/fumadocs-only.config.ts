import { defineConfig } from '@agentskit/doc-bridge'

/** Fumadocs bridge only: no chat, no memory, no provider key. */
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
  gates: { preset: 'standard' },
})
