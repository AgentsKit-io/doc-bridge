import { defineConfig } from '@agentskit/doc-bridge'

/** Docusaurus bridge only: no chat, no memory, no provider key. */
export default defineConfig({
  schemaVersion: 1,
  corpus: {
    agent: { root: 'docs/for-agents' },
    human: {
      plugin: 'docusaurus',
      options: {
        docsDir: 'website/docs',
        sidebarsFile: 'website/sidebars.js',
        urlPrefix: '/docs',
      },
    },
  },
  gates: { preset: 'standard' },
})
