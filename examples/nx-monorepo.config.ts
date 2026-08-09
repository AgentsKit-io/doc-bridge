import { defineConfig } from '@agentskit/doc-bridge'

/** Nx — infer project ownership and available test/lint checks without executing Nx */
export default defineConfig({
  schemaVersion: 1,
  corpus: {
    agent: { root: 'docs/for-agents' },
  },
  routing: { plugin: 'nx' },
  gates: { preset: 'standard' },
})
