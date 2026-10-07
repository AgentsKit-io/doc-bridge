import { afterEach, expect, it, vi } from 'vitest'
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, readdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { execFileSync } from 'node:child_process'
import { runCli } from '../src/cli/program.js'
import { parseDocBridgeIndex, parseDiscoverySnapshot } from '../src/validate.js'

const roots: string[] = []
afterEach(() => { vi.restoreAllMocks(); roots.splice(0).forEach(root => rmSync(root, { recursive: true, force: true })) })
const fixture = () => {
  const directory = mkdtempSync(join(tmpdir(), 'doc-bridge-controls-')); roots.push(directory)
  const root = join(directory, 'repository'); mkdirSync(join(root, 'docs'), { recursive: true })
  writeFileSync(join(root, 'package.json'), '{"name":"doc-bridge-fixture","version":"1.0.0"}')
  writeFileSync(join(root, 'docs/guide.md'), '# Guide\n\nUse `removed`.\n')
  writeFileSync(join(root, 'api.ts'), 'export const removed = 1\n')
  writeFileSync(join(root, 'doc-bridge.config.json'), JSON.stringify({ schemaVersion: 1, project: { name: 'doc-bridge-fixture' }, corpus: { agent: { root: 'docs' } }, retrieval: { corpus: { enabled: false } }, gates: { preset: 'minimal' } }))
  const stdout = vi.spyOn(process.stdout, 'write').mockImplementation(() => true)
  const stderr = vi.spyOn(process.stderr, 'write').mockImplementation(() => true)
  const output = () => stdout.mock.calls.map(call => String(call[0])).join('')
  const errors = () => stderr.mock.calls.map(call => String(call[0])).join('')
  const clear = () => { stdout.mockClear(); stderr.mockClear() }
  const git = (...args: string[]) => execFileSync('git', ['-c', 'core.hooksPath=', ...args], { cwd: root, encoding: 'utf8' }).trim()
  const commit = () => { git('add', '.'); git('-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.test', '-c', 'commit.gpgsign=false', 'commit', '-qm', 'test: fixture'); return git('rev-parse', 'HEAD') }
  return { root, directory, output, errors, clear, git, commit }
}

it('publishes complete controlled indexes and diffs with progress kept out of artifacts', async () => {
  const { root, directory, output, errors, clear } = fixture()
  const args = ['--root', root, '--progress']
  const listeners = process.listenerCount('SIGINT')
  expect(await runCli(['discover', ...args]), errors()).toBe(0)
  const base = parseDiscoverySnapshot(JSON.parse(output()).snapshot)
  expect(base.relations).toContainEqual(expect.objectContaining({ kind: 'mentions-symbol', metadata: expect.objectContaining({ symbol: 'removed' }) }))
  expect(errors()).toContain('acquisition:')
  expect(errors()).toContain('metrics:')
  const basePath = join(directory, 'base.json'); writeFileSync(basePath, JSON.stringify(base))
  clear()
  expect(await runCli(['discover', ...args, '--text']), errors()).toBe(0)
  expect(output()).toContain('Project: doc-bridge-fixture')
  clear()
  expect(await runCli(['index', ...args]), errors()).toBe(0)
  const indexPath = join(root, '.doc-bridge/index.json')
  const first = parseDocBridgeIndex(JSON.parse(readFileSync(indexPath, 'utf8')))
  expect(first.knowledge.some(item => item.path === 'docs/guide.md')).toBe(true)
  expect(existsSync(join(root, 'llms.txt'))).toBe(true)
  expect(JSON.parse(readFileSync(join(root, '.doc-bridge/capabilities.json'), 'utf8'))).toHaveProperty('schemaVersion', 1)
  clear()
  expect(await runCli(['index', ...args]), errors()).toBe(0)
  const second = JSON.parse(readFileSync(indexPath, 'utf8'))
  expect(second.contentHash).toBe(first.contentHash)
  expect(second.generatedAt).toBe(first.generatedAt)
  writeFileSync(join(root, 'api.ts'), 'export const replacement = 1\n')
  clear()
  const diffPath = join(directory, 'diff.json')
  expect(await runCli(['diff', ...args, '--base', basePath, '--output', diffPath]), errors()).toBe(0)
  const diff = JSON.parse(readFileSync(diffPath, 'utf8'))
  expect(diff.changeSet.changes).toContainEqual(expect.objectContaining({ kind: 'symbol', op: 'removed', before: expect.objectContaining({ name: 'removed' }) }))
  expect(diff.findings).toContainEqual(expect.objectContaining({ code: 'BROKEN_REFERENCE' }))
  expect(diff).not.toHaveProperty('metrics')
  expect(JSON.parse(output())).toEqual(diff)
  expect(readdirSync(join(root, '.doc-bridge')).some(name => name.includes('.tmp-'))).toBe(false)
  expect(process.listenerCount('SIGINT')).toBe(listeners)
})

it('rejects invalid controls and missing base without publishing', async () => {
  const { root, directory, errors, clear } = fixture()
  const output = join(directory, 'denied.json')
  for (const controls of [['--max-duration'], ['--max-duration', '0'], ['--max-duration', '1.5'], ['--progress', '--watch']]) {
    clear()
    expect(await runCli(['index', '--root', root, ...controls])).toBe(2)
    expect(errors()).toMatch(/positive integer|do not support --watch/)
    expect(existsSync(join(root, '.doc-bridge/index.json'))).toBe(false)
  }
  clear()
  expect(await runCli(['diff', '--root', root, '--progress', '--output', output])).toBe(2)
  expect(errors()).toContain('diff requires --base')
  expect(existsSync(output)).toBe(false)
})

it('searches in the service profile and reports progress without implicit writes', async () => {
  const { root, output, errors, clear } = fixture()
  const listeners = process.listenerCount('SIGINT')
  const args = ['--profile', 'service', '--root', root]
  expect(await runCli(['search', 'Guide', ...args, '--progress', '--max-duration', '60000']), errors()).toBe(0)
  expect(JSON.parse(output()).results).toContainEqual(expect.objectContaining({ path: 'docs/guide.md', type: 'document' }))
  expect(errors()).toContain('metrics:')
  expect(existsSync(join(root, '.doc-bridge'))).toBe(false)
  for (const [command, flags, message] of [
    ['discover', ['--watch'], 'denies watch'],
    ['gate', [], 'command unavailable'],
    ['discover', ['--max-duration', '-1'], 'positive integer'],
    ['index', ['--artifact-root', root], 'must be separate'],
  ] as const) {
    clear()
    expect(await runCli([command, ...args, ...flags])).toBe(2)
    expect(errors()).toContain(message)
  }
  expect(process.listenerCount('SIGINT')).toBe(listeners)
})

it('runs exact-revision Action capture, CI-built gates and advisory without checkout writes', async () => {
  const { root, directory, output, errors, clear, git, commit } = fixture()
  git('init', '-q')
  const baseRevision = commit()
  const base = join(directory, 'base.json'), head = join(directory, 'head.json')
  const capture = (revision: string, path: string) => runCli(['action', 'snapshot', '--root', root, '--revision', revision, '--output', path])
  expect(await capture(baseRevision, base), errors()).toBe(0)
  expect(parseDiscoverySnapshot(JSON.parse(readFileSync(base, 'utf8'))).sourceRevision).toBe(baseRevision)
  writeFileSync(join(root, 'api.ts'), 'export const replacement = 1\n')
  const headRevision = commit()
  expect(await capture(headRevision, head), errors()).toBe(0)
  clear()
  const index = join(directory, 'index.json'), report = join(directory, 'report.json')
  const actionArgs = ['action', 'index', '--root', root, '--revision', headRevision]
  expect(await runCli([...actionArgs, '--index-source', 'ci-built', '--output', index, '--report', report]), errors()).toBe(0)
  expect(parseDocBridgeIndex(JSON.parse(readFileSync(index, 'utf8'))).knowledge).toHaveLength(1)
  expect(JSON.parse(readFileSync(report, 'utf8'))).toMatchObject({ ok: true, sourceRevision: headRevision, generated: { reproducible: true }, committed: { present: false } })
  expect(JSON.parse(readFileSync(index + '.provenance.json', 'utf8'))).toHaveProperty('sourceRevision', headRevision)
  expect(existsSync(join(root, '.doc-bridge'))).toBe(false)
  clear()
  expect(await runCli(actionArgs)).toBe(1)
  expect(JSON.parse(output()).ok).toBe(false)
  clear()
  const advisory = join(directory, 'advisory.json'), summary = join(directory, 'summary.md')
  expect(await runCli(['diff', '--advisory', '--root', root, '--base', base, '--head', head, '--repository', 'fixture/doc-bridge', '--pr', '1', '--output', advisory, '--summary', summary, '--fail-on-findings']), errors()).toBe(1)
  expect(JSON.parse(readFileSync(advisory, 'utf8'))).toMatchObject({ base: baseRevision, head: headRevision, findingCount: 1 })
  expect(readFileSync(summary, 'utf8')).toContain('BROKEN_REFERENCE')
  expect(readFileSync(advisory + '.md', 'utf8')).toBe(output())
  expect(JSON.parse(readFileSync(advisory + '.diff.json', 'utf8')).findings).toHaveLength(1)
  expect(git('status', '--porcelain')).toBe('')
  clear()
  expect(await capture(headRevision, join(root, 'denied.json'))).toBe(2)
  expect(errors()).toContain('outside the checkout')
  expect(existsSync(join(root, 'denied.json'))).toBe(false)
  writeFileSync(join(root, 'dirty.md'), '# Dirty\n')
  clear()
  expect(await capture(headRevision, join(directory, 'dirty.json'))).toBe(2)
  expect(errors()).toContain('clean checkout')
  expect(existsSync(join(directory, 'dirty.json'))).toBe(false)
})
