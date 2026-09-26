import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'

import { afterEach, describe, expect, it } from 'vitest'

import { applyConfigDefaults } from '../src/config/defaults.js'
import { DocBridgeConfigV1Schema } from '../src/config/schema.js'
import { checkIndexReproducibility } from '../src/discovery/reproducibility.js'
import { runGate, resolveGateIds } from '../src/gates/run-gates.js'
import { buildDocBridgeIndex } from '../src/index-builder/build-index.js'
import { runDoctor } from '../src/doctor/run-doctor.js'

const temporary: string[] = []
afterEach(() => {
  for (const directory of temporary) rmSync(directory, { recursive: true, force: true })
  temporary.length = 0
})

const write = (root: string, path: string, content: string): void => {
  const target = join(root, path)
  mkdirSync(dirname(target), { recursive: true })
  writeFileSync(target, content, 'utf8')
}

const run = (root: string, ...args: readonly string[]): void => {
  execFileSync('git', ['-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid', '-c', 'commit.gpgsign=false', ...args], {
    cwd: root,
    stdio: 'ignore',
    env: { ...process.env, GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_SYSTEM: '/dev/null' },
  })
}

/**
 * A checkout whose committed index carries one generated module, shaped like the monorepo this
 * check came from: `lib/generated.ts` is written by a build step and gitignored.
 */
const fixture = (options: { readonly trackIndex: boolean } = { trackIndex: true }): string => {
  const root = mkdtempSync(join(tmpdir(), 'doc-bridge-repro-'))
  temporary.push(root)
  /* `.doc-bridge/` is ignored so the fixture decides, by force-adding or not, whether it is committed. */
  write(root, '.gitignore', 'lib/generated.ts\nbuilt/\n.doc-bridge/\n')
  write(root, 'src/real.ts', 'export const real = 1\n')
  write(root, 'lib/generated.ts', 'export const generated = 1\n')
  write(root, 'built/also-generated.ts', 'export const other = 1\n')
  write(root, '.doc-bridge/index.json', '{}\n')
  /* Tracked even though `.gitignore` names it: being committed is what makes it legitimate. */
  write(root, 'docs/committed-anyway.md', '# Committed\n')
  write(root, 'docs/.gitignore', 'committed-anyway.md\n')
  run(root, 'init', '--quiet', '--initial-branch=main')
  run(root, 'add', '--all')
  if (options.trackIndex) run(root, 'add', '--force', '.doc-bridge/index.json')
  run(root, 'add', '--force', 'docs/committed-anyway.md')
  run(root, 'commit', '--quiet', '--message', 'fixture')
  return root
}

describe('a committed index has to be reproducible from a clean checkout', () => {
  it('names the generated paths Git ignores, with the rule that matched', () => {
    const root = fixture()
    const result = checkIndexReproducibility(root, '.doc-bridge/index.json', [
      'src/real.ts',
      'lib/generated.ts',
      'built/also-generated.ts',
      'docs/committed-anyway.md',
    ])

    expect(result.checked).toBe(true)
    expect(result.ignored.map((entry) => entry.path)).toEqual(['built/also-generated.ts', 'lib/generated.ts'])
    expect(result.ignored[0]?.rule).toContain('.gitignore')
    expect(result.ignored[0]?.rule).toContain('built/')
  })

  /*
   * A file can be both tracked and matched by an ignore rule. `git check-ignore` consults the
   * index and reports it as not ignored, which is the answer this check needs — the file is
   * committed, so every checkout has it. Pinned here rather than trusted.
   */
  it('does not flag a tracked file that an ignore rule also matches', () => {
    const root = fixture()
    const result = checkIndexReproducibility(root, '.doc-bridge/index.json', ['docs/committed-anyway.md'])

    expect(result.checked).toBe(true)
    expect(result.ignored).toEqual([])
  })

  /*
   * `check-ignore --verbose` emits a record for a path a `!` rule rescues, so the pattern field
   * has to be read: a record whose pattern starts with `!` says the path is *not* ignored. Found
   * by enabling the gate on this repository, whose `.gitignore` rescues its own committed index.
   */
  it('does not flag a path an ignore rule rescues with a negation', () => {
    const root = mkdtempSync(join(tmpdir(), 'doc-bridge-repro-negated-'))
    temporary.push(root)
    write(root, '.gitignore', 'gen/*\n!gen/keep.ts\n.doc-bridge/\n')
    write(root, 'gen/keep.ts', 'export const keep = 1\n')
    write(root, 'gen/drop.ts', 'export const drop = 2\n')
    write(root, '.doc-bridge/index.json', '{}\n')
    run(root, 'init', '--quiet', '--initial-branch=main')
    /* Deliberately not `add --all`: the rescued path stays untracked, which is the only state in
     * which `check-ignore` reports it at all. */
    run(root, 'add', '.gitignore')
    run(root, 'add', '--force', '.doc-bridge/index.json')
    run(root, 'commit', '--quiet', '--message', 'fixture')

    const result = checkIndexReproducibility(root, '.doc-bridge/index.json', ['gen/keep.ts', 'gen/drop.ts'])

    expect(result.checked).toBe(true)
    expect(result.ignored.map((entry) => entry.path)).toEqual(['gen/drop.ts'])
  })

  it('is silent when the index is not committed, because there is nothing to reproduce', () => {
    const root = fixture({ trackIndex: false })
    const result = checkIndexReproducibility(root, '.doc-bridge/index.json', ['lib/generated.ts'])

    expect(result).toEqual({ checked: false, skipped: 'index-untracked', ignored: [] })
  })

  it('is silent outside a Git checkout', () => {
    const root = mkdtempSync(join(tmpdir(), 'doc-bridge-repro-nogit-'))
    temporary.push(root)
    write(root, 'lib/generated.ts', 'export const generated = 1\n')

    expect(checkIndexReproducibility(root, '.doc-bridge/index.json', ['lib/generated.ts'])).toEqual({
      checked: false,
      skipped: 'no-git',
      ignored: [],
    })
  })

  it('reports a clean corpus as checked with nothing ignored', () => {
    const root = fixture()

    expect(checkIndexReproducibility(root, '.doc-bridge/index.json', ['src/real.ts'])).toEqual({
      checked: true,
      ignored: [],
    })
    expect(checkIndexReproducibility(root, '.doc-bridge/index.json', [])).toEqual({ checked: true, ignored: [] })
  })
})

/**
 * A real checkout the whole pipeline can run over: one agent doc, one module, one generated module.
 * Scans honour ignore rules, so the only way an ignored path reaches a committed index is a rule
 * added after the index was built — which is what this fixture does.
 */
const indexableFixture = (include: readonly string[] = []) => {
  const root = mkdtempSync(join(tmpdir(), 'doc-bridge-repro-index-'))
  temporary.push(root)
  writeFileSync(join(root, 'package.json'), JSON.stringify({ name: 'fixture', version: '0.0.0' }), 'utf8')
  write(root, 'src/query/search.ts', 'export const searchIndex = (): number => 1\n')
  write(root, 'lib/generated.ts', 'export const generated = (): number => 2\n')
  write(root, 'docs/for-agents/INDEX.md', '# Agent index\n\nStart with [query](./query.md).\n')
  write(root, 'docs/for-agents/query.md', '---\nid: fixture-query\neditRoot: src/query\n---\n# Query\n\nExports `searchIndex`.\n')
  const config = applyConfigDefaults(
    DocBridgeConfigV1Schema.parse({
      schemaVersion: 1,
      corpus: { agent: { root: 'docs/for-agents', index: 'docs/for-agents/INDEX.md' } },
      ...(include.length ? { gates: { include: [...include] } } : {}),
    }),
  )
  buildDocBridgeIndex({ root, config })
  write(root, '.gitignore', 'lib/generated.ts\n')
  run(root, 'init', '--quiet', '--initial-branch=main')
  run(root, 'add', '--all')
  run(root, 'add', '--force', '.doc-bridge/index.json')
  run(root, 'commit', '--quiet', '--message', 'fixture')
  return { root, config }
}

describe('the pipeline reports an unreproducible index', () => {
  it('raises a doctor warning naming the generated path, without failing the run', () => {
    const { root, config } = indexableFixture()
    const report = runDoctor(root, config)

    expect(report.coverage.reproducibility.checked).toBe(true)
    expect(report.coverage.reproducibility.ignored.map((entry) => entry.path)).toEqual(['lib/generated.ts'])
    const issue = report.issues.find((item) => item.code === 'index-not-reproducible')
    expect(issue?.severity).toBe('warn')
    expect(issue?.message).toContain('lib/generated.ts')
    expect(issue?.action).toContain('safety.exclude')
  })

  it('leaves the gate out of every preset, and fails it only when a repository opts in', () => {
    const { root, config } = indexableFixture()
    expect(resolveGateIds(config)).not.toContain('index-reproducible')
    expect(runGate(root, config, 'index-reproducible').ok).toBe(false)

    const { root: optedRoot, config: optedConfig } = indexableFixture(['index-reproducible'])
    expect(resolveGateIds(optedConfig)).toContain('index-reproducible')
    const result = runGate(optedRoot, optedConfig, 'index-reproducible')
    expect(result.ok).toBe(false)
    expect(result.actual).toContain('lib/generated.ts')
  })

  it('passes the gate once the generated path is excluded from the scan', () => {
    const { root } = indexableFixture(['index-reproducible'])
    const excluded = applyConfigDefaults(
      DocBridgeConfigV1Schema.parse({
        schemaVersion: 1,
        corpus: { agent: { root: 'docs/for-agents', index: 'docs/for-agents/INDEX.md' } },
        gates: { include: ['index-reproducible'] },
        safety: { exclude: ['**/lib/generated.ts'] },
      }),
    )
    buildDocBridgeIndex({ root, config: excluded })

    const result = runGate(root, excluded, 'index-reproducible')
    expect(result.ok).toBe(true)
    expect(result.message).toBe('Every indexed path is committed')
  })
})
