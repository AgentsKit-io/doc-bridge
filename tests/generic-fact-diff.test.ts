import { cp, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { diffSnapshots, diffSnapshotsWithRead, parseChangeSet } from '../src/diff/change-set.js'
import { discoverRepositoryWithRead } from '../src/discovery/repository.js'
import { safeWalkFiles } from '../src/safety/repository.js'
import { readFileSync } from 'node:fs'
import { relative } from 'node:path'
import { createLocalRepositoryRead, contentRef } from '../src/storage/local.js'
import { createLocalArtifactIO } from '../src/storage/artifacts.js'
import { readStoredSnapshot, writeStoredSnapshot } from '../src/index-builder/snapshot-io.js'
import { ChangeIdentitySchema, ChangeSetV1JsonSchema } from '../src/schemas/change-set.js'
import { canonicalJsonV1 } from '../src/index-builder/content-hash.js'
import { packageFactFromEntity, surfaceFactFromEntity } from '../src/storage/facts.js'
import { toySourcePlugin, toyLimits } from './toy-plugin.js'

const roots: string[] = []
afterEach(async () => { for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true }) })
const temporary = async () => { const root = await mkdtemp(join(tmpdir(), 'doc-bridge-toy-')); roots.push(root); return root }
const fixture = async (revision: 'base' | 'head') => { const root = await temporary(); await cp(resolve('tests/fixtures/toy-ecosystem', revision), root, { recursive: true }); return root }
const reader = async (root: string, revision: string) => createLocalRepositoryRead({ root, partition: { repositoryId: 'doc-bridge-fixture', revision }, limits: toyLimits, inventory: Object.fromEntries(safeWalkFiles(root).files.map(path => [relative(root, path).split('\\').join('/'), contentRef(readFileSync(path))])) })
const scan = async (root: string, revision: string, source = toySourcePlugin) => {
  const read = await reader(root, revision)
  const { snapshot, binding } = await discoverRepositoryWithRead(read, { root: 'doc-bridge-fixture', plugins: [source], replaceSourcePlugins: true })
  const io = await createLocalArtifactIO({ root: await temporary(), partition: binding.partition, limits: toyLimits })
  const request = { partition: binding.partition, signal: new AbortController().signal }
  expect((await writeStoredSnapshot(io, request, snapshot, null)).status).toBe('ok')
  const restored = await readStoredSnapshot(io, request)
  if (restored.status !== 'ok') throw new Error(restored.code)
  const roundtrip = restored.value.value
  expect(canonicalJsonV1(roundtrip)).toBe(canonicalJsonV1(snapshot))
  return { snapshot: roundtrip, read }
}

describe('generic fact diff through persisted exact-partition snapshots', () => {
  it('T4-A1..A6 / A9 compares all kinds, mappings, evidence, hashes and changed docs', async () => {
    const baseRoot = await fixture('base'), headRoot = await fixture('head')
    const base = await scan(baseRoot, 'base'), head = await scan(headRoot, 'head')
    const result = await diffSnapshotsWithRead(base.snapshot, head.snapshot, head.read)
    expect(parseChangeSet(result.changeSet)).toEqual(result.changeSet)
    const changes = result.changeSet.changes
    expect(changes.filter(change => change.kind === 'symbol')).toMatchObject([{ op: 'removed', before: { name: 'Gone', ownerId: 'module:src/main.toy' } }])
    expect(changes.filter(change => change.kind === 'cli-flag').map(change => [change.op, change.before?.name ?? change.after?.name]).sort()).toEqual([['added', '--compact'], ['removed', '--brief']])
    for (const kind of ['config-key', 'signature']) {
      const change = changes.find(change => change.kind === kind)!
      expect(change.op).toBe('changed')
      expect(change.before!.valueHash).toMatch(/^[a-f0-9]{64}$/)
      expect(change.after!.valueHash).not.toBe(change.before!.valueHash)
      for (const side of [change.before!, change.after!]) expect(side.evidence).toContainEqual(expect.objectContaining({ path: 'src/main.toy', lineStart: expect.any(Number), contentHash: expect.stringMatching(/^[a-f0-9]{64}$/) }))
    }
    expect(changes.some(change => change.kind === 'module')).toBe(true)
    expect(result.changeSet.packages).toEqual([{ id: 'package:doc-bridge', purl: 'pkg:generic/doc-bridge', version: '2' }])
    expect(result.findings).toHaveLength(2)
    expect(result.findings.every(finding => finding.code === 'BROKEN_REFERENCE' && finding.status === 'conflict')).toBe(true)
    expect(result.impact.changedDocumentation.map(doc => doc.path)).toEqual(['docs/guide.md'])
    expect(result.impact.documentsToReview).toEqual([])
    expect(canonicalJsonV1(await diffSnapshotsWithRead(base.snapshot, head.snapshot, head.read))).toBe(canonicalJsonV1(result))
    expect(diffSnapshots(base.snapshot, head.snapshot, { headRoot: headRoot })).toEqual(result)
    expect((await scan(headRoot, 'head')).snapshot.contentHash).toBe(head.snapshot.contentHash)
    expect(diffSnapshots(base.snapshot, head.snapshot).findings.every(finding => finding.status === 'stale-or-unverified')).toBe(true)
    for (const scope of ['cli-command', 'cli-flag', 'config-key', 'signature']) expect(result.changeSet.coverage.some(entry => entry.analyzer === 'diff' && entry.scope === scope && entry.status === 'not-analyzed')).toBe(false)
    expect(result.changeSet.coverage).toContainEqual(expect.objectContaining({ scope: 'rename-detection', status: 'not-analyzed' }))
    expect(result.changeSet.changes.some(change => change.op === 'renamed')).toBe(false)
    const pkg = packageFactFromEntity(base.snapshot.entities.find(entity => entity.kind === 'package')!)
    expect(pkg.dependencies).toEqual([{ purl: 'pkg:generic/helper', range: 'vers:toy/>=1|<4', lockedVersion: '3' }])
    // Value changes and evidence changes independently affect semantic identity.
    const altered = structuredClone(head.snapshot)
    const fact = altered.entities.find(entity => entity.kind === 'config-key')!
    ;(fact.metadata!.fact as { valueHash: string }).valueHash = 'f'.repeat(64)
    expect(diffSnapshots(base.snapshot, altered).changeSet.contentHash).not.toBe(result.changeSet.contentHash)
    expect(ChangeIdentitySchema.safeParse({ id: 'x', name: 'x', evidence: [], valueHash: 'invalid' }).success).toBe(false)
    expect(JSON.stringify(ChangeSetV1JsonSchema)).toContain('valueHash')
  })

  it('T4-A7 incomplete, failed and unsupported extraction never proves conflict', async () => {
    const base = await scan(await fixture('base'), 'base')
    for (const mode of ['partial', 'failed', 'unsupported']) {
      const root = await fixture('head')
      if (mode === 'partial') await writeFile(join(root, 'src/main.toy'), 'symbol Keep\nunknown directive\n')
      const source = mode === 'failed' ? { ...toySourcePlugin, async discover() { throw new Error('FIXTURE_FAILURE') } } : mode === 'unsupported' ? { ...toySourcePlugin, async discover(input: Parameters<typeof toySourcePlugin.discover>[0]) {
        const output = await toySourcePlugin.discover(input) as import('../src/plugins/contract.js').ExtractionV2
        return { ...output, coverage: output.coverage.map(entry => ['symbols','cli-flags'].includes(entry.scope) ? { ...entry, status: 'not-analyzed' } : entry) }
      } } : toySourcePlugin
      const head = await scan(root, mode, source)
      const result = await diffSnapshotsWithRead(base.snapshot, head.snapshot, head.read)
      expect(result.findings.length).toBeGreaterThan(0)
      expect(result.findings.every(finding => finding.status === 'stale-or-unverified')).toBe(true)
    }
  })

  it('resolves removed commands, config keys, signatures and packages through owner/name citations', async () => {
    const baseRoot = await fixture('base'), headRoot = await fixture('head')
    const text = '# Guide\n\nUse `inspect`, `output`, `Keep`, and `pkg:generic/doc-bridge`.\n'
    await writeFile(join(baseRoot, 'docs/guide.md'), text)
    await writeFile(join(headRoot, 'docs/guide.md'), text)
    await writeFile(join(headRoot, 'src/main.toy'), 'symbol Keep\n')
    await writeFile(join(headRoot, 'toy.manifest'), 'package helper 10\n')
    const base = await scan(baseRoot, 'base'), head = await scan(headRoot, 'head')
    const result = await diffSnapshotsWithRead(base.snapshot, head.snapshot, head.read)
    expect(result.findings).toHaveLength(4)
    expect(result.findings.every(finding => finding.status === 'conflict')).toBe(true)
    expect(result.changeSet.changes.filter(change => ['cli-command', 'config-key', 'signature', 'package'].includes(change.kind) && change.op === 'removed')).toHaveLength(4)
    expect(result.impact.documentsToReview.map(doc => doc.path)).toEqual(['docs/guide.md'])
  })

  it('T4-A8 generic ambiguity preserves locator identity across moved citations', async () => {
    const baseRoot = await fixture('base'), headRoot = await fixture('head')
    await mkdir(join(headRoot, 'src'), { recursive: true })
    await writeFile(join(headRoot, 'src/other.toy'), 'symbol Keep\n')
    const base = await scan(baseRoot, 'base'), head = await scan(headRoot, 'head')
    const result = await diffSnapshotsWithRead(base.snapshot, head.snapshot, head.read)
    const ambiguity = result.findings.find(finding => finding.code === 'AMBIGUOUS_REFERENCE')!
    expect(ambiguity).toMatchObject({ status: 'unresolved' })
    expect(ambiguity).not.toHaveProperty('remediation')
    await writeFile(join(headRoot, 'docs/guide.md'), '# Guide\n\nIntroduction.\n\nUse `Gone`, `Keep`, `--brief`, `output`.\n')
    const moved = await scan(headRoot, 'moved')
    expect((await diffSnapshotsWithRead(base.snapshot, moved.snapshot, moved.read)).findings.find(finding => finding.code === 'AMBIGUOUS_REFERENCE')!.id).toBe(ambiguity.id)
    await writeFile(join(headRoot, 'docs/guide.md'), '# Guide\n\nNo citations remain.\n')
    const fixed = await scan(headRoot, 'fixed')
    expect((await diffSnapshotsWithRead(base.snapshot, fixed.snapshot, fixed.read)).findings).toEqual([])
  })

  it('T4-A10 / A11 delegates numeric ordering, ranges and release resolution', async () => {
    const base = await scan(await fixture('base'), 'base')
    const packages = base.snapshot.entities.filter(entity => entity.kind === 'package').map(packageFactFromEntity)
    const purl = packages[0]!.purl
    expect(toySourcePlugin.compareVersions!(purl, '2', '10')).toMatchObject({ status: 'resolved', value: -1 })
    expect(toySourcePlugin.compareVersions!(purl, '10', '2')).toMatchObject({ status: 'resolved', value: 1 })
    expect(toySourcePlugin.compareVersions!(purl, '2', '2')).toMatchObject({ status: 'resolved', value: 0 })
    expect(toySourcePlugin.normalizeVersion!(purl, '01').status).toBe('unresolved')
    for (const [value, expected] of [['0', false], ['1', true], ['2', true], ['3', true], ['4', false], ['10', false]] as const) expect(toySourcePlugin.satisfiesRange!(purl, value, 'vers:toy/>=1|<4')).toMatchObject({ status: 'resolved', value: expected })
    expect(toySourcePlugin.satisfiesRange!(purl, '2', 'vers:unknown/>=1').status).toBe('unresolved')
    const input = { read: base.read, signal: new AbortController().signal, packages, event: { eventId: 'release-1', tag: 'doc-bridge-v10', revision: 'head', evidence: packages[0]!.evidence } }
    expect(await toySourcePlugin.mapRelease!(input)).toMatchObject({ status: 'resolved', value: [{ purl, version: '10' }] })
    expect((await toySourcePlugin.mapRelease!({ ...input, event: { ...input.event, tag: 'unknown-v10' } })).status).toBe('unresolved')
    expect(await toySourcePlugin.mapRelease!({ ...input, packages: [...packages, ...packages] })).toMatchObject({ status: 'unresolved', reason: 'AMBIGUOUS_RELEASE' })
    expect(surfaceFactFromEntity(base.snapshot.entities.find(entity => entity.kind === 'cli-command')!).name).toBe('inspect')
    await expect(diffSnapshotsWithRead(base.snapshot, base.snapshot, { ...base.read, partition: { ...base.read.partition, revision: 'wrong' } })).rejects.toThrow('HEAD_PARTITION_MISMATCH')
  })
})
