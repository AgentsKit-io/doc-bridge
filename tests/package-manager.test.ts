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

  it('detects yarn, bun, and packageManager metadata when lockfiles are absent', () => {
    const yarnRoot = mkdtempSync(join(tmpdir(), 'ak-pm-yarn-'))
    writeFileSync(join(yarnRoot, 'yarn.lock'), '# yarn\n')
    expect(detectPackageManager(yarnRoot)).toBe('yarn')

    const bunRoot = mkdtempSync(join(tmpdir(), 'ak-pm-bun-'))
    writeFileSync(join(bunRoot, 'bun.lock'), '# bun\n')
    expect(detectPackageManager(bunRoot)).toBe('bun')

    const metadataRoot = mkdtempSync(join(tmpdir(), 'ak-pm-meta-'))
    writeFileSync(join(metadataRoot, 'package.json'), '{"packageManager":"yarn@4.0.0"}\n')
    expect(detectPackageManager(metadataRoot)).toBe('yarn')
  })

  it('uses project-level doc checks for markdown ownership targets', () => {
    const root = mkdtempSync(join(tmpdir(), 'ak-pm-docs-'))
    writeFileSync(
      join(root, 'package.json'),
      JSON.stringify({ scripts: { 'docs:bridge:gate': 'ak-docs gate run', test: 'vitest' } }),
    )

    expect(defaultChecksForTarget(root, { packageId: 'playbook', packagePath: 'docs/playbook.md' })).toEqual([
      'pnpm run docs:bridge:gate',
    ])

    writeFileSync(join(root, 'package.json'), JSON.stringify({ scripts: { 'check:okf-type': 'ak-docs gate okf' } }))
    expect(defaultChecksForTarget(root, { packageId: 'playbook', packagePath: 'docs/pillars/a.mdx' })).toEqual([
      'pnpm run check:okf-type',
    ])
  })

  it('emits workspace checks for yarn, bun, and npm projects', () => {
    const yarnRoot = mkdtempSync(join(tmpdir(), 'ak-pm-yarn-workspace-'))
    writeFileSync(join(yarnRoot, 'yarn.lock'), '# yarn\n')
    writeFileSync(join(yarnRoot, 'package.json'), '{"workspaces":["packages/*"]}\n')
    expect(
      defaultChecksForTarget(yarnRoot, { packageId: 'core', packagePath: 'packages/core', strict: true }),
    ).toEqual(['yarn workspace core test', 'yarn workspace core lint'])

    const bunRoot = mkdtempSync(join(tmpdir(), 'ak-pm-bun-checks-'))
    writeFileSync(join(bunRoot, 'bun.lockb'), '')
    expect(defaultChecksForTarget(bunRoot, { packageId: 'core', packagePath: 'src', strict: true })).toEqual([
      'bun test',
      'bun run lint',
    ])

    const npmRoot = mkdtempSync(join(tmpdir(), 'ak-pm-npm-workspace-'))
    writeFileSync(join(npmRoot, 'lerna.json'), '{}\n')
    writeFileSync(join(npmRoot, 'package-lock.json'), '{}\n')
    expect(
      defaultChecksForTarget(npmRoot, { packageId: 'web', packagePath: 'apps/web', strict: true }),
    ).toEqual(['npm test -w web', 'npm run lint -w web'])
  })
})
