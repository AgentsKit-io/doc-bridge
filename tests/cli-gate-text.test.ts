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

describe('ak-docs gate run output', () => {
  let workdir = ''

  beforeEach(async () => {
    workdir = join(mkdtempSync(join(tmpdir(), 'ak-docs-gate-text-')), 'sample-project')
    cpSync(fixtureRoot, workdir, { recursive: true })
    process.chdir(workdir)
    expect((await run(['index'])).code).toBe(0)
  })

  afterEach(() => {
    process.chdir(originalCwd)
  })

  it('prints a short human report with --text and no JSON', async () => {
    const result = await run(['gate', 'run', '--text'])
    expect(result.code).toBe(0)
    expect(result.out).not.toContain('{')
    expect(result.out.split('\n')).toEqual([
      '✓ index-freshness — Index is fresh',
      'All gates passed.',
      '',
    ])
  })

  it('marks a failing gate with ✗ and exits 1', async () => {
    const configPath = join(workdir, 'doc-bridge.config.json')
    const config = JSON.parse(readFileSync(configPath, 'utf8')) as {
      routing: { options: { ownership: { 'os-core': { humanDoc?: string } } } }
    }
    config.routing.options.ownership['os-core'].humanDoc = '/docs/missing'
    writeFileSync(configPath, JSON.stringify(config, null, 2))

    const result = await run(['gate', 'run', 'human-guide-links', '--text'])
    expect(result.code).toBe(1)
    expect(result.out).toContain('✗ human-guide-links — Broken humanDoc links: /docs/missing')
    expect(result.out).toContain('One or more gates failed.')
  })

  it('keeps JSON when --json is passed or no text output is requested', async () => {
    expect(JSON.parse((await run(['gate', 'run', '--json'])).out)).toMatchObject({ ok: true, results: expect.any(Array) })
    expect(JSON.parse((await run(['gate', 'run'])).out)).toMatchObject({ ok: true, results: expect.any(Array) })
  })

  it('uses the configured text default unless --json is passed', async () => {
    const configPath = join(workdir, 'doc-bridge.config.json')
    const config = JSON.parse(readFileSync(configPath, 'utf8')) as Record<string, unknown>
    writeFileSync(configPath, JSON.stringify({ ...config, surfaces: { cli: { defaultFormat: 'text' } } }, null, 2))
    expect((await run(['index'])).code).toBe(0)

    expect((await run(['gate', 'run'])).out).toBe('✓ index-freshness — Index is fresh\nAll gates passed.\n')
    expect(JSON.parse((await run(['gate', 'run', '--json'])).out)).toMatchObject({ ok: true })
  })
})
