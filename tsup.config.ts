import { defineConfig } from 'tsup'

export default defineConfig({
  entry: {
    index: 'src/index.ts',
    'config/index': 'src/config/index.ts',
    'cli/program': 'src/cli/program.ts',
    'cli/ui/app': 'src/cli/ui/app.tsx',
    'llm/program': 'src/fixes/llm-cli.ts',
  },
  format: ['esm'],
  dts: true,
  sourcemap: true,
  clean: true,
  splitting: false,
  target: 'node22',
  external: ['typescript', '@agentskit/adapters', '@agentskit/core', 'react', 'ink', '@agentskit/ink'],
})
