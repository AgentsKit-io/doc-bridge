import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import { defaultChecksForTarget, detectPackageManager } from '../src/lib/package-manager.js'

describe('package manager detection', () => {
  it('detects pnpm from lockfile', () => {
    const root = mkdtempSync(join(tmpdir(), 'ak-pm-pnpm-'))
    writeFileSync(join(root, 'pnpm-lock.yaml'), 'lockfileVersion: 9\n')
    expect(detectPackageManager(root)).toBe('pnpm')
  })

  it('emits pnpm --filter checks for workspace packages', () => {
    const root = mkdtempSync(join(tmpdir(), 'ak-pm-filter-'))
    writeFileSync(join(root, 'pnpm-workspace.yaml'), "packages:\n  - 'packages/*'\n")
    writeFileSync(join(root, 'package.json'), '{"name":"root","packageManager":"pnpm@10.0.0"}\n')
    const checks = defaultChecksForTarget(root, {
      packageId: 'core',
      packagePath: 'packages/core',
      packageName: '@agentskit/core',
      strict: true,
    })
    expect(checks[0]).toContain('pnpm --filter @agentskit/core test')
    expect(checks.some((c) => c.includes('lint'))).toBe(true)
  })

  it('falls back to npm test for plain npm projects', () => {
    const root = mkdtempSync(join(tmpdir(), 'ak-pm-npm-'))
    mkdirSync(root, { recursive: true })
    writeFileSync(join(root, 'package-lock.json'), '{}\n')
    expect(defaultChecksForTarget(root, { packageId: 'x', packagePath: 'src' })).toEqual(['npm test'])
  })
})
