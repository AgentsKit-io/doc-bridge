import { defineConfig } from '@agentskit/doc-bridge'

/** Starlight bridge only: no chat, no memory, no provider key. */
export default defineConfig({
  schemaVersion: 1,
  corpus: {
    agent: { root: 'docs/for-agents' },
    human: {
      plugin: 'starlight',
      options: {
        contentDir: 'src/content/docs',
        urlPrefix: '/docs',
      },
    },
  },
  gates: { preset: 'standard' },
})
