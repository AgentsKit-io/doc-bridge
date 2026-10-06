import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { applyConfigDefaults } from '../src/config/defaults.js'
import { DocBridgeConfigV1Schema } from '../src/config/schema.js'
import { discoverRepository } from '../src/discovery/repository.js'
import { applyDocumentationDeclarations } from '../src/discovery/documentation.js'
import { buildDocBridgeIndex } from '../src/index-builder/build-index.js'
import { contentHashForArtifactV1, contentHashForIndex, contentHashForVersionedArtifact, LEGACY_HASH_ALGORITHM, SEMANTIC_HASH_ALGORITHM, sameHashIdentity, sha256NormalizedV1 } from '../src/index-builder/content-hash.js'
import { parseDiscoverySnapshot, parseReconciliationReport } from '../src/validate.js'
import { loadDocBridgeIndex, loadFreshDocBridgeIndex } from '../src/query/load-index.js'
import { runGate } from '../src/gates/run-gates.js'
import { auditDocumentation } from '../src/audit/documentation.js'
import { reconcileKnowledge } from '../src/reconciliation/reconcile.js'

const roots: string[] = []
afterEach(() => { vi.restoreAllMocks(); for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }) })
const config = applyConfigDefaults(DocBridgeConfigV1Schema.parse({ schemaVersion: 1, corpus: { agent: { root: 'docs' } } }))
const fixture = () => {
  const root = mkdtempSync(join(tmpdir(), 'doc-bridge-semantic-')); roots.push(root)
  mkdirSync(join(root, 'src')); mkdirSync(join(root, 'docs'))
  writeFileSync(join(root, 'package.json'), '{"name":"doc-bridge-fixture","version":"1.0.0"}')
  writeFileSync(join(root, 'src/run.ts'), 'export const run = () => 1\n')
  writeFileSync(join(root, 'docs/INDEX.md'), '# Index\n\nSee `src/run.ts`.\n')
  const git = (...args: string[]) => execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })
  git('init', '-q'); git('config', 'user.name', 'Doc Bridge Test'); git('config', 'user.email', 'test@example.invalid')
  git('add', '.'); git('commit', '-qm', 'test: initial tree')
  return { root, git }
}

describe('versioned semantic identity', () => {
  it('indexes the same Git tree at different revisions with equal semantic identity and distinct provenance', () => {
    const { root, git } = fixture()
    const before = discoverRepository({ root, config })
    const index = buildDocBridgeIndex({ root, config, snapshot: before, write: false }).index
    git('commit', '--allow-empty', '-qm', 'test: revision only')
    const after = discoverRepository({ root, config })
    expect(after.sourceRevision).not.toBe(before.sourceRevision)
    expect(after.contentHash).toBe(before.contentHash)
    expect(after.contentHashAlgo).toBe(SEMANTIC_HASH_ALGORITHM)
    expect(auditDocumentation({ snapshot: after, declared: after, reconciliation: reconcileKnowledge(after, after), root }).contentHash).toBe(auditDocumentation({ snapshot: before, declared: before, reconciliation: reconcileKnowledge(before, before), root }).contentHash)
    expect(reconcileKnowledge(after, after).contentHash).toBe(reconcileKnowledge(before, before).contentHash)
    expect(buildDocBridgeIndex({ root, config, snapshot: after, write: false }).index.contentHash).toBe(index.contentHash)
    expect(contentHashForVersionedArtifact({ ...after, generatedAt: 'different time' })).toBe(after.contentHash)
    expect(contentHashForVersionedArtifact({ ...after, entities: [...after.entities].reverse(), relations: [...after.relations].reverse(), coverage: [...after.coverage].reverse() })).toBe(after.contentHash)
  })

  it('reuses a real scan without changing snapshot, declaration, retrieval or index identity', () => {
    const { root } = fixture()
    const cold = discoverRepository({ root, config })
    const warm = discoverRepository({ root, config, previous: cold })
    expect(warm.coverage.find((item) => item.scope === 'reused-entities')).not.toEqual(cold.coverage.find((item) => item.scope === 'reused-entities'))
    expect(warm.contentHash).toBe(cold.contentHash)
    const docs = [{ path: 'docs/INDEX.md', content: readFileSync(join(root, 'docs/INDEX.md'), 'utf8') }]
    expect(applyDocumentationDeclarations(warm, docs).snapshot.contentHash).toBe(applyDocumentationDeclarations(cold, docs).snapshot.contentHash)
    const a = buildDocBridgeIndex({ root, config, snapshot: cold, write: false }).index
    const b = buildDocBridgeIndex({ root, config, snapshot: warm, write: false }).index
    expect(b.projection?.contentHash).toBe(a.projection?.contentHash)
    expect(b.contentHash).toBe(a.contentHash)
    const reordered = { ...cold, entities: [...cold.entities].reverse(), relations: [...cold.relations].reverse() }
    expect(buildDocBridgeIndex({ root, config, snapshot: reordered, write: false }).index.contentHash).toBe(a.contentHash)
  })

  it('invalidates content, effective configuration, analyzer semantics and meaningful coverage', () => {
    const { root } = fixture()
    const initial = discoverRepository({ root, config })
    expect(discoverRepository({ root, config: { ...config, project: { name: 'changed' } } }).contentHash).not.toBe(initial.contentHash)
    const versioned = { ...initial, analyzerVersions: { ...initial.analyzerVersions, repository: 'next' } }
    const changedAnalyzer = { ...versioned, contentHash: contentHashForVersionedArtifact(versioned) }
    expect(buildDocBridgeIndex({ root, config, snapshot: changedAnalyzer, write: false }).index.contentHash).not.toBe(buildDocBridgeIndex({ root, config, snapshot: initial, write: false }).index.contentHash)
    writeFileSync(join(root, 'src/run.ts'), 'export const run = () => 2\n')
    expect(discoverRepository({ root, config }).contentHash).not.toBe(initial.contentHash)
    expect(contentHashForVersionedArtifact({ ...initial, analyzerVersions: { ...initial.analyzerVersions, repository: 'next' } })).not.toBe(initial.contentHash)
    expect(contentHashForVersionedArtifact({ ...initial, coverage: [...initial.coverage, { analyzer: 'repository', scope: 'limited', status: 'partial', reason: 'budget' }] })).not.toBe(initial.contentHash)
    expect(contentHashForVersionedArtifact({ ...initial, project: { name: 'other' } })).not.toBe(initial.contentHash)
  })

  it('verifies legacy indexes under their original projection and reports migration without writing', () => {
    const { root } = fixture()
    const legacy = buildDocBridgeIndex({ root, config, hashAlgorithm: LEGACY_HASH_ALGORITHM }).index
    expect(legacy.contentHash).toBe(sha256NormalizedV1({ schemaVersion: 1, knowledge: legacy.knowledge, handoffs: legacy.handoffs, lookup: legacy.lookup, retrieval: legacy.retrieval, inputs: legacy.inputs, projection: legacy.projection?.contentHash }))
    const scanned = discoverRepository({ root, config })
    const old = { ...scanned, contentHashAlgo: LEGACY_HASH_ALGORITHM }
    const snapshot = { ...old, contentHash: contentHashForArtifactV1(old) }
    expect(parseDiscoverySnapshot(snapshot)).toEqual(snapshot)
    const report = reconcileKnowledge(snapshot, snapshot)
    expect(parseReconciliationReport(report)).toEqual(report)
    expect(() => parseDiscoverySnapshot({ ...snapshot, sourceRevision: 'tampered' })).toThrow('Invalid artifact content hash')
    expect(() => parseDiscoverySnapshot({ ...snapshot, contentHashAlgo: 'unknown' })).toThrow('compatible doc-bridge version')
    expect(loadDocBridgeIndex(root, config)).toEqual(legacy)
    expect(loadFreshDocBridgeIndex(root, config)).toEqual(legacy)
    const bytes = readFileSync(join(root, '.doc-bridge/index.json'), 'utf8')
    const gate = runGate(root, config, 'index-freshness')
    expect(runGate(root, config, 'index-reproducible').ok).toBe(true)
    expect(gate.ok).toBe(true); expect(gate.message).toContain('ak-docs index to migrate')
    expect(readFileSync(join(root, '.doc-bridge/index.json'), 'utf8')).toBe(bytes)
    expect(sameHashIdentity(legacy, { ...legacy, contentHashAlgo: SEMANTIC_HASH_ALGORITHM })).toBe(false)
    writeFileSync(join(root, '.doc-bridge/index.json'), JSON.stringify({ ...legacy, contentHash: 'f'.repeat(64) }))
    expect(runGate(root, config, 'index-freshness').ok).toBe(false)
  })

  it('reports committed legacy drift before migration writes and keeps freshness fail-closed', () => {
    const { root, git } = fixture()
    buildDocBridgeIndex({ root, config, hashAlgorithm: LEGACY_HASH_ALGORITHM })
    git('add', '.doc-bridge/index.json'); git('commit', '-qm', 'test: legacy artifact')
    writeFileSync(join(root, 'src/run.ts'), 'export const run = () => 3\n')
    expect(runGate(root, config, 'index-freshness').ok).toBe(false)
    const before = readFileSync(join(root, '.doc-bridge/index.json'), 'utf8')
    const warning = vi.spyOn(console, 'warn').mockImplementation((message: string) => {
      expect(message).toContain('Committed index drift detected under sha256-normalized-v1')
      expect(message).toContain('migrates to sha256-semantic-v1')
      expect(readFileSync(join(root, '.doc-bridge/index.json'), 'utf8')).toBe(before)
    })
    const migrated = buildDocBridgeIndex({ root, config }).index
    expect(warning).toHaveBeenCalledOnce()
    expect(migrated.contentHashAlgo).toBe(SEMANTIC_HASH_ALGORITHM)
    expect(loadFreshDocBridgeIndex(root, config).contentHash).toBe(migrated.contentHash)
    expect(runGate(root, config, 'index-freshness').ok).toBe(true)
    expect(runGate(root, config, 'index-reproducible').ok).toBe(true)
    expect(migrated.contentHash).toBe(contentHashForIndex(migrated))
  })

  it('fails unknown algorithms with actionable diagnostics and leaves the artifact intact', () => {
    const { root } = fixture()
    const index = buildDocBridgeIndex({ root, config }).index
    const bytes = JSON.stringify({ ...index, contentHashAlgo: 'sha256-future-v9' })
    writeFileSync(join(root, '.doc-bridge/index.json'), bytes)
    expect(() => loadDocBridgeIndex(root, config)).toThrow('explicitly regenerate with ak-docs index')
    expect(runGate(root, config, 'index-freshness')).toMatchObject({ ok: false, message: expect.stringContaining('compatible doc-bridge version') })
    expect(readFileSync(join(root, '.doc-bridge/index.json'), 'utf8')).toBe(bytes)
  })

  it('preserves the legacy artifact projection used by study hashes', () => {
    const artifact = { type: 'study-test', contentHash: '0'.repeat(64), contentHashAlgo: LEGACY_HASH_ALGORITHM, sourceRevision: 'one', generatedAt: 'time' }
    expect(contentHashForVersionedArtifact(artifact)).toBe(contentHashForArtifactV1(artifact))
    expect(contentHashForArtifactV1(artifact)).toBe(sha256NormalizedV1({ type: 'study-test', contentHashAlgo: LEGACY_HASH_ALGORITHM, sourceRevision: 'one', generatedAt: 'time' }))
    expect(contentHashForArtifactV1({ ...artifact, sourceRevision: 'two' })).not.toBe(contentHashForArtifactV1(artifact))
  })
})
