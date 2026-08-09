import { defineConfig } from '@agentskit/doc-bridge'

/** VitePress bridge only: no chat, no memory, no provider key. */
export default defineConfig({
  schemaVersion: 1,
  corpus: {
    agent: { root: 'docs/for-agents' },
    human: {
      plugin: 'vitepress',
      options: {
        docsDir: 'docs',
        urlPrefix: '/docs',
        cleanUrls: true,
        srcExclude: ['archive/**'],
      },
    },
  },
  gates: { preset: 'standard' },
})
