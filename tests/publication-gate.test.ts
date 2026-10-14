import { afterEach, describe, expect, it, vi } from 'vitest'
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { runCli } from '../src/cli/program.js'
import type { DocBridgeConfigV1 } from '../src/config/schema.js'
import { publicationDecision, resolveGateIds, runGate } from '../src/gates/run-gates.js'
import { parseDocBridgeConfig, parseDocBridgeIndex } from '../src/validate.js'

const roots: string[] = []
afterEach(() => {
  vi.restoreAllMocks()
  roots.splice(0).forEach((root) => rmSync(root, { recursive: true, force: true }))
})

const BASE_CONFIG = {
  schemaVersion: 1,
  project: { name: 'doc-bridge-fixture' },
  corpus: { agent: { root: 'docs' } },
  retrieval: { corpus: { enabled: false } },
  gates: { preset: 'minimal' },
} as const

const fixture = () => {
  // Real path: on macOS the temporary directory is a symlink, which the service read root rejects.
  const directory = realpathSync(mkdtempSync(join(tmpdir(), 'doc-bridge-publication-')))
  roots.push(directory)
  const root = join(directory, 'repository')
  mkdirSync(join(root, 'docs'), { recursive: true })
  writeFileSync(join(root, 'package.json'), '{"name":"doc-bridge-fixture","version":"1.0.0"}')
  writeFileSync(join(root, 'docs/guide.md'), '# Guide\n\nUse `removed`.\n')
  writeFileSync(join(root, 'api.ts'), 'export const removed = 1\n')
  const configPath = join(root, 'doc-bridge.config.json')
  const configure = (gates: Record<string, unknown>) => {
    const config = { ...BASE_CONFIG, gates: { ...BASE_CONFIG.gates, ...gates } }
    writeFileSync(configPath, JSON.stringify(config))
    return parseDocBridgeConfig(config) as DocBridgeConfigV1
  }
  configure({})
  const stdout = vi.spyOn(process.stdout, 'write').mockImplementation(() => true)
  const stderr = vi.spyOn(process.stderr, 'write').mockImplementation(() => true)
  const output = () => stdout.mock.calls.map((call) => String(call[0])).join('')
  const errors = () => stderr.mock.calls.map((call) => String(call[0])).join('')
  const clear = () => {
    stdout.mockClear()
    stderr.mockClear()
  }
  const cli = async (...args: string[]) => {
    clear()
    return runCli([...args, '--config', configPath])
  }
  const artifacts = {
    index: join(root, '.doc-bridge/index.json'),
    llms: join(root, 'llms.txt'),
    capabilities: join(root, '.doc-bridge/capabilities.json'),
  }
  const snapshotBase = async () => {
    expect(await cli('discover', '--json'), errors()).toBe(0)
    const base = join(directory, 'base-snapshot.json')
    writeFileSync(base, output())
    return base
  }
  /** Removes the cited export, so the guide now cites a symbol the code no longer has. */
  const breakReference = () => writeFileSync(join(root, 'api.ts'), 'export const replacement = 1\n')
  return { root, directory, configure, cli, output, errors, artifacts, snapshotBase, breakReference }
}

describe('reference-findings publication gate', () => {
  it('is off by default: no preset selects it and index publishes unchanged', async () => {
    const { root, configure, cli, errors, output, artifacts, breakReference } = fixture()
    for (const preset of ['minimal', 'standard', 'strict', 'playbook'] as const) {
      expect(resolveGateIds(configure({ preset }))).not.toContain('reference-findings')
    }
    const config = configure({})
    breakReference()
    expect(publicationDecision(root, config)).toEqual({ allowed: true })
    expect(await cli('index'), errors()).toBe(0)
    expect(JSON.parse(output())).not.toHaveProperty('publication')
    expect(parseDocBridgeIndex(JSON.parse(readFileSync(artifacts.index, 'utf8')))).not.toHaveProperty('publication')
    expect(existsSync(artifacts.llms)).toBe(true)
    expect(JSON.parse(readFileSync(artifacts.capabilities, 'utf8'))).not.toHaveProperty('publication')
  })

  it('fails closed without a base and blocks index', async () => {
    const { root, configure, cli, errors, output, artifacts } = fixture()
    const config = configure({ include: ['reference-findings'] })
    expect(resolveGateIds(config)).toContain('reference-findings')
    const gate = runGate(root, config, 'reference-findings')
    expect(gate.ok).toBe(false)
    expect(gate.message).toContain('gates.referenceFindings.base')
    expect(await cli('gate', 'run', 'reference-findings')).toBe(1)
    expect(errors()).toContain('gates.referenceFindings.base')
    expect(await cli('index')).toBe(1)
    expect(errors()).toContain('Nothing was written')
    expect(JSON.parse(output())).toMatchObject({ ok: false, blockedBy: 'reference-findings' })
    expect(existsSync(artifacts.index)).toBe(false)
    expect(existsSync(artifacts.llms)).toBe(false)
  })

  it('fails closed on a base that does not exist or is not a snapshot', async () => {
    const { root, directory, configure } = fixture()
    const missing = runGate(root, configure({ include: ['reference-findings'], referenceFindings: { base: 'origin/main' } }), 'reference-findings')
    expect(missing).toMatchObject({ ok: false, actual: 'not analyzed' })
    expect(missing.message).toContain('could not be read')
    const invalid = join(directory, 'invalid.json')
    writeFileSync(invalid, '{"type":"not-a-snapshot"}')
    const parsed = runGate(root, configure({ include: ['reference-findings'], referenceFindings: { base: invalid } }), 'reference-findings')
    expect(parsed.ok).toBe(false)
    expect(parsed.message).toContain('not a valid discovery snapshot')
  })

  it('blocks publication while findings are pending, then publishes once the doc is fixed', async () => {
    const { root, configure, cli, errors, output, artifacts, snapshotBase, breakReference } = fixture()
    const base = await snapshotBase()
    const config = configure({ include: ['reference-findings'], referenceFindings: { base } })
    expect(runGate(root, config, 'reference-findings')).toMatchObject({ ok: true, pendingCount: 0 })

    breakReference()
    const gate = runGate(root, config, 'reference-findings')
    expect(gate).toMatchObject({ ok: false, pendingCount: 1 })
    expect(gate.findings?.[0]).toMatchObject({ code: 'BROKEN_REFERENCE', document: 'docs/guide.md', line: 3, target: 'removed' })
    expect(gate.findings?.[0]?.diagnostic).toMatchObject({ code: 'BROKEN_REFERENCE', evidence: expect.any(Array) })
    expect(gate.message).toContain('BROKEN_REFERENCE docs/guide.md:3 → removed')

    expect(await cli('gate', 'run', 'reference-findings')).toBe(1)
    expect(errors()).toContain('BROKEN_REFERENCE docs/guide.md:3 → removed')
    expect(JSON.parse(output()).results[0]).toMatchObject({ id: 'reference-findings', pendingCount: 1, findings: [expect.objectContaining({ diagnostic: expect.objectContaining({ code: 'BROKEN_REFERENCE' }) })] })

    /*
     * Earlier artifacts must survive a blocked run byte for byte. A rebuild would reproduce the
     * same index bytes, so the prior index is stored compact (a rewrite indents it) and the other
     * artifacts hold a sentinel.
     */
    configure({})
    expect(await cli('index'), errors()).toBe(0)
    configure({ include: ['reference-findings'], referenceFindings: { base } })
    writeFileSync(artifacts.index, JSON.stringify(JSON.parse(readFileSync(artifacts.index, 'utf8'))))
    writeFileSync(artifacts.llms, 'previously published\n')
    writeFileSync(artifacts.capabilities, 'previously published\n')
    const before = Object.values(artifacts).map((path) => readFileSync(path, 'utf8'))
    expect(await cli('index')).toBe(1)
    expect(errors()).toContain('BROKEN_REFERENCE docs/guide.md:3 → removed')
    expect(Object.values(artifacts).map((path) => readFileSync(path, 'utf8'))).toEqual(before)
    // The operation path (--progress) respects the same gate.
    expect(await cli('index', '--progress')).toBe(1)
    expect(Object.values(artifacts).map((path) => readFileSync(path, 'utf8'))).toEqual(before)

    writeFileSync(join(root, 'docs/guide.md'), '# Guide\n\nUse `replacement`.\n')
    expect(runGate(root, config, 'reference-findings')).toMatchObject({ ok: true, pendingCount: 0 })
    expect(await cli('index'), errors()).toBe(0)
    const index = parseDocBridgeIndex(JSON.parse(readFileSync(artifacts.index, 'utf8')))
    expect(index).not.toHaveProperty('publication')
    expect(readFileSync(artifacts.llms, 'utf8')).toContain('Guide')
    expect(readFileSync(artifacts.capabilities, 'utf8')).not.toContain('previously published')
  })

  it('publishes with --allow-pending-findings and records the override in the index', async () => {
    const { root, configure, cli, errors, output, artifacts, snapshotBase, breakReference } = fixture()
    const base = await snapshotBase()
    const config = configure({ include: ['reference-findings'], referenceFindings: { base } })
    breakReference()
    expect(await cli('index', '--allow-pending-findings'), errors()).toBe(0)
    expect(errors()).toContain('--allow-pending-findings')
    const override = { override: 'allow-pending-findings', pendingCount: 1, reason: expect.stringContaining('1 pending reference finding') }
    expect(JSON.parse(output()).publication).toMatchObject({ pendingReferenceFindings: override })
    const index = parseDocBridgeIndex(JSON.parse(readFileSync(artifacts.index, 'utf8')))
    expect(index.publication).toMatchObject({ pendingReferenceFindings: override })
    expect(JSON.parse(readFileSync(artifacts.capabilities, 'utf8')).publication).toMatchObject({ pendingReferenceFindings: override })
    expect(existsSync(artifacts.llms)).toBe(true)
    // Provenance stays outside the content hash, so the published index is still fresh.
    expect(runGate(root, config, 'index-freshness').ok).toBe(true)
    // The override is not sticky: without the flag the next run is blocked again.
    expect(await cli('index')).toBe(1)
    expect(parseDocBridgeIndex(JSON.parse(readFileSync(artifacts.index, 'utf8'))).publication).toBeDefined()
  })

  it('counts exactly what the advisory fail-on-findings counts', async () => {
    const { root, directory, configure, cli, errors } = fixture()
    const git = (...args: string[]) => execFileSync('git', ['-c', 'core.hooksPath=', ...args], { cwd: root, encoding: 'utf8' }).trim()
    const commit = () => {
      git('add', '.')
      git('-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.test', '-c', 'commit.gpgsign=false', 'commit', '-qm', 'test: fixture')
      return git('rev-parse', 'HEAD')
    }
    git('init', '-q')
    const base = join(directory, 'base.json')
    const head = join(directory, 'head.json')
    expect(await cli('action', 'snapshot', '--root', root, '--revision', commit(), '--output', base), errors()).toBe(0)
    writeFileSync(join(root, 'api.ts'), 'export const replacement = 1\n')
    expect(await cli('action', 'snapshot', '--root', root, '--revision', commit(), '--output', head), errors()).toBe(0)
    const advisory = join(directory, 'advisory.json')
    expect(await cli('diff', '--advisory', '--root', root, '--base', base, '--head', head, '--repository', 'fixture/doc-bridge', '--pr', '1', '--output', advisory, '--fail-on-findings')).toBe(1)
    const { pendingCount } = JSON.parse(readFileSync(advisory, 'utf8')) as { pendingCount: number }
    expect(pendingCount).toBe(1)
    const gate = runGate(root, configure({ include: ['reference-findings'], referenceFindings: { base } }), 'reference-findings')
    expect(gate).toMatchObject({ ok: false, pendingCount })
  })
})
