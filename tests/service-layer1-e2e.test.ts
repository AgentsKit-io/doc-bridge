import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import childProcess from 'node:child_process'
import { syncBuiltinESMExports } from 'node:module'
import { afterEach, expect, it, vi } from 'vitest'
import {
  contentRef, createLocalRepositoryRead, diffSnapshotsWithRead, discoverRepositoryWithRead,
  ChangeSetV1Schema, withExecutionProfile,
} from '../src/index.js'
import { markdownManifest } from '../src/discovery/plugins/markdown.js'

// RF-02: the layer-1 base/head flow a consumer service embeds, only through the public API.
const SECRET = 'synthetic-service-secret-0001'
const roots: string[] = []
afterEach(() => { vi.restoreAllMocks(); syncBuiltinESMExports(); roots.splice(0).forEach(root => rmSync(root, { recursive: true, force: true })) })

const config = {
  schemaVersion: 1 as const,
  corpus: { agent: { root: 'docs', index: 'docs/INDEX.md' } },
  safety: { maxFiles: 50, maxBytes: 1_000_000, maxTimeMs: 30_000, redactSecrets: false },
  intelligence: { enabled: true, runtime: 'custom' as const, runtimeModule: 'hook.mjs' },
}
const guide = `# Widgets\n\nCall \`createWidget\` from [the source](../src/widget.ts). token=${SECRET}\n`
const files = (revision: 'base' | 'head'): Record<string, string> => ({
  'package.json': JSON.stringify({ name: 'fictional-widgets', version: '1.0.0', type: 'module', scripts: { postinstall: 'node hook.mjs' } }),
  'doc-bridge.config.json': JSON.stringify(config),
  'hook.mjs': "import {writeFileSync} from 'node:fs'; writeFileSync(new URL('./hook-marker', import.meta.url), 'executed')",
  'docs/INDEX.md': '# Fictional widgets\n\n- [Widgets](widgets.md)\n',
  'docs/widgets.md': guide,
  'src/widget.ts': revision === 'base'
    ? 'export function createWidget(name: string): string { return name }\nexport const widgetVersion = 1\n'
    : 'export const widgetVersion = 2\n',
})

const checkout = (revision: 'base' | 'head') => {
  const root = mkdtempSync(join(tmpdir(), `service-e2e-${revision}-`)); roots.push(root)
  for (const [path, text] of Object.entries(files(revision))) { mkdirSync(dirname(join(root, path)), { recursive: true }); writeFileSync(join(root, path), text) }
  return { root, inventory: Object.fromEntries(Object.keys(files(revision)).map(path => [path, contentRef(readFileSync(join(root, path)))])) }
}

it('discovers base and head and builds a redacted ChangeSetV1 under the service profile without git, network or repository code', async () => {
  const calls: string[] = []
  vi.spyOn(globalThis, 'fetch').mockImplementation(() => { calls.push('fetch'); throw new Error('Blocked fetch') })
  for (const name of ['exec', 'execSync', 'execFile', 'execFileSync', 'spawn', 'spawnSync', 'fork'] as const) vi.spyOn(childProcess, name).mockImplementation((() => { calls.push(name); throw new Error('Blocked subprocess') }) as never)
  syncBuiltinESMExports()

  const limits = { maxFiles: 50, maxBytes: 1_000_000, maxTimeMs: 30_000 }
  const scan = async (revision: 'base' | 'head') => {
    const { root, inventory } = checkout(revision)
    // No .git: the caller pins the revision and the content inventory; the service profile skips Git ignore lookups.
    expect(existsSync(join(root, '.git'))).toBe(false)
    const read = await withExecutionProfile('service', () => createLocalRepositoryRead({ root, partition: { repositoryId: 'fictional-widgets', revision }, limits: { ...markdownManifest.resourceLimits, ...limits }, inventory }))
    const found = await discoverRepositoryWithRead(read, { profile: 'service', config, maxFiles: limits.maxFiles, maxBytes: limits.maxBytes, limits: { maxTimeMs: limits.maxTimeMs } })
    expect(found.status).toBeUndefined()
    expect(found.snapshot.sourceRevision).toBe(revision)
    expect(found.snapshot.coverage.some(item => item.analyzer === 'service-profile' && item.status === 'not-analyzed')).toBe(true)
    expect(JSON.stringify(found.snapshot)).not.toContain(SECRET)
    return { root, read, snapshot: found.snapshot }
  }
  const base = await scan('base'), head = await scan('head')

  const result = await diffSnapshotsWithRead(base.snapshot, head.snapshot, head.read, { profile: 'service', limits })
  expect(result.status).toBeUndefined()
  const changeSet = ChangeSetV1Schema.parse(result.changeSet)
  expect(changeSet.baseRevision).toBe('base')
  expect(changeSet.headRevision).toBe('head')
  expect(changeSet.changes.some(change => change.op === 'removed' && JSON.stringify(change).includes('createWidget'))).toBe(true)
  expect(result.findings.some(finding => JSON.stringify(finding).includes('docs/widgets.md'))).toBe(true)
  expect(JSON.stringify(result)).not.toContain(SECRET)

  const capped = await discoverRepositoryWithRead(head.read, { profile: 'service', config, maxFiles: 2 })
  expect(capped.status).toBe('partial')
  expect(capped.snapshot.coverage).toContainEqual(expect.objectContaining({ scope: 'limits:acquisition', status: 'partial', reason: 'FILE_LIMIT' }))

  expect(calls).toEqual([])
  for (const root of [base.root, head.root]) expect(existsSync(join(root, 'hook-marker'))).toBe(false)
})
