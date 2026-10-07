import { afterEach, describe, expect, it } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { createFinding, routeFinding } from '../src/findings/contracts.js'
import { recordDecision, findingSuppressed, replayRemediation } from '../src/enrich/settled.js'
import { createRemediation, regionHash } from '../src/fixes/regions.js'
import { createEnrichmentCache } from '../src/enrich/cache.js'
import { readEnrichmentOverlay } from '../src/enrich/overlay.js'
import { runEnrichment } from '../src/enrich/stage.js'
import { applyConfigDefaults } from '../src/config/defaults.js'
import { DocBridgeConfigV1Schema } from '../src/config/schema.js'
import { discoverRepository } from '../src/discovery/repository.js'
import { reconcileKnowledge } from '../src/reconciliation/reconcile.js'
import { diffSnapshots } from '../src/diff/change-set.js'

const roots: string[] = []
const project = () => { const root = mkdtempSync(join(tmpdir(), 'doc-bridge-findings-')); roots.push(root); return root }
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }) })
const hash = 'a'.repeat(64)
const finding = (relevant: unknown = { symbol: 'old', removed: true }) => createFinding({ category: 'broken-reference', assertion: { document: 'guide.md', key: 'old' }, status: 'conflict', layer: 'L0', confidence: 1, severity: 'warn', entities: ['module:code.ts'], evidence: [{ source: 'documentation', path: 'guide.md', lineStart: 2, lineEnd: 2, contentHash: hash }], routing: 'proposed', coverage: [], provenance: { repository: 'fixture', revision: 'r1', configurationHash: hash } }, relevant)
const config = applyConfigDefaults(DocBridgeConfigV1Schema.parse({ schemaVersion: 1, corpus: { agent: { root: '.', index: 'guide.md' } }, intelligence: { registry: { enabled: true, agentId: 'fixture-agent' } } }))

describe('finding policy and settled decisions', () => {
  it('keeps category/status/routing separate and identity stable across provenance, changing only for relevant content', () => {
    const first = finding()
    const next = createFinding({ ...first, provenance: { ...first.provenance, revision: 'r2' } }, { symbol: 'old', removed: true })
    expect(next.id).toBe(first.id)
    expect(finding({ symbol: 'old', removed: false }).id).not.toBe(first.id)
    const archived = routeFinding(first, { content: '---\nlifecycle: archived\n---\n# API' })
    expect(archived).toMatchObject({ category: 'broken-reference', status: 'conflict', routing: 'excluded' })
    expect(archived.coverage[0]?.reason).toContain('Historical')
    expect(routeFinding(first, { content: '# API', migrationSuspicious: true })).toMatchObject({ status: 'conflict', routing: 'routed-to-L2' })
    const historical = { ...first, assertion: { ...first.assertion, document: 'historical/guide.md' } }
    expect(routeFinding(historical, { content: '# API' }).routing).toBe('excluded')
    expect(routeFinding(historical, { content: '---\nlifecycle: active\n---\n# API' }).routing).toBe('proposed')
    expect(routeFinding(first, { content: '<!-- doc-bridge:generated -->\nold\n<!-- /doc-bridge:generated -->', generator: 'generate-docs' })).toMatchObject({ routing: 'excluded', generator: 'generate-docs' })
  })
  it('uses real version eligibility for pending targets and leaves evidence status unchanged', () => {
    const root = project(); writeFileSync(join(root, 'guide.md'), '# API')
    const snapshot = discoverRepository({ root })
    const changeSet = diffSnapshots(snapshot, snapshot).changeSet
    const first = finding()
    expect(routeFinding(first, { content: '# API', changeSet, target: { state: 'latest-released', source: 'implicit', evidence: [] } })).toMatchObject({ routing: 'pending-version', status: 'conflict' })
    expect(routeFinding(first, { content: '# API', changeSet, target: { state: 'default-branch', source: 'frontmatter', evidence: [] } }).routing).toBe('proposed')
    expect(routeFinding(first, { content: '# API', changeSet, target: { state: 'unresolved', source: 'frontmatter', evidence: [], reason: 'Invalid target' } }).routing).toBe('pending-version')
  })
  it('persists both rejection targets through disk-cache replay and a real enrichment rerun without suppressing alternate corrections', async () => {
    const root = project(); writeFileSync(join(root, 'guide.md'), '# API\nold\n')
    const snapshot = discoverRepository({ root, config }), report = reconcileKnowledge(snapshot, snapshot, {})
    const run = () => runEnrichment({ root, config, snapshot, report, agent: { call: async () => [], version: () => '1' } })
    await run()
    const first = finding()
    const remediation = createRemediation(root, { findingId: first.id, evidenceHash: first.evidenceHash, baseRevision: 'r1', configurationHash: hash, edits: [{ path: 'guide.md', range: { start: 6, end: 9 }, expectedRegionHash: regionHash('old'), original: 'old', replacement: 'new', lineStart: 2, lineEnd: 2 }] }, { currentRevision: 'r1', configurationHash: hash, evidenceHash: first.evidenceHash, allowedRoots: ['.'], validateEvidence: () => true })
    const identity = (by: string) => by === 'maintainer'
    const decision = { type: 'decision', schemaVersion: 1, target: { kind: 'remediation', id: remediation.id }, by: 'maintainer', reason: 'wrong-fix', evidenceHash: first.evidenceHash }
    expect(() => recordDecision(root, decision, remediation, () => false)).toThrow('authenticated')
    expect(() => recordDecision(root, { ...decision, evidenceHash: hash }, remediation, identity)).toThrow('binding')
    recordDecision(root, decision, remediation, identity)
    const cache = createEnrichmentCache(root), key = { task: 'review' as const, agentId: 'fixture', agentVersion: '1', promptVersion: '1', packHash: hash }
    cache.write(key, [first, remediation])
    const replay = createEnrichmentCache(root).read(key)!
    await run()
    let entries = readEnrichmentOverlay(root)!.rejected
    expect(replayRemediation(replay[1] as typeof remediation, entries).status).toBe('rejected')
    expect(findingSuppressed(replay[0] as typeof first, entries)).toBe(false)
    expect(replayRemediation({ ...remediation, id: 'different-correction' }, entries).status).toBe('proposed')
    recordDecision(root, { ...decision, target: { kind: 'finding', id: first.id }, reason: 'not-a-divergence' }, first, identity)
    await run()
    entries = readEnrichmentOverlay(root)!.rejected
    expect(findingSuppressed(first, entries)).toBe(true)
    expect(findingSuppressed(finding({ symbol: 'old', removed: false }), entries)).toBe(false)
    expect(entries.filter(entry => entry.decision)).toHaveLength(2)
    recordDecision(root, { ...decision, target: { kind: 'finding', id: first.id }, reason: 'code-should-change' }, first, identity)
    expect(readEnrichmentOverlay(root)!.rejected.find(entry => entry.decision?.target.kind === 'finding')?.decision?.reason).toBe('code-should-change')
  })
})
