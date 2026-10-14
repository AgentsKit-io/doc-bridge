import { afterEach, expect, it, vi } from 'vitest'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { runCli } from '../src/cli/program.js'

// The server reads stdin forever; only whether it was started matters here.
const started = vi.hoisted(() => vi.fn())
vi.mock('../src/mcp/server.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../src/mcp/server.js')>()),
  startMcpStdioServer: started,
}))

const roots: string[] = []
afterEach(() => {
  vi.restoreAllMocks()
  started.mockClear()
  roots.splice(0).forEach((root) => rmSync(root, { recursive: true, force: true }))
})

const project = (gates: Record<string, unknown>) => {
  const root = mkdtempSync(join(tmpdir(), 'doc-bridge-publication-mcp-'))
  roots.push(root)
  mkdirSync(join(root, 'docs'))
  writeFileSync(join(root, 'docs/guide.md'), '# Guide\n')
  const configPath = join(root, 'doc-bridge.config.json')
  writeFileSync(configPath, JSON.stringify({ schemaVersion: 1, corpus: { agent: { root: 'docs' } }, retrieval: { corpus: { enabled: false } }, gates }))
  const stderr = vi.spyOn(process.stderr, 'write').mockImplementation(() => true)
  vi.spyOn(process.stdout, 'write').mockImplementation(() => true)
  return { configPath, errors: () => stderr.mock.calls.map((call) => String(call[0])).join('') }
}

it('warns on stderr when the gate fails, and still starts the server', () => {
  const { configPath, errors } = project({ include: ['reference-findings'] })
  expect(runCli(['mcp', '--config', configPath])).toBeUndefined()
  expect(started).toHaveBeenCalledTimes(1)
  expect(errors()).toContain('reference-findings gate fails')
  expect(errors()).toContain('gates.referenceFindings.base')
})

it('says nothing when the gate is not configured', () => {
  const { configPath, errors } = project({ preset: 'minimal' })
  expect(runCli(['mcp', '--config', configPath])).toBeUndefined()
  expect(started).toHaveBeenCalledTimes(1)
  expect(errors()).not.toContain('reference-findings')
})
