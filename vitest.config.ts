import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    // Many tests build real fixture repositories and run the TypeScript checker; the CI
    // coverage pass is several times slower, so the 5s default flakes. Explicit larger
    // budgets on repository-scale tests still apply.
    testTimeout: 30_000,
    coverage: {
      provider: 'v8',
      include: ['src/**'],
      thresholds: {
        lines: 90,
        functions: 90,
        branches: 70,
        statements: 90,
      },
    },
  },
})
