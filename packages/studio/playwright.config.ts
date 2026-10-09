import { defineConfig } from '@playwright/test'
export default defineConfig({ testDir: './tests', testMatch: '*.browser.ts', workers: 1, retries: 0, use: { headless: true, trace: 'off', actionTimeout: 10_000 }, reporter: 'list', timeout: 60_000 })
