import { defineConfig } from '@agentskit/doc-bridge'

/** Nextra bridge only: no chat, no memory, no provider key. */
export default defineConfig({
  schemaVersion: 1,
  corpus: {
    agent: { root: 'docs/for-agents' },
    human: {
      plugin: 'nextra',
      options: {
        contentDir: 'content',
        contentDirBasePath: '/docs',
      },
    },
  },
  gates: { preset: 'standard' },
})
