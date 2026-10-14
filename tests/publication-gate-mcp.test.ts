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

it('starts the server first, then warns on stderr when the gate fails', async () => {
  const { configPath, errors } = project({ include: ['reference-findings'] })
  expect(runCli(['mcp', '--config', configPath])).toBeUndefined()
  expect(started).toHaveBeenCalledTimes(1)
  // The check (a full discovery and diff) must not delay the server: it runs on a later turn.
  expect(errors()).not.toContain('reference-findings')
  await new Promise((resolve) => setImmediate(resolve))
  expect(errors()).toContain('reference-findings gate fails')
  expect(errors()).toContain('gates.referenceFindings.base')
})

it('says nothing when the gate is not configured', async () => {
  const { configPath, errors } = project({ preset: 'minimal' })
  expect(runCli(['mcp', '--config', configPath])).toBeUndefined()
  expect(started).toHaveBeenCalledTimes(1)
  await new Promise((resolve) => setImmediate(resolve))
  expect(errors()).not.toContain('reference-findings')
})
