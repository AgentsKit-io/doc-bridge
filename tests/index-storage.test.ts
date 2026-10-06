import { runWorkflow, readStoredWorkflowManifest, writeStoredWorkflowManifest, readStoredWorkflowStep, writeStoredWorkflowStep } from '../src/workflow/engine.js'
import { sealEnrichmentOverlay, readStoredEnrichmentOverlay, writeStoredEnrichmentOverlay } from '../src/enrich/overlay.js'
import { applyConfigDefaults } from '../src/config/defaults.js'
import { DocBridgeConfigV1Schema } from '../src/config/schema.js'
import { readRepositoryFiles, INDEX_READ_PATTERNS } from '../src/index-builder/repository-io.js'
import { scanHumanDocRecords } from '../src/index-builder/human-adapters/index.js'
import { parseRetrievalSuite, runRetrievalBench } from '../src/bench/retrieval.js'
import { searchIndex } from '../src/query/search.js'
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { loadConfig } from '../src/config/load-config.js'
import { discoverRepository } from '../src/discovery/repository.js'
import { buildDocBridgeIndex, buildStoredDocBridgeIndex } from '../src/index-builder/build-index.js'
import { readJsonArtifact, writeJsonArtifact } from '../src/index-builder/artifact-io.js'
import { readStoredSnapshot, writeStoredSnapshot } from '../src/index-builder/snapshot-io.js'
import { createStoredEnrichmentCache } from '../src/enrich/cache.js'
import { createStoredApprovalStore } from '../src/enrich/approvals.js'
import { loadStoredDocBridgeIndex, loadFreshStoredDocBridgeIndex } from '../src/query/load-index.js'
import { runQuery } from '../src/query/query.js'
import { createLocalRepositoryRead, contentRef } from '../src/storage/local.js'
import { createLocalArtifactIO } from '../src/storage/artifacts.js'
import type { Partition } from '../src/storage/contract.js'

const roots: string[] = []
const temporary = () => { const root = mkdtempSync(join(tmpdir(), 'doc-bridge-index-storage-')); roots.push(root); return root }
afterEach(() => roots.splice(0).forEach(root => rmSync(root, { recursive: true, force: true })))
const limits = { maxFiles: 200_000, maxBytes: 512 * 1024 * 1024, maxFileBytes: 32 * 1024 * 1024, maxTimeMs: 120_000, maxMemoryMb: 4096 }
const inventory = (root: string) => {
  const result: Record<string, ReturnType<typeof contentRef>> = {}
  const visit = (dir: string, prefix = '') => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (['node_modules', '.git', 'dist', '.doc-bridge', '.next', 'coverage'].includes(entry.name)) continue
      const path = prefix ? `${prefix}/${entry.name}` : entry.name
      if (entry.isDirectory()) visit(join(dir, entry.name), path)
      else if (entry.isFile()) result[path] = contentRef(readFileSync(join(root, path)))
    }
  }
  visit(root)
  return result
}

describe('exact partition indexing and persistence', () => {
  for (const source of ['tests/fixtures/sample-project', '.']) {
    it(`preserves index/query/handoff payloads on ${source}`, async () => {
      const root = resolve(source)
      const config = loadConfig({ cwd: root }).config
      const snapshot = discoverRepository({ root, config })
      const partition = { repositoryId: 'fixture', revision: 'head' }
      const request = { partition, signal: new AbortController().signal }
      const repository = await createLocalRepositoryRead({ root, partition, limits, inventory: inventory(root) })
      const artifacts = await createLocalArtifactIO({ root: temporary(), partition, limits })
      const legacy = buildDocBridgeIndex({ root, config, snapshot, overlay: 'ignore', write: false }).index
      expect((await writeJsonArtifact(artifacts, request, { kind: 'index', name: 'index' }, 'DocBridgeIndexV1', legacy, null)).status).toBe('ok')
      const built = await buildStoredDocBridgeIndex({ ...request, repository, artifacts, config, snapshot, overlay: 'ignore' })
      expect(built.status).toBe('ok')
      if (built.status !== 'ok') return
      expect(built.value.limitations).toEqual([])
      expect(JSON.stringify(built.value.index)).toBe(JSON.stringify(legacy))
      const loaded = await loadFreshStoredDocBridgeIndex(artifacts, repository, request, config)
      expect(loaded.status).toBe('ok')
      for (const term of ['storage', 'authentication', 'documentation', 'index', 'query']) {
        expect(runQuery(built.value.index, config, { kind: 'search', term })).toEqual(runQuery(legacy, config, { kind: 'search', term }))
        expect(runQuery(built.value.index, config, { kind: 'search', term, agent: true, contextBudgetTokens: 1024 })).toEqual(runQuery(legacy, config, { kind: 'search', term, agent: true, contextBudgetTokens: 1024 }))
      }
      const suite = parseRetrievalSuite(JSON.parse(readFileSync(resolve('docs/bench/retrieval-suite-v1.json'), 'utf8')))
      for (const entry of suite.cases) expect(searchIndex(built.value.index, entry.input, 20)).toEqual(searchIndex(legacy, entry.input, 20))
      expect(runRetrievalBench({ index: built.value.index, suite })).toEqual(runRetrievalBench({ index: legacy, suite }))
      const repeat = await buildStoredDocBridgeIndex({ ...request, repository, artifacts, config, snapshot, overlay: 'ignore' })
      expect(repeat.status === 'ok' && repeat.value.index).toEqual(built.value.index)
      expect((await writeStoredSnapshot(artifacts, request, snapshot, null)).status).toBe('ok')
      const restored = await readStoredSnapshot(artifacts, request)
      expect(restored.status === 'ok' && restored.value.value).toEqual(snapshot)
      const overlay = sealEnrichmentOverlay({ type: 'enrichment-overlay', schemaVersion: 1, contentHashAlgo: 'sha256-normalized-v1', project: snapshot.project, sourceRevision: snapshot.sourceRevision, sourceRevisionKind: snapshot.sourceRevisionKind, configurationHash: snapshot.configurationHash, pipelineVersion: snapshot.pipelineVersion, analyzerVersions: snapshot.analyzerVersions, baseSnapshotHash: snapshot.contentHash, accepted: [], pending: [], rejected: [], stats: { byKind: {}, rejectionReasons: {}, inventedReferences: 0, agentRuns: 0, cacheHits: 0, cacheHitRate: 1, packs: 0, inputBytes: 0, outputBytes: 0, wallTimeMs: 0, expired: 0 } })
      expect((await writeStoredEnrichmentOverlay(artifacts, request, overlay, null)).status).toBe('ok')
      const restoredOverlay = await readStoredEnrichmentOverlay(artifacts, request)
      expect(restoredOverlay.status === 'ok' && restoredOverlay.value.value).toEqual(overlay)
    }, 120_000)
  }

  it('uses only a bound snapshot inventory and verifies tampered source refs physically', async () => {
    const root = temporary()
    mkdirSync(join(root, 'src'))
    writeFileSync(join(root, 'package.json'), '{"name":"fixture"}')
    writeFileSync(join(root, 'nx.json'), '{}')
    writeFileSync(join(root, 'project.json'), '{"name":"fixture","root":"src","targets":{"test":{}}}')
    writeFileSync(join(root, 'src/api.ts'), 'export const value = 1\n')
    writeFileSync(join(root, 'src/other.ts'), 'export const other = 2\n')
    writeFileSync(join(root, 'README.md'), '# Fixture\n')
    const config = applyConfigDefaults(DocBridgeConfigV1Schema.parse({ schemaVersion: 1, corpus: { agent: { root: '.' } }, routing: { plugin: 'nx' } }))
    const snapshot = discoverRepository({ root, config })
    const partition = { repositoryId: 'fixture', revision: snapshot.sourceRevision }
    const request = { partition, signal: new AbortController().signal }
    const pinned = inventory(root)
    const base = await createLocalRepositoryRead({ root, partition, limits, inventory: pinned })
    const listing = await base.list({ ...request, under: '.', include: [...INDEX_READ_PATTERNS], exclude: [] })
    expect(listing.status).toBe('ok')
    if (listing.status !== 'ok') return
    const snapshotBinding = { partition, snapshotHash: snapshot.contentHash, visibilityPolicyHash: listing.value.visibilityPolicyHash }
    const paths: string[] = []
    const repository = { ...base, async read(input: Parameters<typeof base.read>[0]) { paths.push(input.path); return base.read(input) } }
    const artifacts = await createLocalArtifactIO({ root: temporary(), partition, limits })
    const native = buildDocBridgeIndex({ root, config, snapshot, write: false, overlay: 'ignore' }).index
    const options = { ...request, repository, artifacts, config, snapshot, snapshotBinding, write: false, overlay: 'ignore' as const }
    const built = await buildStoredDocBridgeIndex(options)
    expect(built.status).toBe('ok')
    if (built.status !== 'ok') return
    expect(built.value.limitations).toEqual([])
    expect({ ...built.value.index, generatedAt: native.generatedAt }).toEqual(native)
    expect(paths).not.toContain('src/api.ts')
    paths.length = 0
    const wrongReceipt = await buildStoredDocBridgeIndex({ ...options, snapshotBinding: { ...snapshotBinding, visibilityPolicyHash: 'a'.repeat(64) } })
    expect(wrongReceipt.status).toBe('ok')
    expect(paths).toContain('src/api.ts')
    const tampered = await createLocalRepositoryRead({ root, partition, limits, inventory: { ...pinned, 'src/api.ts': { algorithm: 'sha256-normalized-v1', hash: 'b'.repeat(64) } } })
    paths.length = 0
    const checking = { ...tampered, async read(input: Parameters<typeof base.read>[0]) { paths.push(input.path); return tampered.read(input) } }
    const result = await buildStoredDocBridgeIndex({ ...options, repository: checking })
    expect(paths).toContain('src/api.ts')
    expect(paths).toContain('src/other.ts')
    expect(result.status).toBe('ok')
    expect(result.status === 'ok' && result.value.limitations).toContainEqual({ partition, path: 'src/api.ts', status: 'mismatch', code: 'CONTENT_MISMATCH' })
  })

  it('retains the real local sidebar byte ceiling on injected reads', async () => {
    const root = temporary()
    mkdirSync(join(root, 'docs'))
    writeFileSync(join(root, 'package.json'), '{"name":"fixture"}')
    writeFileSync(join(root, 'docs/guide.md'), '# Guide\n')
    writeFileSync(join(root, 'sidebars.js'), 'module.exports = {docs: []}; /*' + 'x'.repeat(1_048_576) + '*/')
    const config = applyConfigDefaults(DocBridgeConfigV1Schema.parse({ schemaVersion: 1, corpus: { agent: { root: 'docs' }, human: { plugin: 'docusaurus', options: { docsDir: 'docs', sidebarsFile: 'sidebars.js' } } } }))
    const snapshot = discoverRepository({ root, config })
    const partition = { repositoryId: 'fixture', revision: snapshot.sourceRevision }
    const request = { partition, signal: new AbortController().signal }
    const repository = await createLocalRepositoryRead({ root, partition, limits, inventory: inventory(root) })
    const artifacts = await createLocalArtifactIO({ root: temporary(), partition, limits })
    expect(() => buildDocBridgeIndex({ root, config, snapshot, write: false })).toThrow('1048576 byte limit')
    await expect(buildStoredDocBridgeIndex({ ...request, repository, artifacts, config, snapshot, write: false })).rejects.toThrow('1048576 byte limit')
  })

  it('preserves BOM/CRLF document payloads while verifying file and Markdown identities separately', async () => {
    const root = temporary()
    writeFileSync(join(root, 'package.json'), '{"name":"fixture"}')
    writeFileSync(join(root, 'README.md'), '\uFEFF---\r\nid: fixture\r\n---\r\n# Fixture\r\n\r\nOriginal documentation.\r\n')
    const config = applyConfigDefaults(DocBridgeConfigV1Schema.parse({ schemaVersion: 1, corpus: { agent: { root: '.' } } }))
    const snapshot = discoverRepository({ root, config })
    const partition = { repositoryId: 'fixture', revision: snapshot.sourceRevision }
    const request = { partition, signal: new AbortController().signal }
    const repository = await createLocalRepositoryRead({ root, partition, limits, inventory: inventory(root) })
    const artifacts = await createLocalArtifactIO({ root: temporary(), partition, limits })
    const native = buildDocBridgeIndex({ root, config, snapshot, overlay: 'ignore', write: false }).index
    const result = await buildStoredDocBridgeIndex({ ...request, repository, artifacts, config, snapshot, overlay: 'ignore', write: false })
    expect(result.status).toBe('ok')
    if (result.status !== 'ok') return
    expect(result.value.limitations).toEqual([])
    expect({ ...result.value.index, generatedAt: native.generatedAt }).toEqual(native)
  })

  it('preserves every built-in human adapter on the fixture', async () => {
    const root = resolve('tests/fixtures/sample-project')
    const partition = { repositoryId: 'fixture', revision: 'head' }
    const request = { partition, signal: new AbortController().signal }
    const repository = await createLocalRepositoryRead({ root, partition, limits, inventory: inventory(root) })
    const { files, limitations } = await readRepositoryFiles(repository, request, INDEX_READ_PATTERNS)
    expect(limitations).toEqual([])
    const config = loadConfig({ cwd: root }).config
    for (const plugin of ['plain-markdown', 'fumadocs', 'nextra', 'vitepress', 'starlight', 'docusaurus'] as const) {
      config.corpus.human = { plugin, options: { root: 'docs/human', contentDir: 'docs/human', docsDir: 'docs/human', urlPrefix: '/docs' } }
      expect(scanHumanDocRecords(root, config, files)).toEqual(scanHumanDocRecords(root, config))
    }
  })

  it('preserves local build-directory corpus policy only with explicit compatibility excludes', async () => {
    const root = temporary()
    mkdirSync(join(root, 'build'))
    writeFileSync(join(root, 'package.json'), '{"name":"fixture","packageManager":"pnpm@10"}')
    writeFileSync(join(root, 'nx.json'), '{}')
    writeFileSync(join(root, 'project.json'), '{"name":"fixture","targets":{"test":{}}}')
    writeFileSync(join(root, 'README.md'), '# Fixture\n')
    writeFileSync(join(root, 'build/guide.md'), '# Built guide\n\nCompatibility corpus.\n')
    const config = applyConfigDefaults(DocBridgeConfigV1Schema.parse({ schemaVersion: 1, corpus: { agent: { root: '.' }, human: { plugin: 'plain-markdown', options: { root: 'build' } } }, routing: { plugin: 'nx' } }))
    const snapshot = discoverRepository({ root, config })
    const partition = { repositoryId: 'fixture', revision: snapshot.sourceRevision }
    const request = { partition, signal: new AbortController().signal }
    const artifacts = await createLocalArtifactIO({ root: temporary(), partition, limits })
    const pinned = inventory(root)
    const strict = await createLocalRepositoryRead({ root, partition, limits, inventory: pinned })
    const compatible = await createLocalRepositoryRead({ root, partition, limits, inventory: pinned, excludes: ['**/.git/**', '**/node_modules/**', '**/dist/**', '**/coverage/**', '**/.doc-bridge/**'] })
    const native = buildDocBridgeIndex({ root, config, snapshot, overlay: 'ignore', write: false }).index
    const injected = await buildStoredDocBridgeIndex({ ...request, repository: compatible, artifacts, config, snapshot, overlay: 'ignore', write: false })
    expect(injected.status).toBe('ok')
    if (injected.status !== 'ok') return
    expect({ ...injected.value.index, generatedAt: native.generatedAt }).toEqual(native)
    const restricted = await buildStoredDocBridgeIndex({ ...request, repository: strict, artifacts, config, snapshot, overlay: 'ignore', write: false })
    expect(restricted.status === 'ok' && restricted.value.index.knowledge.some(entry => entry.path.endsWith('build/guide.md'))).toBe(false)
    const strictListing = await strict.list({ ...request, under: '.', include: ['**/*.md'], exclude: [] })
    const compatibleListing = await compatible.list({ ...request, under: '.', include: ['**/*.md'], exclude: [] })
    expect(strictListing.status === 'ok' && compatibleListing.status === 'ok' && strictListing.value.visibilityPolicyHash !== compatibleListing.value.visibilityPolicyHash).toBe(true)
  })

  it('isolates identical keys and cache/approval evidence across two repositories and two revisions', async () => {
    const root = temporary()
    const key = { kind: 'workflow', name: 'same' } as const
    const stores: { partition: Partition; io: Awaited<ReturnType<typeof createLocalArtifactIO>> }[] = []
    const cacheInput = { task: 'review', agentId: 'fixture', agentVersion: '1', promptVersion: '1', packHash: 'a'.repeat(64) } as const
    for (const repositoryId of ['a', 'b']) for (const revision of ['base', 'head']) {
      const partition = { repositoryId, revision }
      const io = await createLocalArtifactIO({ root, partition, limits })
      stores.push({ partition, io })
      const request = { partition, signal: new AbortController().signal }
      expect((await writeJsonArtifact(io, request, key, 'FixtureV1', partition, null)).status).toBe('ok')
      expect((await createStoredEnrichmentCache(io, request).write(cacheInput, [partition], null)).status).toBe('ok')
      await createStoredApprovalStore(io, request).put({ id: 'a'.repeat(64), name: 'fixture', payload: partition, status: 'approved', createdAt: '2026-01-01' })
    }
    for (const { partition, io } of stores) {
      const request = { partition, signal: new AbortController().signal }
      const read = await readJsonArtifact(io, request, key, 'FixtureV1', value => value)
      expect(read.status === 'ok' && read.value.value).toEqual(partition)
      const cached = await createStoredEnrichmentCache(io, request).read(cacheInput)
      expect(cached.status === 'ok' && cached.value.value).toEqual([partition])
      expect((await createStoredApprovalStore(io, request).get('a'.repeat(64)))?.payload).toEqual(partition)
      expect(await loadStoredDocBridgeIndex(io, request)).toEqual({ status: 'missing', code: 'NOT_FOUND' })
      expect(await readJsonArtifact(io, { ...request, partition: { repositoryId: 'other', revision: partition.revision } }, key, 'FixtureV1', value => value)).toEqual({ status: 'denied', code: 'PARTITION_MISMATCH' })
    }
    expect(readdirSync(root)).toHaveLength(4)
  })

  it('persists and verifies real workflow manifests and create-only stage outputs', async () => {
    const partition = { repositoryId: 'fixture', revision: 'head' }
    const request = { partition, signal: new AbortController().signal }
    const io = await createLocalArtifactIO({ root: temporary(), partition, limits })
    const value = { collected: true }
    const { run } = runWorkflow({ root: temporary(), sourceRevision: partition.revision, configurationHash: 'a'.repeat(64), stage: 'collect', handlers: { collect: () => value } })
    expect((await writeStoredWorkflowManifest(io, request, run, null)).status).toBe('ok')
    const manifest = await readStoredWorkflowManifest(io, request)
    expect(manifest.status === 'ok' && manifest.value.value).toEqual(run)
    const step = run.steps.find(step => step.name === 'collect')!
    expect((await writeStoredWorkflowStep(io, request, 'collect', step.inputHash!, value)).status).toBe('ok')
    const restored = await readStoredWorkflowStep(io, request, 'collect', step)
    expect(restored.status === 'ok' && restored.value.value).toEqual(value)
    expect((await writeStoredWorkflowStep(io, request, 'collect', step.inputHash!, value)).status).toBe('mismatch')
    expect((await readStoredWorkflowStep(io, request, 'collect', { ...step, outputHash: 'b'.repeat(64) })).status).toBe('denied')
    const other = await createLocalArtifactIO({ root: temporary(), partition: { ...partition, revision: 'base' }, limits })
    expect((await writeStoredWorkflowManifest(other, { ...request, partition: other.partition }, run, null)).status).toBe('denied')
  })

  it('retains the previous real artifact when atomic replacement fails and rejects stale CAS', async () => {
    const root = temporary()
    const partition = { repositoryId: 'fixture', revision: 'head' }
    const request = { partition, signal: new AbortController().signal }
    const io = await createLocalArtifactIO({ root, partition, limits })
    const key = { kind: 'index', name: 'fixture' } as const
    const first = await writeJsonArtifact(io, request, key, 'FixtureV1', { value: 1 }, null)
    expect(first.status).toBe('ok')
    if (first.status !== 'ok') return
    const faulty = await createLocalArtifactIO({ root, partition, limits, beforeRename: () => { throw new Error('injected failure') } })
    expect((await writeJsonArtifact(faulty, request, key, 'FixtureV1', { value: 2 }, first.value.byteHash)).status).toBe('error')
    const prior = await readJsonArtifact(io, request, key, 'FixtureV1', value => value)
    expect(prior.status === 'ok' && prior.value.value).toEqual({ value: 1 })
    const race = await Promise.all([2, 3].map(value => writeJsonArtifact(io, request, key, 'FixtureV1', { value }, first.value.byteHash)))
    expect(race.filter(result => result.status === 'ok')).toHaveLength(1)
    expect(race.filter(result => result.status === 'mismatch' && result.code === 'CAS_CONFLICT')).toHaveLength(1)
    const names: string[] = []
    const visit = (dir: string) => readdirSync(dir, { withFileTypes: true }).forEach(entry => entry.isDirectory() ? visit(join(dir, entry.name)) : names.push(entry.name))
    visit(root)
    expect(names).toEqual(['fixture.json'])
  })

  for (const mutation of ['missing', 'mismatch']) it(`reports exact body availability for ${mutation}`, async () => {
    const root = temporary()
    writeFileSync(join(root, 'package.json'), '{"name":"fixture"}')
    writeFileSync(join(root, 'README.md'), '# Original\n\nOriginal body evidence.\n')
    const config = loadConfig({ cwd: resolve('tests/fixtures/sample-project') }).config
    config.corpus.agent.root = '.'
    delete config.corpus.human
    delete config.routing
    const snapshot = discoverRepository({ root, config })
    const pinned = inventory(root)
    const partition = { repositoryId: 'fixture', revision: 'old' }
    const request = { partition, signal: new AbortController().signal }
    const repository = await createLocalRepositoryRead({ root, partition, limits, inventory: pinned })
    const artifacts = await createLocalArtifactIO({ root: temporary(), partition, limits })
    if (mutation === 'missing') rmSync(join(root, 'README.md'))
    else writeFileSync(join(root, 'README.md'), '# Changed\n\nDifferent evidence.\n')
    const result = await buildStoredDocBridgeIndex({ ...request, repository, artifacts, config, snapshot, overlay: 'ignore', write: false })
    if (mutation === 'missing') {
      expect(result.status).toBe('mismatch')
      expect('limitations' in result && result.limitations).toContainEqual({ partition, path: 'README.md', status: 'missing', code: 'NOT_FOUND' })
      return
    }
    expect(result.status).toBe('ok')
    if (result.status !== 'ok') return
    expect(result.value.limitations).toContainEqual({ partition, path: 'README.md', status: mutation === 'missing' ? 'missing' : 'mismatch', code: mutation === 'missing' ? 'NOT_FOUND' : 'CONTENT_MISMATCH' })
    expect(JSON.stringify(result.value.index.projection?.entries.find(entry => entry.path === 'README.md')?.fields)).not.toContain('different')
  })
})
