import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import { runCli } from '../src/cli/program.js'
import { ReconciliationReportV1Schema } from '../src/schemas/knowledge.js'

const capture = (fn: () => number | undefined): { readonly code: number | undefined; readonly out: string; readonly err: string } => {
  const stdout = process.stdout.write
  const stderr = process.stderr.write
  let out = ''
  let err = ''
  process.stdout.write = ((chunk: string | Uint8Array) => { out += String(chunk); return true }) as typeof process.stdout.write
  process.stderr.write = ((chunk: string | Uint8Array) => { err += String(chunk); return true }) as typeof process.stderr.write
  try {
    return { code: fn(), out, err }
  } finally {
    process.stdout.write = stdout
    process.stderr.write = stderr
  }
}

const report = ReconciliationReportV1Schema.parse({
  type: 'reconciliation-report',
  schemaVersion: 1,
  contentHash: 'a'.repeat(64),
  contentHashAlgo: 'sha256-normalized-v1',
  project: { name: 'fixture', root: '.' },
  sourceRevision: 'revision-1',
  sourceRevisionKind: 'content',
  configurationHash: 'b'.repeat(64),
  pipelineVersion: '1.0.0',
  analyzerVersions: { 'js-ts': '1.0.0' },
  snapshotHash: 'c'.repeat(64),
  diagnostics: [{
    id: 'diagnostic-1',
    code: 'RELATION_UNDOCUMENTED',
    status: 'undocumented',
    severity: 'warn',
    message: 'Undocumented relation',
    evidence: [{ source: 'code', path: 'src/core.ts', lineStart: 1 }],
  }],
  summary: { entityCount: 1, relationCount: 1, diagnosticCount: 1 },
})

describe('rules CLI', () => {
  it('evaluates a report with CLI precedence and returns policy exit codes', () => {
    const root = mkdtempSync(join(tmpdir(), 'doc-bridge-rules-cli-'))
    const configPath = join(root, 'doc-bridge.config.json')
    const reportPath = join(root, 'report.json')
    writeFileSync(configPath, JSON.stringify({ schemaVersion: 1, corpus: { agent: { root: 'docs/for-agents' } }, rules: { mode: 'strict', severity: { 'graph-undocumented-relation': 'error' } } }))
    writeFileSync(reportPath, JSON.stringify(report))

    const result = capture(() => runCli(['rules', 'run', reportPath, '--config', configPath, '--preset', 'default', '--severity', 'graph-undocumented-relation=warn', '--json']))
    expect(result.code).toBe(0)
    expect(JSON.parse(result.out)).toMatchObject({ ok: true, mode: 'default', exitCode: 0, findings: [{ ruleId: 'graph-undocumented-relation', severity: 'warn' }] })
    expect(result.err).toBe('')
  })

  it('returns exit code 1 for strict findings and 2 for invalid invocation/configuration', () => {
    const root = mkdtempSync(join(tmpdir(), 'doc-bridge-rules-cli-invalid-'))
    const configPath = join(root, 'doc-bridge.config.json')
    const reportPath = join(root, 'report.json')
    writeFileSync(configPath, JSON.stringify({ schemaVersion: 1, corpus: { agent: { root: 'docs/for-agents' } } }))
    writeFileSync(reportPath, JSON.stringify(report))

    expect(capture(() => runCli(['rules', 'run', reportPath, '--config', configPath, '--preset', 'strict'])).code).toBe(1)
    const invalid = capture(() => runCli(['rules', 'run', reportPath, '--config', configPath, '--severity', 'unknown-rule=error']))
    expect(invalid.code).toBe(2)
    expect(invalid.err).toContain('Invalid enum value')
    expect(capture(() => runCli(['rules'])).code).toBe(2)
  })
})
