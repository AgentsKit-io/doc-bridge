import { createHash } from 'node:crypto'
import { mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync, unlinkSync, linkSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createSymlink } from '@agentskit/cross-platform'
import { afterEach, expect, it } from 'vitest'
import { parse } from 'yaml'
import { DocBridgeConfigV1Schema } from '../src/config/schema.js'
import { discoverRepository } from '../src/discovery/repository.js'
import { exportVault, renderVault } from '../src/vault/export.js'

const roots: string[] = []
afterEach(() => { for (const root of roots) rmSync(root, { recursive: true, force: true }); roots.length = 0 })
const fixture = () => {
  const root = mkdtempSync(join(tmpdir(), 'vault-export-')); roots.push(root)
  mkdirSync(join(root, 'docs', 'notes'), { recursive: true })
  writeFileSync(join(root, '.gitignore'), '.doc-bridge/\n')
  mkdirSync(join(root, 'src/core'), { recursive: true })
  writeFileSync(join(root, 'src/core/a.ts'), "import './b.js'\nexport const a = 1\n")
  writeFileSync(join(root, 'src/core/b.ts'), "import './c.js'\nexport const b = 2\n")
  writeFileSync(join(root, 'src/core/c.ts'), "import './a.js'\nexport const c = 3\n")
  writeFileSync(join(root, 'package.json'), JSON.stringify({ name: 'example', version: '1.0.0' }))
  writeFileSync(join(root, 'docs', 'notes', 'human.md'), '---\naliases: [Guide]\ntags: [team]\n---\n# Human knowledge\n\nText that must never be copied.\n\n[[other]]\n')
  writeFileSync(join(root, 'docs', 'notes', 'other.md'), '# Other\n')
  const config = DocBridgeConfigV1Schema.parse({ schemaVersion: 1, corpus: { agent: { root: 'docs/agent' }, human: { plugin: 'obsidian', options: { root: 'docs/notes' } } } })
  return { root, config, output: join(root, '.doc-bridge', 'vault') }
}
const bytes = (output: string) => Object.fromEntries(readdirSync(output).sort().map(name => [name, readFileSync(join(output, name), 'utf8')]))
const note = (output: string, id: string) => join(output, `${createHash('sha256').update(id).digest('hex')}.md`)
it('exports real discovery, source bindings, resolved links and byte-identical output without touching human knowledge', async () => {
  const { root, config, output } = fixture()
  const human = readFileSync(join(root, 'docs/notes/human.md'), 'utf8')
  const snapshot = discoverRepository({ root, config })
  const document = snapshot.entities.find(entity => entity.kind === 'document' && entity.path === 'docs/notes/human.md')!
  const result = await exportVault(root, config)
  expect(result.notes).toBeGreaterThan(3)
  expect(snapshot.entities.some(entity => entity.kind === 'area')).toBe(true)
  for (const entity of snapshot.entities.filter(entity => ['area', 'package'].includes(entity.kind))) expect(readFileSync(note(output, entity.id), 'utf8')).toContain(`type: ${entity.kind}`)
  expect(readFileSync(join(output, 'graph-signals.md'), 'utf8')).toContain('module:src/core/a.ts')
  const content = readFileSync(note(output, document.id), 'utf8')
  const metadata = parse(content.split('---\n')[1]!)
  expect(metadata.id).toBe(document.id)
  expect(metadata.aliases).toContain('Guide')
  expect(metadata.tags).toContain('team')
  expect(metadata.sources[0].fileHash).toBe(createHash('sha256').update(human).digest('hex'))
  expect(metadata.sources[0].regions.length).toBeGreaterThan(0)
  expect(content).toContain('[Source](../../docs/notes/human.md)')
  expect(content).toContain('links-to:')
  expect(content).not.toContain('Text that must never be copied')
  const first = bytes(output)
  await exportVault(root, config)
  expect(bytes(output)).toEqual(first)
  expect(readFileSync(join(root, 'docs/notes/human.md'), 'utf8')).toBe(human)
  const names = new Set(readdirSync(output).map(name => name.replace(/\.md$/, '')))
  for (const content of Object.values(first)) for (const match of content.matchAll(/\[\[([^\]]+)\]\]/g)) expect(names.has(match[1]!)).toBe(true)
})
it('removes only unchanged manifest-owned stale notes and preserves unowned files', async () => {
  const { root, config, output } = fixture()
  await exportVault(root, config)
  writeFileSync(join(output, 'personal.md'), 'Keep me')
  unlinkSync(join(root, 'docs/notes/other.md'))
  expect((await exportVault(root, config)).removed).toBe(1)
  expect(readFileSync(join(output, 'personal.md'), 'utf8')).toBe('Keep me')
})
it('preserves edited notes and refuses malformed or escaping ownership manifests before writes', async () => {
  const { root, config, output } = fixture()
  await exportVault(root, config)
  writeFileSync(join(output, 'index.md'), 'Edited')
  await expect(exportVault(root, config)).rejects.toThrow('edited')
  expect(readFileSync(join(output, 'index.md'), 'utf8')).toBe('Edited')
  writeFileSync(join(output, '.doc-bridge-vault.json'), JSON.stringify({ schemaVersion: 1, files: { '../victim.md': 'a'.repeat(64) } }))
  await expect(exportVault(root, config)).rejects.toThrow()
})
it('denies output traversal, symlink ancestors, overlap, and nonignored output', async () => {
  const { root, config } = fixture()
  await expect(exportVault(root, { ...config, vault: { output: '../escape' } })).rejects.toThrow('escapes')
  await expect(exportVault(root, { ...config, vault: { output: 'docs/notes/generated' } })).rejects.toThrow('disjoint')
  await expect(exportVault(root, { ...config, vault: { output: 'generated' } })).rejects.toThrow('git-ignored')
  await createSymlink(join(root, 'docs'), join(root, '.doc-bridge'), 'dir')
  await expect(exportVault(root, config)).rejects.toThrow('symlink')
})
it('renders config overrides through knap while retaining required frontmatter', async () => {
  const { root, config, output } = fixture()
  writeFileSync(join(root, 'template.md'), '# Custom {{ note.id | upper }}\n')
  await exportVault(root, { ...config, vault: { templates: { index: 'template.md' } } })
  expect(readFileSync(join(output, 'index.md'), 'utf8')).toContain('# Custom VAULT:INDEX')
  expect(readFileSync(join(output, 'index.md'), 'utf8')).toContain('id: vault:index')
})

it('exports readable, safe names, optional backlinks, tags and an owned Obsidian preset', async () => {
  const { root, config, output } = fixture()
  const snapshot = discoverRepository({ root, config })
  const readable = { ...config, vault: { fileNames: 'readable' as const, indexBacklinks: false, obsidian: true } }
  await exportVault(root, readable)
  const first = readdirSync(join(output, 'docs')).sort()
  await exportVault(root, readable)
  expect(readdirSync(join(output, 'docs')).sort()).toEqual(first)
  const doc = snapshot.entities.find(entity => entity.kind === 'document' && entity.path === 'docs/notes/human.md')!
  const expectedName = doc.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
  const notePath = join(output, 'docs', `${expectedName}.md`)
  const content = readFileSync(notePath, 'utf8')
  expect(content).toContain('doc-bridge/document')
  expect(content).not.toContain('[[index]]')
  expect(content).toContain('[[docs/other-md|other.md]]')
  expect(readFileSync(join(output, 'graph-signals.md'), 'utf8')).not.toContain('[[')
  expect(doc.id).toBeTruthy()
  const graph = join(output, '.obsidian/graph.json')
  const graphBytes = readFileSync(graph, 'utf8')
  expect(JSON.parse(graphBytes).colorGroups[0].query).toBe('tag:#drift')
  writeFileSync(graph, '{}')
  expect((await exportVault(root, readable)).warnings?.join(' ')).toContain('user edit')
  expect(readFileSync(graph, 'utf8')).toBe('{}')
})

it('honors a custom ignored output and denies symlink notes and template paths', async () => {
  const { root, config } = fixture()
  writeFileSync(join(root, '.gitignore'), 'generated/\n')
  const custom = { ...config, vault: { output: 'generated', humanNotes: 'docs/notes' } }
  expect((await exportVault(root, custom)).output).toBe('generated')
  const output = join(root, 'generated')
  unlinkSync(join(output, 'index.md'))
  await createSymlink(join(root, 'docs/notes/human.md'), join(output, 'index.md'), 'file')
  await expect(exportVault(root, custom)).rejects.toThrow('symlink')
  expect(readFileSync(join(root, 'docs/notes/human.md'), 'utf8')).toContain('Human knowledge')
  await expect(exportVault(root, { ...custom, vault: { ...custom.vault, templates: { index: '../template.md' } } })).rejects.toThrow('escapes')
})

it('escapes source filenames and rejects hard-linked generated files', async () => {
  const { root, config, output } = fixture()
  const path = 'docs/notes/a#b (draft).md'
  writeFileSync(join(root, path), '# Special name\n')
  const entity = discoverRepository({ root, config }).entities.find(entity => entity.path === path)!
  await exportVault(root, config)
  expect(readFileSync(note(output, entity.id), 'utf8')).toContain('[Source](../../docs/notes/a%23b%20%28draft%29.md)')
  linkSync(join(output, 'index.md'), join(root, 'linked.md'))
  await expect(exportVault(root, config)).rejects.toThrow('hard-linked')
  expect(readFileSync(join(root, 'linked.md'), 'utf8')).toContain('Knowledge map')
})

it('adds opt-in knowledge notes with region evidence and resolved wikilinks while disabled export stays identical', async () => {
  const { root, config, output } = fixture()
  mkdirSync(join(root, 'docs/adr'), { recursive: true })
  writeFileSync(join(root, 'docs/adr/0001-store.md'), '# Store decision\n\nUse `a`.\n')
  writeFileSync(join(root, 'docs/notes/glossary.md'), '# Glossary\n\n**a**: Entry point.\n')
  writeFileSync(join(root, 'CHANGELOG.md'), '# Changelog\n\n## 1.0.0\n\n- Added `a`.\n')
  await exportVault(root, config)
  const disabled = bytes(output)
  await exportVault(root, { ...config, index: { ...config.index, knowledgeEntities: { enabled: false } } })
  expect(bytes(output)).toEqual(disabled)
  await exportVault(root, { ...config, index: { ...config.index, knowledgeEntities: { enabled: true } } })
  const enabled = bytes(output)
  for (const kind of ['decision', 'concept', 'change']) expect(Object.values(enabled).some(content => content.includes(`type: ${kind}\n`))).toBe(true)
  expect(Object.values(enabled).some(content => content.includes('[Source region]'))).toBe(true)
  const names = new Set(Object.keys(enabled).map(name => name.replace(/\.md$/, '')))
  for (const content of Object.values(enabled)) for (const match of content.matchAll(/\[\[([^\]]+)\]\]/g)) expect(names.has(match[1]!)).toBe(true)
  await exportVault(root, { ...config, index: { ...config.index, knowledgeEntities: { enabled: true } } })
  expect(bytes(output)).toEqual(enabled)
})

it('keeps additive entity types and their templates inactive when entities are disabled', () => {
  const { root, config, output } = fixture()
  const snapshot = discoverRepository({ root, config })
  const baseline = renderVault(root, output, config, snapshot)
  const additive = { ...snapshot, entities: [...snapshot.entities, { id: 'knowledge-decision:custom', kind: 'decision', name: 'Custom decision', provenance: 'observed' as const, evidence: [] }] }
  expect(renderVault(root, output, { ...config, vault: { templates: { decision: 'missing-template.md' } } }, additive)).toEqual(baseline)
})

it('tags drifted documents, links the module that owns the changed symbol, and clears both once fixed', () => {
  const { root, config, output } = fixture()
  const readable = { ...config, index: { ...config.index, knowledgeEntities: { enabled: true } }, vault: { fileNames: 'readable' as const, indexBacklinks: false } } as typeof config
  const snapshot = discoverRepository({ root, config: readable })
  const doc = snapshot.entities.find(entity => entity.kind === 'document' && entity.path === 'docs/notes/human.md')!
  const module = snapshot.entities.find(entity => entity.id === 'module:src/core/a.ts')!
  expect(module).toBeTruthy()
  const finding = { code: 'CHANGED_REFERENCE', document: 'docs/notes/human.md', line: 5, target: 'signature:module:src/core/a.ts:a' }
  const drifted = renderVault(root, output, readable, snapshot, [finding as never])
  const [name, page] = Object.entries(drifted).find(([, content]) => content.includes(`id: ${doc.id}`))!
  expect(name.startsWith('docs/')).toBe(true)
  expect(page).toContain('drift/changed-reference')
  expect(page).toContain('## Findings')
  expect(page).toContain('- 5 → signature:module:src/core/a.ts:a (CHANGED_REFERENCE) — [[modules/a-ts|')
  const fixed = renderVault(root, output, readable, snapshot, [])[name]!
  expect(fixed).not.toContain('drift/')
  expect(fixed).not.toContain('## Findings')
})

it('writes summaries and readable relation sections, and leaves excluded files out of the vault', () => {
  const { root, config, output } = fixture()
  writeFileSync(join(root, 'src/core/a.ts'), "/** Entry point that wires the core modules. */\nimport './b.js'\nexport const a = 1\n")
  writeFileSync(join(root, 'docs/notes/other.md'), '---\ndescription: The other guide, used to test summaries.\n---\n# Other\n\nIgnored body.\n')
  const summary = { ...config, vault: { fileNames: 'readable' as const, indexBacklinks: false, content: 'summary' as const, exclude: ['src/core/c.ts'] } } as typeof config
  const snapshot = discoverRepository({ root, config: summary })
  const pages = renderVault(root, output, summary, snapshot)
  const page = (id: string) => Object.values(pages).find(content => content.includes(`id: ${id}\n`))
  const other = page('document:docs/notes/other.md')!
  expect(other).toContain('The other guide, used to test summaries.')
  expect(other).toContain('Documentation: `docs/notes/other.md`')
  expect(other).toContain('## Linked from')
  expect(other).not.toContain('observed links-to:')
  const human = page('document:docs/notes/human.md')!
  expect(human).toContain('Text that must never be copied')
  expect(page('module:src/core/c.ts')).toBeUndefined()
  expect(Object.values(pages).some(content => content.includes('c.ts'))).toBe(false)
  const defaults = renderVault(root, output, config, discoverRepository({ root, config }))
  expect(Object.values(defaults).some(content => content.includes('## Linked from'))).toBe(false)
})

it('summarises documents from their description or first paragraph and modules from their leading comment', async () => {
  const { documentSummary, moduleSummary } = await import('../src/vault/content.js')
  expect(documentSummary('---\ndescription: "Short."\n---\n# T\n\nBody.')).toBe('Short.')
  expect(documentSummary('# T\n\n```ts\ncode\n```\n\nFirst [link](x) and [[wiki|label]].\nSecond line.\n\nNext.')).toBe('First link and label. Second line.')
  expect(documentSummary('# Only a title\n')).toBeUndefined()
  expect(moduleSummary('#!/usr/bin/env node\n/**\n * Sends things.\n * @param x\n */\nexport const a = 1')).toBe('Sends things.')
  expect(moduleSummary('// One line\n// two\nexport {}')).toBe('One line two')
  expect(moduleSummary('export const a = 1')).toBeUndefined()
})
