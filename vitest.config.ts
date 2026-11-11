import { configDefaults, defineConfig } from 'vitest/config'

const pullRequest = process.env.CI_TEST_PROFILE === 'pr'

export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts', 'tests/**/*.test.tsx'],
    // Many tests build real fixture repositories and run the TypeScript checker; the CI
    // coverage pass is several times slower, so the 5s default flakes. Explicit larger
    // budgets on repository-scale tests still apply.
    testTimeout: pullRequest ? Math.min(10_000, 30_000) : 30_000,
    slowTestThreshold: 2_000,
    // The shared pipeline exports FORCE_COLOR; frame assertions expect plain text.
    env: { FORCE_COLOR: '0' },
    exclude: pullRequest ? [...configDefaults.exclude, '**/*.slow.test.*'] : configDefaults.exclude,
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
