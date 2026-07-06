import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import { runCli } from '../src/cli/program.js'

describe('ak-docs CLI', () => {
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
})