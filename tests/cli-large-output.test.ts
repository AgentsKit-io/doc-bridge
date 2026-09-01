import { spawnSync } from 'node:child_process'

import { describe, expect, it } from 'vitest'

describe('CLI large machine-readable output', () => {
  it('flushes a large documentation audit JSON response before exit', () => {
    const result = spawnSync(process.execPath, ['bin/ak-docs.js', 'audit', 'documentation', '--json'], {
      cwd: process.cwd(),
      encoding: 'utf8',
      maxBuffer: 10_000_000,
    })
    expect(result.status).toBe(0)
    expect(result.stderr).toBe('')
    expect(result.stdout.length).toBeGreaterThan(65_536)
    const payload = JSON.parse(result.stdout) as { readonly report?: { readonly documentAssessments?: unknown[] } }
    expect(payload.report?.documentAssessments?.length).toBeGreaterThan(0)
  }, 30_000)
})
