import { cpSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { runCli } from '../src/cli/program.js'

const fixtureRoot = fileURLToPath(new URL('./fixtures/sample-project', import.meta.url))
const originalCwd = process.cwd()

const run = async (argv: readonly string[]) => {
  const writeOut = process.stdout.write
  const writeErr = process.stderr.write
  let out = ''
  let err = ''
  process.stdout.write = ((chunk: string | Uint8Array) => {
    out += String(chunk)
    return true
  }) as typeof process.stdout.write
  process.stderr.write = ((chunk: string | Uint8Array) => {
    err += String(chunk)
    return true
  }) as typeof process.stderr.write
  try {
    const code = await runCli([...argv])
    return { code, out, err }
  } finally {
    process.stdout.write = writeOut
    process.stderr.write = writeErr
  }
}

describe('ak-docs text output paths', () => {
  let workdir = ''

  beforeEach(() => {
    workdir = join(mkdtempSync(join(tmpdir(), 'ak-docs-text-paths-')), 'sample-project')
    cpSync(fixtureRoot, workdir, { recursive: true })
    process.chdir(workdir)
  })

  afterEach(() => {
    process.chdir(originalCwd)
  })

  it('index --text prints project-relative paths and no absolute path', async () => {
    const result = await run(['index', '--text'])
    expect(result.code).toBe(0)
    expect(result.out).toContain('Index: .doc-bridge/index.json')
    expect(result.out).toContain('llms.txt: llms.txt')
    expect(result.out).not.toContain(workdir)
  })

  it('index keeps JSON with absolute paths when --text is not passed', async () => {
    const result = await run(['index'])
    expect(JSON.parse(result.out)).toMatchObject({ indexPath: join(workdir, '.doc-bridge', 'index.json') })
  })

  it('a configured text default does not turn index JSON into text', async () => {
    const configPath = join(workdir, 'doc-bridge.config.json')
    const config = JSON.parse(readFileSync(configPath, 'utf8')) as Record<string, unknown>
    writeFileSync(configPath, JSON.stringify({ ...config, surfaces: { cli: { defaultFormat: 'text' } } }, null, 2))
    expect(JSON.parse((await run(['index'])).out)).toMatchObject({ ok: true })
  })
})
