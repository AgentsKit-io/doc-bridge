import { cpSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { runCli } from '../src/cli/program.js'

/*
 * ask, search and query answer from the docs on disk when the published index is stale. The
 * rebuild is in memory: the index file is never written, and `--no-refresh` keeps the strict
 * failure. The build can be made to throw, which exercises the fallback to the stale index.
 */

const build = vi.hoisted(() => ({ fail: false }))

vi.mock('../src/index-builder/build-index.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/index-builder/build-index.js')>()
  return {
    ...actual,
    buildDocBridgeIndex: (...args: Parameters<typeof actual.buildDocBridgeIndex>) => {
      if (build.fail) throw new Error('rebuild failed')
      return actual.buildDocBridgeIndex(...args)
    },
  }
})

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

const STALE_NOTE = 'note: index was stale; answered from the current docs (run ak-docs index to publish)'
const FALLBACK_WARNING = 'warning: index was stale and could not be rebuilt; answered from the stale index on disk'

describe('ak-docs answers with a stale index', () => {
  let workdir = ''
  let indexPath = ''

  beforeEach(async () => {
    workdir = join(mkdtempSync(join(tmpdir(), 'ak-docs-stale-')), 'sample-project')
    cpSync(fixtureRoot, workdir, { recursive: true })
    process.chdir(workdir)
    indexPath = join(workdir, '.doc-bridge', 'index.json')
    expect((await run(['index'])).code).toBe(0)
    // Editing a document makes the published index stale without touching the index file.
    writeFileSync(join(workdir, 'docs/for-agents/packages/os-core.md'), '# os-core\n\nZod schemas, event bus, and error model. Edited after indexing.\n')
  })

  afterEach(() => {
    build.fail = false
    process.chdir(originalCwd)
  })

  it('ask rebuilds in memory, answers, and leaves the published index alone', async () => {
    const before = readFileSync(indexPath, 'utf8')
    const result = await run(['ask', 'who owns schemas'])
    expect(result.code).toBe(0)
    expect(result.out.split('\n')[0]).toBe('Question: who owns schemas')
    expect(result.err).toContain(STALE_NOTE)
    expect(readFileSync(indexPath, 'utf8')).toBe(before)
  })

  it('search and query answer from the rebuilt index with the same note', async () => {
    const search = await run(['search', 'schema'])
    expect(search.code).toBe(0)
    expect(search.err).toContain(STALE_NOTE)
    expect(JSON.parse(search.out)).toMatchObject({ term: 'schema' })

    const query = await run(['query', 'ownership', 'os-core', '--agent'])
    expect(query.code).toBe(0)
    expect(query.err).toContain(STALE_NOTE)
    expect(JSON.parse(query.out)).toMatchObject({ type: 'agent-handoff' })
  })

  it('--no-refresh keeps the strict failure', async () => {
    const result = await run(['ask', 'who owns schemas', '--no-refresh'])
    expect(result.code).toBe(1)
    expect(result.err).toContain('Index is stale')
    expect(result.err).not.toContain(STALE_NOTE)
  })

  it('falls back to the stale index on disk with a warning when the rebuild throws', async () => {
    build.fail = true
    const result = await run(['ask', 'who owns schemas'])
    expect(result.code).toBe(0)
    expect(result.out.split('\n')[0]).toBe('Question: who owns schemas')
    expect(result.err).toContain(FALLBACK_WARNING)
    expect(result.err).not.toContain(STALE_NOTE)
  })

  it('does not change a fresh index', async () => {
    writeFileSync(join(workdir, 'docs/for-agents/packages/os-core.md'), '# os-core\n\nZod schemas, event bus, and error model.\n')
    expect((await run(['index'])).code).toBe(0)
    const result = await run(['ask', 'who owns schemas'])
    expect(result.code).toBe(0)
    expect(result.err).toBe('')
  })
})
