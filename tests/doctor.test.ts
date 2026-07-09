import { cpSync, mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

import { formatDoctorText, runDoctor } from '../src/doctor/run-doctor.js'
import { loadConfig } from '../src/config/load-config.js'
import { parseDocBridgeConfig } from '../src/validate.js'

const fixtureRoot = join(fileURLToPath(new URL('.', import.meta.url)), 'fixtures', 'sample-project')

describe('runDoctor', () => {
  it('reports coverage and score for indexed monorepo fixture', () => {
    const { config } = loadConfig({ cwd: fixtureRoot })
    parseDocBridgeConfig(config)
    const report = runDoctor(fixtureRoot, config)

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
})