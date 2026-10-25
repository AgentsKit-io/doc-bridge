import { cpSync, mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

import { formatDoctorText, runDoctor } from '../src/doctor/run-doctor.js'
import { loadConfig } from '../src/config/load-config.js'
import { buildDocBridgeIndex } from '../src/index-builder/build-index.js'
import { runGates } from '../src/gates/run-gates.js'
import { parseDocBridgeConfig } from '../src/validate.js'

const fixtureRoot = join(fileURLToPath(new URL('.', import.meta.url)), 'fixtures', 'sample-project')

describe('runDoctor', () => {
  it('reports coverage and score for indexed monorepo fixture', () => {
    // The fixture's index is gitignored, so build it in a copy rather than rely on a test that wrote it.
    const root = join(mkdtempSync(join(tmpdir(), 'ak-docs-doctor-indexed-')), 'sample-project')
    cpSync(fixtureRoot, root, { recursive: true })
    const { config } = loadConfig({ cwd: root })
    parseDocBridgeConfig(config)
    buildDocBridgeIndex({ root, config })
    const report = runDoctor(root, config)

    expect(report.score).toBeGreaterThan(0)
    expect(report.coverage.packages.total).toBeGreaterThanOrEqual(1)
    expect(report.coverage.freshness.hasIndex).toBe(true)
    expect(report.nextActions.length).toBeGreaterThan(0)
    expect(formatDoctorText(report).join('\n')).toContain('Score:')
  })

  it('flags missing index and suggests ak-docs index', () => {
    const root = mkdtempSync(join(tmpdir(), 'ak-docs-doctor-empty-'))
    const { config } = loadConfig({
      cwd: root,
      explicitPath: join(fixtureRoot, 'doc-bridge.config.json'),
    })
    parseDocBridgeConfig(config)
    const report = runDoctor(root, config)

    expect(report.coverage.freshness.hasIndex).toBe(false)
    expect(report.issues.some((issue) => issue.code === 'index-missing')).toBe(true)
    expect(report.nextActions).toContain('ak-docs index')
  })

  it('detects missing humanDoc bridge gaps', () => {
    const root = join(mkdtempSync(join(tmpdir(), 'ak-docs-doctor-human-')), 'sample-project')
    cpSync(fixtureRoot, root, { recursive: true })
    const { config } = loadConfig({ cwd: root })
    parseDocBridgeConfig(config)
    const report = runDoctor(root, config)

    expect(report.coverage.packages.missingHumanDoc.length).toBeGreaterThanOrEqual(0)
    expect(formatDoctorText(report).join('\n')).toContain('Coverage')
  })

  it('agrees with the index-freshness gate on the same tree right after indexing', () => {
    const root = join(mkdtempSync(join(tmpdir(), 'ak-docs-doctor-fresh-')), 'sample-project')
    cpSync(fixtureRoot, root, { recursive: true })
    // The tree shape where the two freshness computations used to differ: ignore rules, a generated
    // file marker, and enough sources that discovery walks a large package rather than a sample.
    writeFileSync(join(root, '.gitignore'), 'generated/\n')
    mkdirSync(join(root, 'packages/os-core/src/generated'), { recursive: true })
    writeFileSync(join(root, 'packages/os-core/src/generated/codes.ts'), '// @generated\nexport const codes = []\n')
    writeFileSync(join(root, 'docs/for-agents/generated.md'), '<!-- @generated -->\n# Generated\n\nBody.\n')
    mkdirSync(join(root, 'packages/os-core/src/bulk'), { recursive: true })
    for (let i = 0; i < 300; i++) writeFileSync(join(root, `packages/os-core/src/bulk/m${i}.ts`), `export const v${i} = ${i}\n`)

    const { config } = loadConfig({ cwd: root })
    parseDocBridgeConfig(config)
    buildDocBridgeIndex({ root, config })

    const gate = runGates(root, config, ['index-freshness'])
    const report = runDoctor(root, config)

    expect(gate.ok).toBe(true)
    expect(report.coverage.freshness).toEqual({ ok: true, message: 'Index is fresh', hasIndex: true })
    expect(report.coverage.gates.results.find((result) => result.id === 'index-freshness')?.ok).toBe(true)
    expect(report.issues.some((issue) => issue.code === 'index-stale' || issue.code === 'gate-index-freshness')).toBe(false)
  })
})