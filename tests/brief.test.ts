import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
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

const nox = (): string => {
  const root = mkdtempSync(join(tmpdir(), 'doc-bridge-brief-'))
  mkdirSync(join(root, 'docs/finalizacao'), { recursive: true })
  writeFileSync(join(root, 'package.json'), JSON.stringify({ name: 'pay-fixture' }))
  writeFileSync(join(root, 'AGENTS.md'), '# Agents\n\nPayments checkout lives in docs/finalizacao.\n')
  writeFileSync(join(root, 'docs/finalizacao/checkout.md'), '# Checkout finalization\n\nThe checkout flow must confirm payment before issuing a receipt.\n')
  writeFileSync(join(root, 'docs/mvp.yaml'), 'mvp:\n  scope: checkout payment receipt\n')
  writeFileSync(join(root, 'doc-bridge.config.json'), JSON.stringify({ schemaVersion: 1, corpus: { agent: { root: 'docs/for-agents' } } }))
  return root
}

describe('brief', () => {
  it('quotes NoxCode context and records cost and time', () => {
    const root = nox()
    const previous = process.cwd()
    process.chdir(root)
    try {
      const result = capture(() => runCli(['brief', 'Fix the checkout payment receipt', '--out', 'brief.md', '--record', 'record.json']))
      expect(result.err).toBe('')
      expect(result.code).toBe(0)
      const brief = readFileSync(join(root, 'brief.md'), 'utf8')
      expect(brief).toContain('## Repository context (doc-bridge)')
      expect(brief).toContain('### docs/finalizacao/checkout.md')
      expect(brief).toContain('### docs/mvp.yaml')
      const record = JSON.parse(readFileSync(join(root, 'record.json'), 'utf8')) as { cost: { usd: number; tokens: number }; durationMs: number; contextFiles: { path: string }[] }
      expect(record.cost).toEqual({ llmCalls: 0, tokens: 0, usd: 0 })
      expect(record.durationMs).toBeGreaterThanOrEqual(0)
      expect(record.contextFiles.map((file) => file.path)).toEqual(['docs/finalizacao/checkout.md', 'docs/mvp.yaml'])
    } finally { process.chdir(previous) }
  })

  it('refuses an empty ticket and context outside the repository', () => {
    const root = nox()
    const previous = process.cwd()
    process.chdir(root)
    try {
      expect(capture(() => runCli(['brief'])).code).toBe(1)
      const result = capture(() => runCli(['brief', 'checkout', '--context', '../outside']))
      expect(result.code).toBe(0)
      expect(result.out).not.toContain('### ../outside')
    } finally { process.chdir(previous) }
  })
})
