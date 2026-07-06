import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { runCli } from '../src/cli/program.js'

const fixtureRoot = join(fileURLToPath(new URL('.', import.meta.url)), 'fixtures', 'sample-project')
const originalCwd = process.cwd()

describe('ak-docs CLI', () => {
  beforeAll(() => {
    process.chdir(fixtureRoot)
  })

  afterAll(() => {
    process.chdir(originalCwd)
  })

  it('prints version', () => {
    const code = runCli(['--version'])
    expect(code).toBe(0)
  })

  it('validates config file', () => {
    const dir = mkdtempSync(join(tmpdir(), 'ak-docs-'))
    const configPath = join(dir, 'doc-bridge.config.json')
    writeFileSync(
      configPath,
      JSON.stringify({ schemaVersion: 1, corpus: { agent: { root: 'docs' } } }),
    )
    const code = runCli(['validate-config', '--config', configPath])
    expect(code).toBe(0)
  })

  it('builds index from fixture project', () => {
    const code = runCli(['index'])
    expect(code).toBe(0)
  })

  it('lists packages after index', () => {
    const code = runCli(['list', 'packages'])
    expect(code).toBe(0)
  })

  it('queries ownership handoff with --agent', () => {
    const code = runCli(['query', 'ownership', 'os-core', '--agent'])
    expect(code).toBe(0)
  })

  it('searches corpus with --agent', () => {
    const code = runCli(['search', 'schema', '--agent'])
    expect(code).toBe(0)
  })
})