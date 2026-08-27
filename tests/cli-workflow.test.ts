import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import { runCli } from '../src/cli/program.js'

const capture = (fn: () => number | undefined): { readonly code: number | undefined; readonly out: string; readonly err: string } => {
  const stdout = process.stdout.write
  const stderr = process.stderr.write
  let out = ''
  let err = ''
  process.stdout.write = ((chunk: string | Uint8Array) => { out += String(chunk); return true }) as typeof process.stdout.write
  process.stderr.write = ((chunk: string | Uint8Array) => { err += String(chunk); return true }) as typeof process.stderr.write
  try { return { code: fn(), out, err } } finally { process.stdout.write = stdout; process.stderr.write = stderr }
}

const project = (strict = false): string => {
  const root = mkdtempSync(join(tmpdir(), 'doc-bridge-cli-workflow-'))
  writeFileSync(join(root, 'package.json'), JSON.stringify({ name: 'cli-fixture' }))
  writeFileSync(join(root, 'src.ts'), "import './dep.js'\nexport const value = 1\n")
  writeFileSync(join(root, 'dep.ts'), 'export const dependency = 1\n')
  writeFileSync(join(root, 'doc-bridge.config.json'), JSON.stringify({
    schemaVersion: 1,
    corpus: { agent: { root: 'docs/for-agents' } },
    ...(strict ? { rules: { mode: 'strict' } } : {}),
  }))
  return root
}

describe('workflow CLI', () => {
  it('discovers an unconfigured repository without creating state', () => {
    const root = mkdtempSync(join(tmpdir(), 'doc-bridge-cli-discover-'))
    writeFileSync(join(root, 'package.json'), JSON.stringify({ name: 'unconfigured' }))
    const previous = process.cwd()
    process.chdir(root)
    try {
      const result = capture(() => runCli(['discover', '--json']))
      const payload = JSON.parse(result.out) as { ok: boolean; proposedConfig?: unknown }
      expect(result.code).toBe(0)
      expect(payload.ok).toBe(true)
      expect(payload.proposedConfig).toBeDefined()
      expect(existsSync(join(root, '.doc-bridge'))).toBe(false)
    } finally { process.chdir(previous) }
  })

  it('runs scan/reconcile/check/map through shared artifacts and exit policy', () => {
    const root = project()
    const previous = process.cwd()
    process.chdir(root)
    try {
      expect(capture(() => runCli(['scan', '--json'])).code).toBe(0)
      expect(capture(() => runCli(['reconcile', '--json'])).code).toBe(0)
      const checked = capture(() => runCli(['check', '--json']))
      const checkPayload = JSON.parse(checked.out) as { runId: string; snapshotHash: string; reportHash: string; diagnostics: unknown[] }
      expect(checked.code).toBe(0)
      expect(checkPayload.runId).toBeTruthy()
      expect(checkPayload.snapshotHash).toMatch(/^[a-f0-9]{64}$/)
      expect(checkPayload.reportHash).toMatch(/^[a-f0-9]{64}$/)
      expect(Array.isArray(checkPayload.diagnostics)).toBe(true)
      const mapped = capture(() => runCli(['map', '--json']))
      expect(mapped.code).toBe(0)
      expect((JSON.parse(mapped.out) as { snapshotHash: string }).snapshotHash).toBe(checkPayload.snapshotHash)
      expect(readFileSync(join(root, '.doc-bridge', 'workflow', 'manifest.json'), 'utf8')).toContain(checkPayload.runId)
    } finally { process.chdir(previous) }
  })

  it('returns 1 for strict policy findings and 2 for invalid input', () => {
    const root = project(true)
    const previous = process.cwd()
    process.chdir(root)
    try {
      expect(capture(() => runCli(['check', '--json'])).code).toBe(1)
      const invalid = capture(() => runCli(['reconcile', '--config', join(root, 'missing.json')]))
      expect(invalid.code).toBe(2)
    } finally { process.chdir(previous) }
  })
})
