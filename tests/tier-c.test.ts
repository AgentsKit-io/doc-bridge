import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import { runCli } from '../src/cli/program.js'
import {
  DOC_BRIDGE_PATTERN_ID,
  docBridgePatternMarkdown,
  docBridgePatternPayload,
} from '../src/playbook/doc-bridge-pattern.js'
import { PACKAGE_VERSION } from '../src/version.js'
import pkg from '../package.json' with { type: 'json' }

const fixtureRoot = join(import.meta.dirname, 'fixtures', 'sample-project')

const captureStdout = (fn: () => number | undefined) => {
  const write = process.stdout.write
  let out = ''
  process.stdout.write = ((chunk: string | Uint8Array) => {
    out += String(chunk)
    return true
  }) as typeof process.stdout.write
  try {
    return { code: fn(), out }
  } finally {
    process.stdout.write = write
  }
}

describe('Tier C — stable 1.0.0', () => {
  it('exports the package.json version', () => {
    expect(PACKAGE_VERSION).toBe(pkg.version)
  })

  it('ships playbook pattern payload', () => {
    const payload = docBridgePatternPayload()
    expect(payload.id).toBe(DOC_BRIDGE_PATTERN_ID)
    expect(payload.body).toContain('AgentHandoff')
    expect(docBridgePatternMarkdown()).toContain('type: pattern')
  })

  it('publishes pattern markdown on disk', () => {
    const path = join(import.meta.dirname, '..', 'docs', 'playbook', 'doc-bridge-pattern.md')
    expect(existsSync(path)).toBe(true)
    expect(readFileSync(path, 'utf8')).toContain('doc-bridge-pattern')
  })

  it('prints playbook pattern from CLI', () => {
    const result = captureStdout(() => runCli(['playbook', 'pattern', '--text']))
    expect(result.code).toBe(0)
    expect(result.out).toContain('# Doc Bridge Pattern')
    expect(result.out).toContain('handoff.resolve')
  })

  it('prints playbook pattern as JSON', () => {
    const result = captureStdout(() => runCli(['playbook', 'pattern', '--json']))
    expect(result.code).toBe(0)
    const payload = JSON.parse(result.out) as { id: string; format: string }
    expect(payload.id).toBe('doc-bridge-pattern')
    expect(payload.format).toBe('okf-pattern-v1')
  })

  it('includes pattern export hint in playbook draft', () => {
    const originalCwd = process.cwd()
    try {
      process.chdir(fixtureRoot)
      const result = captureStdout(() => runCli(['playbook', 'draft']))
      expect(result.code).toBe(0)
      const payload = JSON.parse(result.out) as { exportCommand?: string; patternDoc?: string }
      expect(payload.exportCommand).toBe('ak-docs playbook pattern --text')
      expect(payload.patternDoc).toContain('doc-bridge-pattern.md')
    } finally {
      process.chdir(originalCwd)
    }
  })

  it('ships landing page for GitHub Pages', () => {
    const landing = join(import.meta.dirname, '..', 'docs', 'landing', 'index.html')
    expect(existsSync(landing)).toBe(true)
    const html = readFileSync(landing, 'utf8')
    expect(html).toContain('AgentHandoff for your monorepo')
    expect(html).toContain('Used by AgentsKit')
    expect(html).toContain('AgentsKit-io/doc-bridge')
  })
})
