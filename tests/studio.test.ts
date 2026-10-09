import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, join } from 'node:path'
import { afterEach, expect, it, vi } from 'vitest'
import { applyConfigDefaults } from '../src/config/defaults.js'
import { buildDocBridgeIndex } from '../src/index-builder/build-index.js'
import { DocBridgeConfigV1Schema } from '../src/config/schema.js'
import { EnrichmentOverlayV1Schema } from '../src/schemas/enrichment.js'
import { createFinding } from '../src/findings/contracts.js'
import { entityId } from '../src/discovery/identity.js'
import { exportStudioGraph, searchStudioGraph, whyStudioNode } from '../src/studio/export.js'
import { STUDIO_LIMITS, StudioGraphV1Schema, StudioGraphV1JsonSchema } from '../src/schemas/studio-graph.js'
import { runCli } from '../src/cli/program.js'
import { discoverRepository } from '../src/discovery/repository.js'
import { renderVault } from '../src/vault/export.js'

const roots: string[] = []
afterEach(() => { vi.restoreAllMocks(); for (const root of roots) rmSync(root, { recursive: true, force: true }); roots.length = 0 })
const fixture = () => {
  const root = mkdtempSync(join(tmpdir(), 'studio-contract-')); roots.push(root)
  mkdirSync(join(root, 'src'), { recursive: true }); mkdirSync(join(root, 'docs'), { recursive: true })
  writeFileSync(join(root, '.gitignore'), '.doc-bridge/\n')
  writeFileSync(join(root, 'package.json'), JSON.stringify({ name: '@agentskit/example', version: '1.0.0' }))
  writeFileSync(join(root, 'src/a.ts'), "import { beta } from './b.js'\nexport const alpha = beta\n")
  writeFileSync(join(root, 'src/b.ts'), "import { gamma } from './c.js'\nexport const beta = gamma\n")
  writeFileSync(join(root, 'src/c.ts'), 'export const gamma = 1\n')
  writeFileSync(join(root, 'docs/guide.md'), '# Guide\n\nSee [notes](notes.md).\n\n`alpha`\n')
  writeFileSync(join(root, 'docs/notes.md'), '# Notes\n\nHuman-authored context.\n')
  writeFileSync(join(root, 'docs/decision.md'), '---\ntype: decision\ndate: 2026-10-08\n---\n# Retain local evidence\n')
  const config = applyConfigDefaults(DocBridgeConfigV1Schema.parse({ schemaVersion: 1, project: { name: 'studio-fixture' }, corpus: { agent: { root: 'docs/agent' }, human: { plugin: 'plain-markdown', options: { root: 'docs' } } }, index: { knowledgeEntities: { enabled: true } } }))
  const configPath = join(root, 'doc-bridge.config.json'); writeFileSync(configPath, JSON.stringify(config))
  return { root, config, configPath }
}
it.each(['@agentskit/sandbox', undefined, ''])('keeps package labels separate from documentation with manifest name %s', (name) => {
  const { root, config } = fixture()
  mkdirSync(join(root, 'packages/sandbox'), { recursive: true })
  mkdirSync(join(root, 'docs/agent/packages'), { recursive: true })
  writeFileSync(join(root, 'package.json'), JSON.stringify({ name: '@agentskit/example', workspaces: ['packages/*'] }))
  writeFileSync(join(root, 'packages/sandbox/package.json'), JSON.stringify({ name }))
  const prose = 'optional peer for the default backend:'
  writeFileSync(join(root, 'packages/sandbox/README.md'), `# ${prose}\n`)
  writeFileSync(join(root, 'docs/agent/packages/sandbox.md'), `---\npackage: sandbox\neditRoot: packages/sandbox\npurpose: Documentation purpose\n---\n# ${prose}\n`)
  const snapshot = discoverRepository({ root, config })
  const pkg = snapshot.entities.find(entity => entity.kind === 'package' && entity.path === 'packages/sandbox')!
  const expected = name || 'sandbox'
  expect(pkg.name).toBe(expected)
  const index = buildDocBridgeIndex({ root, config, write: false }).index
  const entry = index.projection!.entries.find(entry => entry.id === pkg.id)!
  expect(entry.title).toBe(expected)
  expect(entry.summary).toBe('Documentation purpose')
  expect(exportStudioGraph(index).nodes.find(node => node.id === pkg.id)?.label).toBe(expected)
  const pages = renderVault(root, join(root, '.doc-bridge/vault'), config, snapshot)
  expect(Object.values(pages).some(page => page.includes(`id: ${pkg.id}\n`) && page.includes(`# ${expected}\n`))).toBe(true)
  expect(index.knowledge.find(doc => doc.path === 'docs/agent/packages/sandbox.md')?.title).toBe(prose)
})
it('uses the root directory name for an unnamed root package without changing its ID', () => {
  const { root, config } = fixture()
  writeFileSync(join(root, 'package.json'), '{}')
  const pkg = discoverRepository({ root, config }).entities.find(entity => entity.kind === 'package' && entity.path === '.')!
  expect(pkg.id).toBe('package:root')
  expect(pkg.name).toBe(basename(root))
  const index = buildDocBridgeIndex({ root, config, write: false }).index
  expect(index.projection!.entries.find(entry => entry.id === pkg.id)?.title).toBe(basename(root))
})
it('projects a real index with stable symbols, ownership, metrics, knowledge entities and exact human notes', () => {
  const { root, config } = fixture()
  const index = buildDocBridgeIndex({ root, config, write: false }).index
  const graph = exportStudioGraph(index, { humanNotes: ['docs/notes.md'] })
  expect(StudioGraphV1Schema.parse(graph)).toEqual(graph)
  expect(StudioGraphV1JsonSchema).toHaveProperty('properties.nodes')
  expect(graph.nodes.find(node => node.path === 'docs/notes.md')?.kind).toBe('human-note')
  expect(graph.nodes.some(node => node.kind === 'decision')).toBe(true)
  expect(graph.nodes.find(node => node.kind === 'decision')?.timestamps?.authored).toBe('2026-10-08')
  expect(graph.nodes.find(node => node.id === entityId('symbol', 'module:src/a.ts:alpha'))?.kind).toBe('symbol')
  expect(graph.edges.some(edge => edge.kind === 'owns')).toBe(true)
  expect(graph.nodes.find(node => node.id === 'module:src/b.ts')?.metrics.centrality).toBeGreaterThan(0)
  expect(graph.nodes.some(node => node.metrics.canonicality !== undefined)).toBe(true)
  expect(graph.coverage.findings).toBe('not-analyzed')
  expect(JSON.stringify(graph)).not.toContain(root)
  const samePathEntities = structuredClone(index)
  const decision = samePathEntities.knowledgeEntities!.entities.find(entity => entity.kind === 'decision')!
  samePathEntities.knowledgeEntities!.entities.push({ ...decision, id: 'knowledge-change:example', kind: 'change', links: [{ kind: 'affected-path', target: 'docs/decision.md' }] })
  const reversedEntities = structuredClone(samePathEntities); reversedEntities.knowledgeEntities!.entities.reverse()
  expect(exportStudioGraph(reversedEntities)).toEqual(exportStudioGraph(samePathEntities))
  const reordered = structuredClone(index); reordered.projection!.entries.reverse(); reordered.knowledgeEntities!.entities.reverse()
  expect(exportStudioGraph(reordered, { humanNotes: ['docs/notes.md'] })).toEqual(graph)
  const search = searchStudioGraph(index, graph, 'alpha')
  expect(search.results.length).toBeGreaterThan(0); expect(search.results[0]?.why?.components).toBeDefined()
  expect(whyStudioNode(graph, 'module:src/a.ts').edges.length).toBeGreaterThan(0)
  expect(() => whyStudioNode(graph, 'absent')).toThrow('unavailable')
  expect(() => searchStudioGraph({ ...index, contentHash: '0'.repeat(64) }, graph, 'alpha')).toThrow('differ')
  expect(() => searchStudioGraph(index, { ...graph, source: { ...graph.source, indexHashAlgo: 'sha256-normalized-v1' } }, 'alpha')).toThrow('differ')
  expect(() => StudioGraphV1Schema.parse({ ...graph, source: { ...graph.source, indexHashAlgo: 'unsupported' } })).toThrow()
})
it('preserves changed-doc residual findings and all reference categories without asserting approval', () => {
  const { root, config } = fixture(); const index = buildDocBridgeIndex({ root, config, write: false }).index
  const findings = ['broken-reference', 'ambiguous-reference', 'changed-reference'].map(category => createFinding({ category, assertion: { document: 'docs/guide.md', key: 'alpha' }, status: 'unresolved', layer: 'L0', confidence: 1, severity: 'warn', entities: ['module:src/a.ts'], evidence: [{ source: 'documentation', path: 'docs/guide.md' }], routing: 'proposed', coverage: [], provenance: { repository: 'example', revision: 'a'.repeat(40), configurationHash: 'b'.repeat(64) }, documentationUpdate: 'updated-in-this-change' }, { category }))
  const graph = exportStudioGraph(index, { findings, vaultDiff: [{ id: 'proposal:note', kind: 'vault-diff', targetIds: ['module:src/a.ts'], status: 'in-review', label: 'Review note', evidenceHash: 'c'.repeat(64) }] })
  expect(graph.findings.map(item => item.code).sort()).toEqual(['AMBIGUOUS_REFERENCE', 'BROKEN_REFERENCE', 'CHANGED_REFERENCE'])
  expect(graph.findings.every(item => item.finding.documentationUpdate === 'updated-in-this-change' && item.finding.status === 'unresolved')).toBe(true)
  expect(whyStudioNode(graph, 'module:src/a.ts').proposalIds).toEqual(['proposal:note'])
  expect(() => exportStudioGraph(index, { findings: [{}] as never })).toThrow()
  expect(() => exportStudioGraph(index, { revision: 'invalid' })).toThrow()
  expect(() => StudioGraphV1Schema.parse({ ...graph, edges: [{ id: 'e', from: 'missing', to: 'missing', kind: 'owns', weight: 1 }] })).toThrow('Dangling')
})
it('bounds huge legacy documents, long text and marks omissions deterministically', () => {
  const index = { schemaVersion: 1 as const, contentHash: 'a'.repeat(64), contentHashAlgo: 'sha256-normalized-v1' as const,
    knowledge: Array.from({ length: 1_000 }, (_, i) => ({ id: `document:${String(i).padStart(4, '0')}`, title: 'x'.repeat(256), path: `docs/${i}.md`, type: 'guide' })) }
  const graph = exportStudioGraph(index)
  expect(graph.nodes).toHaveLength(STUDIO_LIMITS.documents)
  expect(graph.truncation.documents).toEqual({ total: 1_000, emitted: 300, omitted: 700 })
  expect(Buffer.byteLength(JSON.stringify(graph, null, 2) + '\n')).toBeLessThanOrEqual(STUDIO_LIMITS.bytes)
  expect(graph.nodes.every(node => node.metrics.canonicality === undefined && node.metrics.centrality === undefined)).toBe(true)
  expect(graph).toEqual(exportStudioGraph({ ...index, knowledge: [...index.knowledge].reverse() }))
})
it('runs real CLI export, refuses overwrite and invalid inputs, and rejects missing/stale indexes', async () => {
  const { root, config, configPath } = fixture()
  const stdout = vi.spyOn(process.stdout, 'write').mockImplementation(() => true)
  const stderr = vi.spyOn(process.stderr, 'write').mockImplementation(() => true)
  const output = join(root, '.doc-bridge/studio.json')
  expect(await runCli(['studio', 'export', '--config', configPath, '--output', output, '--json'])).toBe(1)
  expect(await runCli(['studio', 'export', '--config', configPath, '--findings'])).toBe(1)
  expect(await runCli(['studio', 'export', '--config', configPath, '--unknown'])).toBe(1)
  buildDocBridgeIndex({ root, config, write: true })
  expect(await runCli(['studio', 'export', '--config', configPath, '--output', output, '--json']), JSON.stringify(stderr.mock.calls)).toBe(0)
  const bytes = readFileSync(output, 'utf8'); expect(StudioGraphV1Schema.parse(JSON.parse(bytes)).nodes.length).toBeGreaterThan(0)
  expect(await runCli(['studio', 'export', '--config', configPath, '--output', output, '--json'])).toBe(1)
  expect(readFileSync(output, 'utf8')).toBe(bytes)
  expect(await runCli(['studio', 'export', '--config', configPath, '--json'])).toBe(0)
  expect(stdout.mock.calls.some(([value]) => value === bytes)).toBe(true)
  const invalid = join(root, '.doc-bridge/invalid.json'); writeFileSync(invalid, '[{}]')
  expect(await runCli(['studio', 'export', '--config', configPath, '--findings', invalid, '--output', join(root, '.doc-bridge/bad.json')])).toBe(1)
  writeFileSync(join(root, 'src/a.ts'), 'export const changed = 2\n')
  expect(await runCli(['studio', 'export', '--config', configPath, '--json'])).toBe(1)
})

it('projects supplied overlay states without applying proposals', () => {
  const { root, config } = fixture(); const index = buildDocBridgeIndex({ root, config, write: false }).index
  const hash = 'a'.repeat(64)
  const proposal = { type: 'enrichment-proposal', schemaVersion: 1, proposalId: hash, kind: 'summarize', entity: 'module:src/a.ts', targetContentHash: hash, confidence: 1, reason: 'Summarize evidence', evidence: [{ source: 'code', path: 'src/a.ts' }], origin: { agentId: 'curator', agentVersion: '1', promptVersion: '1' }, baseSnapshotHash: hash, payload: { summary: 'Local evidence', language: 'en' } }
  const overlay = EnrichmentOverlayV1Schema.parse({ type: 'enrichment-overlay', schemaVersion: 1, contentHash: hash, contentHashAlgo: 'sha256-normalized-v1', project: { name: 'example' }, sourceRevision: 'rev', sourceRevisionKind: 'content', configurationHash: hash, pipelineVersion: '1', analyzerVersions: {}, baseSnapshotHash: hash,
    accepted: [{ proposal, acceptedBy: 'policy', acceptedAt: '2026-10-08T00:00:00.000Z' }], pending: [{ proposal: { ...proposal, proposalId: 'b'.repeat(64) }, approvalId: hash }], rejected: [{ proposalId: 'c'.repeat(64), kind: 'summarize', entity: 'module:src/a.ts', reason: 'stale-target' }],
    stats: { byKind: {}, rejectionReasons: {}, inventedReferences: 0, agentRuns: 0, cacheHits: 0, cacheHitRate: 1, packs: 0, inputBytes: 0, outputBytes: 0, wallTimeMs: 0, expired: 0 } })
  expect(exportStudioGraph(index, { overlay }).proposals.map(proposal => proposal.status)).toEqual(['accepted', 'proposed', 'rejected'])
  expect(exportStudioGraph(index).proposals).toEqual([])
})
it('parses the tiny synthetic design fixture and all intended kinds/states', () => {
  const graph = StudioGraphV1Schema.parse(JSON.parse(readFileSync(new URL('../docs/design/studio-samples/synthetic.json', import.meta.url), 'utf8')))
  expect(new Set(graph.nodes.map(node => node.kind)).size).toBe(9)
  expect(new Set(graph.proposals.map(proposal => proposal.status)).size).toBe(7)
})
it('enforces byte truncation for large evidence and keeps bounded graph metrics', () => {
  const index = { schemaVersion: 1 as const, contentHash: 'a'.repeat(64), contentHashAlgo: 'sha256-normalized-v1' as const, knowledge: [{ id: 'document:guide', title: 'Guide', path: 'docs/guide.md', type: 'guide' }] }
  const findings = Array.from({ length: 35 }, (_, i) => createFinding({ category: 'changed-reference', assertion: { document: 'docs/guide.md', key: `key-${i}` }, status: 'unresolved', layer: 'L0', confidence: 1, severity: 'warn', entities: ['document:guide'], evidence: Array.from({ length: 64 }, (_, line) => ({ source: 'documentation' as const, path: 'docs/guide.md', lineStart: line + 1, context: 'x'.repeat(1_024) })), routing: 'routed-to-L2', coverage: [], provenance: { repository: 'example', revision: 'a'.repeat(40), configurationHash: 'b'.repeat(64) } }, { i }))
  const graph = exportStudioGraph(index, { findings })
  expect(graph.truncation.findings.omitted).toBeGreaterThan(0)
  expect(graph.truncation.findings.total).toBe(35)
  expect(Buffer.byteLength(JSON.stringify(graph, null, 2) + '\n')).toBeLessThanOrEqual(STUDIO_LIMITS.bytes)
})
it('rejects unsafe PR links and absolute note paths', () => {
  const index = { schemaVersion: 1 as const, contentHash: 'a'.repeat(64), contentHashAlgo: 'sha256-normalized-v1' as const, knowledge: [] }
  expect(() => exportStudioGraph(index, { humanNotes: ['/absolute/note.md'] })).toThrow('repository-relative')
  expect(() => exportStudioGraph(index, { vaultDiff: [{ id: 'proposal:unsafe', kind: 'vault-diff', targetIds: [], status: 'proposed', label: 'Unsafe URL', evidenceHash: 'b'.repeat(64), prUrl: 'javascript:alert(1)' }] })).toThrow('HTTP(S)')
})
it('caps symbol expansion while retaining exact omission counts and deterministic source ordering', () => {
  const { root, config } = fixture(); const index = buildDocBridgeIndex({ root, config, write: false }).index
  const module = index.projection!.entries.find(entry => entry.kind === 'module')!
  index.projection!.entries = [
    ...index.projection!.entries.filter(entry => entry.kind !== 'module'),
    ...Array.from({ length: 20 }, (_, i) => ({ ...module, id: `module:src/generated-${String(i).padStart(2, '0')}.ts`, path: `src/generated-${i}.ts`, symbols: Array.from({ length: 128 }, (_, j) => `symbol${String(j).padStart(3, '0')}`) })),
  ]
  const graph = exportStudioGraph(index)
  expect(graph.nodes.length).toBeLessThanOrEqual(STUDIO_LIMITS.nodes)
  expect(graph.truncation.nodes.total).toBe(index.projection!.entries.length + 2_560 + index.knowledgeEntities!.entities.length)
  expect(graph.truncation.nodes.omitted).toBeGreaterThan(1_760)
  const shuffled = structuredClone(index); shuffled.projection!.entries.reverse()
  for (const entry of shuffled.projection!.entries) entry.symbols?.reverse()
  expect(exportStudioGraph(shuffled)).toEqual(graph)
})
it('validates both pinned real design samples, provenance, caps and explicit missing inbox analysis', () => {
  for (const [name, revision] of [['doc-bridge', 'e1c49f1ab0c008fec6dd64b3aa33c41c69069fd6'], ['agentskit', 'cff4ba9b36a393d9d226bd2b6a64152120990a95']]) {
    const bytes = readFileSync(new URL(`../docs/design/studio-samples/${name}.json`, import.meta.url), 'utf8')
    const graph = StudioGraphV1Schema.parse(JSON.parse(bytes))
    expect(graph.source.revision).toBe(revision)
    expect(graph.nodes.length).toBeGreaterThan(100)
    expect(new Set(graph.nodes.map(node => node.kind)).size).toBe(8)
    expect(graph.coverage.entities).toBe('enabled')
    expect(graph.coverage.findings).toBe('not-analyzed')
    expect(graph.coverage.proposals).toBe('not-analyzed')
    expect(graph.truncation.nodes.omitted).toBeGreaterThan(0)
    expect(Buffer.byteLength(bytes)).toBeLessThanOrEqual(STUDIO_LIMITS.bytes)
  }
})
it('projects real native vault-edit proposals from the persisted overlay as vault-diff inbox items', async () => {
  const { root, config } = fixture()
  const { exportVault } = await import('../src/vault/export.js')
  const { diffVault } = await import('../src/vault/diff.js')
  const { readEnrichmentOverlay } = await import('../src/enrich/overlay.js')
  const { createHash } = await import('node:crypto')
  await exportVault(root, config)
  const note = join(root, '.doc-bridge/vault', `${createHash('sha256').update('document:docs/guide.md').digest('hex')}.md`)
  writeFileSync(note, readFileSync(note, 'utf8') + '\nHuman review suggestion.\n')
  const result = await diffVault(root, config)
  expect(result.proposals.length).toBeGreaterThan(0)
  const index = buildDocBridgeIndex({ root, config, write: false }).index
  const overlay = readEnrichmentOverlay(root)!
  const graph = exportStudioGraph(index, { overlay })
  expect(graph.proposals.every(proposal => proposal.kind === 'vault-diff' && proposal.status === 'proposed')).toBe(true)
  expect(graph.proposals.map(proposal => proposal.id).sort()).toEqual(result.proposals.map(proposal => proposal.proposalId).sort())
  expect(readFileSync(join(root, 'docs/guide.md'), 'utf8')).toBe('# Guide\n\nSee [notes](notes.md).\n\n`alpha`\n')
})
