import { defineConfig } from '@agentskit/doc-bridge'

/** Solo project — Layer 0 only, no LLM, no monorepo plugin */
export default defineConfig({
  schemaVersion: 1,
  corpus: {
    agent: {
      root: 'docs',
      index: 'docs/INDEX.md',
    },
  },
  gates: { preset: 'minimal' },
})