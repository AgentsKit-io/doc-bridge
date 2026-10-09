import { createHash } from 'node:crypto'
import { mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync, unlinkSync, linkSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createSymlink } from '@agentskit/cross-platform'
import { afterEach, expect, it } from 'vitest'
import { parse } from 'yaml'
import { DocBridgeConfigV1Schema } from '../src/config/schema.js'
import { discoverRepository } from '../src/discovery/repository.js'
import { exportVault } from '../src/vault/export.js'

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
