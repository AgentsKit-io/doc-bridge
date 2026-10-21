import { defineConfig } from 'tsup'

export default defineConfig({
  entry: {
    index: 'src/index.ts',
    'config/index': 'src/config/index.ts',
    'cli/program': 'src/cli/program.ts',
    'cli/ui/index': 'src/cli/ui/index.ts',
    'llm/program': 'src/fixes/llm-cli.ts',
  },
  format: ['esm'],
  dts: true,
  sourcemap: true,
  clean: true,
  // Splitting keeps the Ink views in their own chunk: plain runs (agents, CI) never load them.
  splitting: true,
  target: 'node22',
  external: ['typescript', '@agentskit/adapters', '@agentskit/core'],
})
