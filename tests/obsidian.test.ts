import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, relative } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { DocBridgeConfigV1Schema } from '../src/config/schema.js'
import { applyConfigDefaults } from '../src/config/defaults.js'
import * as obsidian from '../src/discovery/obsidian.js'
import { discoverRepository, discoverRepositoryWithRead } from '../src/discovery/repository.js'
import { createMarkdownPluginV2, createObsidianPluginV2 } from '../src/discovery/plugins/markdown.js'
import { createDiscoveryRegistryV2 } from '../src/plugins/contract.js'
import { contentRef } from '../src/storage/local.js'
import { safeWalkFiles } from '../src/safety/repository.js'
import type { RepositoryReadV1 } from '../src/storage/contract.js'
import { buildDocBridgeIndex } from '../src/index-builder/build-index.js'
import { searchIndex } from '../src/query/search.js'
import { projectRetrievalIndex } from '../src/retrieval/project.js'
import { contentHashForVersionedArtifact } from '../src/index-builder/content-hash.js'

const temporary: string[] = []
afterEach(() => { vi.restoreAllMocks(); for (const path of temporary.splice(0)) rmSync(path, { recursive: true, force: true }) })
const config = (plugin = 'obsidian') => applyConfigDefaults(DocBridgeConfigV1Schema.parse({ schemaVersion: 1, corpus: { agent: { root: 'for-agents' }, human: { plugin, options: { root: 'vault' } } } }))
const write = (root: string, path: string, text: string) => { mkdirSync(dirname(join(root, path)), { recursive: true }); writeFileSync(join(root, path), text) }
const fixture = () => {
  const root = mkdtempSync(join(tmpdir(), 'doc-bridge-vault-')); temporary.push(root)
  write(root, 'package.json', '{"name":"doc-bridge"}')
  write(root, 'vault/start.md', '# Start\n[[target]] [[target|Label]] [[target#Heading]] [[target#^block]] ![[target]] ![[image.png]] [[Nickname]] [[duplicate]] [[unknown]] [[outside]]\n#prose/nested `#code [[missing]]`\n```md\n#fenced [[missing]]\n```\n> [!NOTE]\n> #callout [[target]]\n')
  write(root, 'vault/target.md', '---\naliases: [Nickname, Searchable]\ntags: [frontmatter, nested/tag]\n---\n# Target\n## Heading\nBlock ^block\n')
  write(root, 'vault/a/duplicate.md', '# A\n')
  write(root, 'vault/b/duplicate.md', '# B\n')
  write(root, 'vault/secret-note.md', 'EXCLUDED_CONTENT_SENTINEL')
  write(root, 'vault/credential-notes/private.md', 'EXCLUDED_DIRECTORY_SENTINEL')
  write(root, 'docs/outside.md', '# Outside\n')
  return root
}
const reader = (root: string): RepositoryReadV1 => {
  const files = new Map(safeWalkFiles(root).files.map(path => [relative(root, path).split('\\').join('/'), readFileSync(path)]))
  return { version: 1, partition: { repositoryId: 'doc-bridge', revision: 'fixture' }, limits: createMarkdownPluginV2().manifest.resourceLimits,
    async list() { return { status: 'ok', value: { entries: [...files].map(([path, bytes]) => ({ path, kind: 'file', bytes: bytes.length, content: contentRef(bytes) })), complete: true, visibilityPolicyHash: '0'.repeat(64) } } },
    async read(request) { const bytes = files.get(request.path); return bytes ? { status: 'ok', value: { bytes, content: contentRef(bytes) } } : { status: 'missing', code: 'NOT_FOUND' } },
    async stat(request) { const bytes = files.get(request.path); return bytes ? { status: 'ok', value: { path: request.path, kind: 'file', bytes: bytes.length, content: contentRef(bytes) } } : { status: 'missing', code: 'NOT_FOUND' } },
  }
}

describe('opt-in vault Markdown', () => {
  it('resolves document references without guessing, keeps fragments/assets and indexes aliases/tags', () => {
    const root = fixture(), snapshot = discoverRepository({ root, config: config() })
    const relations = snapshot.relations.filter(edge => edge.from === 'document:vault/start.md' && edge.kind === 'links-to')
    expect(relations.map(edge => edge.to)).toEqual(['document:vault/target.md'])
    expect(relations[0]?.metadata?.references).toEqual(expect.arrayContaining([
      expect.objectContaining({ target: 'target', embed: true }), expect.objectContaining({ fragment: 'Heading' }), expect.objectContaining({ fragment: '^block' }), expect.objectContaining({ alias: 'Label' }),
    ]))
    const start = snapshot.entities.find(entity => entity.path === 'vault/start.md')!
    expect(start.metadata?.tags).toEqual(['callout', 'prose/nested'])
    expect(start.metadata?.assetEmbeds).toEqual([expect.objectContaining({ target: 'image.png', embed: true })])
    expect(snapshot.coverage.filter(note => note.scope.startsWith('obsidian:vault/start')).map(note => note.reason)).toEqual([
      'AMBIGUOUS_WIKILINK: duplicate; no relation emitted.', 'UNRESOLVED_WIKILINK: unknown; no relation emitted.', 'UNRESOLVED_WIKILINK: outside; no relation emitted.',
    ])
    expect(snapshot.coverage).toContainEqual(expect.objectContaining({ reason: 'EXCLUDED_VAULT_FILE: vault/secret-note.md; contents were not read.' }))
    expect(JSON.stringify(snapshot)).not.toContain('EXCLUDED_CONTENT_SENTINEL')
    expect(JSON.stringify(snapshot)).not.toContain('EXCLUDED_DIRECTORY_SENTINEL')
    expect(snapshot.coverage).toContainEqual(expect.objectContaining({ reason: 'EXCLUDED_VAULT_DIRECTORY: vault/credential-notes/; contained note names were not enumerated.' }))
    const index = buildDocBridgeIndex({ root, config: config(), write: false }).index
    const target = index.projection?.entries.find(entry => entry.path === 'vault/target.md')
    expect(target?.aliases).toEqual(expect.arrayContaining(['Nickname', 'Searchable']))
    expect(target?.tags).toEqual(expect.arrayContaining(['frontmatter', 'nested/tag']))
    expect(searchIndex(index, 'Searchable', 5)[0]?.path).toBe('vault/target.md')
  })

  it('uses exact paths before basenames before aliases and treats alias collisions as ambiguous', () => {
    const corpus = config().corpus.human as { plugin: 'obsidian'; options: { root: string } }
    const documents = [
      obsidian.parseObsidianDocument('vault/start.md', '[[target]] [[folder/target]] [[SameAlias]] [[../escape]]'),
      obsidian.parseObsidianDocument('vault/target.md', '---\naliases: SameAlias\n---\n'),
      obsidian.parseObsidianDocument('vault/folder/target.md', '---\naliases: [SameAlias, target]\n---\n'),
    ]
    const result = obsidian.analyzeObsidianDocuments(documents, corpus)
    expect(result.relations.map(edge => edge.to)).toEqual(['document:vault/target.md', 'document:vault/folder/target.md'])
    expect(result.notes.map(note => note.reason)).toEqual(['AMBIGUOUS_WIKILINK: SameAlias; no relation emitted.', 'UNRESOLVED_WIKILINK: ../escape; no relation emitted.'])
    expect(obsidian.parseObsidianDocument('vault/a.md', '---\naliases: Single\ntags: frontmatter\n---\n').aliases).toEqual(['Single'])
    expect(obsidian.obsidianCorpusPath('vault/folder/note.md', { plugin: 'obsidian', options: { root: 'vault\\folder' } })).toBe('note.md')
  })

  it('resolves unique basenames and explicit relative paths within corpus include/exclude boundaries', () => {
    const root = fixture()
    write(root, 'vault/folder/start.md', '[[Unique]] [[./Unique]] [[../target]] [[ExcludedAlias]] ![[design.v1]]')
    write(root, 'vault/folder/Unique.md', '# Unique\n')
    write(root, 'vault/folder/design.v1.md', '# Design\n')
    write(root, 'vault/ignored/note.md', '---\naliases: ExcludedAlias\n---\n')
    const selected = config()
    selected.corpus.human = { plugin: 'obsidian', options: { root: 'vault', include: ['**/*.md'], exclude: ['ignored/**'] } }
    const snapshot = discoverRepository({ root, config: selected })
    expect(snapshot.relations.filter(edge => edge.from === 'document:vault/folder/start.md').map(edge => edge.to).sort()).toEqual(['document:vault/folder/Unique.md', 'document:vault/folder/design.v1.md', 'document:vault/target.md'])
    expect(snapshot.coverage).toContainEqual(expect.objectContaining({ reason: 'UNRESOLVED_WIKILINK: ExcludedAlias; no relation emitted.' }))
  })

  it('does not interpret vault syntax for ordinary Markdown corpora', () => {
    const snapshot = discoverRepository({ root: fixture(), config: config('plain-markdown') })
    expect(snapshot.analyzerVersions.obsidian).toBeUndefined()
    expect(snapshot.entities.find(entity => entity.path === 'vault/target.md')?.aliases).toBeUndefined()
    expect(snapshot.relations.filter(edge => edge.from === 'document:vault/start.md' && edge.kind === 'links-to')).toEqual([])
    expect(snapshot.coverage.some(entry => entry.analyzer === 'obsidian')).toBe(false)
  })

  it('reports a bounded exclusion inventory as truncated instead of claiming full coverage', () => {
    const root = fixture()
    for (let i = 0; i < 33; i++) write(root, `vault/secret-${i}.md`, 'EXCLUDED_CONTENT_SENTINEL')
    const snapshot = discoverRepository({ root, config: config() })
    expect(snapshot.coverage).toContainEqual(expect.objectContaining({ reason: expect.stringContaining('EXCLUDED_VAULT_INVENTORY_TRUNCATED'), status: 'partial' }))
    expect(JSON.stringify(snapshot)).not.toContain('EXCLUDED_CONTENT_SENTINEL')
  })

  it('invalidates cached vault resolution when target aliases change', () => {
    const root = fixture(), first = discoverRepository({ root, config: config() })
    write(root, 'vault/target.md', '# Target\n')
    const warm = discoverRepository({ root, config: config(), previous: first })
    const cold = discoverRepository({ root, config: config() })
    expect(warm.entities).toEqual(cold.entities)
    expect(warm.relations).toEqual(cold.relations)
    expect(warm.coverage).toContainEqual(expect.objectContaining({ reason: 'UNRESOLVED_WIKILINK: Nickname; no relation emitted.' }))
  })

  it('runs the configured document stage through the strict v2 registry and bounded reader', async () => {
    const root = fixture()
    write(root, 'vault/target.md', '\ufeff---\r\naliases: Nickname\r\n---\r\n# Target\r\n')
    const read = reader(root), plugin = createObsidianPluginV2()
    const registry = createDiscoveryRegistryV2()
    registry.register(plugin)
    const output = await registry.discover('obsidian', { read, signal: new AbortController().signal, configuration: config(), resolution: { entities: [], relations: [] } })
    expect(output.entities.find(entity => entity.path === 'vault/target.md')?.aliases).toContain('Nickname')
    expect(output.relations.some(edge => edge.kind === 'links-to' && edge.to === 'document:vault/target.md')).toBe(true)
    expect(output.coverage).toContainEqual(expect.objectContaining({ reason: expect.stringContaining('EXCLUDED_VAULT_INVENTORY_UNAVAILABLE') }))
    expect(output.diagnostics).toContainEqual(expect.objectContaining({ code: 'AMBIGUOUS_WIKILINK', status: 'unresolved' }))
    const local = discoverRepository({ root, config: config() })
    const projectedSnapshot = { ...local, entities: local.entities.map(entity => output.entities.find(document => document.id === entity.id) ?? entity) }
    projectedSnapshot.contentHash = contentHashForVersionedArtifact(projectedSnapshot)
    const projection = projectRetrievalIndex({ snapshot: projectedSnapshot, config: config(), readDocument: path => readFileSync(join(root, path), 'utf8') })
    expect(projection.entries.find(entry => entry.path === 'vault/target.md')?.fields.body).toContain('Target')
    const snapshot = (await discoverRepositoryWithRead(read, { root, config: config(), plugins: [{ manifest: { ...createMarkdownPluginV2().manifest, id: 'fixture', capabilities: ['symbols'] }, async discover() { return { entities: [], relations: [], facts: [], packages: [], diagnostics: [], coverage: [] } } }] })).snapshot
    expect(snapshot.entities.find(entity => entity.path === 'vault/target.md')?.aliases).toContain('Nickname')
    expect(snapshot.analyzerVersions.obsidian).toBe(plugin.manifest.version)
  })

  it('leaves a representative snapshot and index byte-identical when the plugin is absent', () => {
    // CI's Build deterministic repository index step indexes the whole repository twice and compares bytes with cmp.
    const root = fixture()
    write(root, 'vault/links.md', '# Links\n[Target](target.md) [External](https://example.org)\n')
    const repositoryConfig = config('plain-markdown')
    expect(obsidian.obsidianCorpora(repositoryConfig)).toEqual([])
    const originalSnapshot = JSON.stringify(discoverRepository({ root, config: repositoryConfig }))
    const originalIndex = buildDocBridgeIndex({ root, config: repositoryConfig, write: false }).index
    const parser = vi.spyOn(obsidian, 'parseObsidianDocument').mockImplementation(() => { throw new Error('OPT_IN_REQUIRED') })
    const snapshot = discoverRepository({ root, config: repositoryConfig })
    const index = buildDocBridgeIndex({ root, config: repositoryConfig, write: false }).index
    expect(JSON.stringify(snapshot)).toBe(originalSnapshot)
    expect(JSON.stringify({ ...index, generatedAt: '' })).toBe(JSON.stringify({ ...originalIndex, generatedAt: '' }))
    expect(parser).not.toHaveBeenCalled()
  })
})
