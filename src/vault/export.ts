import { runCommand } from '@agentskit/cross-platform'
import { createHash } from 'node:crypto'
import { existsSync, lstatSync, mkdirSync, readFileSync, realpathSync, unlinkSync, writeFileSync } from 'node:fs'
import { dirname, isAbsolute, relative, resolve, sep } from 'node:path'
import { stringify } from 'yaml'
import { z } from 'zod'

import type { DocBridgeConfigV1 } from '../config/schema.js'
import { parseMarkdownDocument } from '../discovery/markdown.js'
import { discoverRepository } from '../discovery/repository.js'
import { denyServiceOperation } from '../execution/profile.js'
import { areaSuggestions, canonicality, centrality, importCycles } from '../graph/build.js'
import { createIgnoreFilter } from '../lib/ignore-filter.js'
import { toPosix } from '../lib/paths.js'
import { compileTemplate, renderCompiledTemplate } from '../render/engine.js'
import type { DiscoverySnapshotV1 } from '../schemas/knowledge.js'

const hash = (value: string | Buffer): string => createHash('sha256').update(value).digest('hex')
const MANIFEST = '.doc-bridge-vault.json'
const ownedName = /^(?:[a-f0-9]{64}|index|graph-signals)\.md$/
const ManifestSchema = z.object({
  schemaVersion: z.literal(1),
  files: z.record(z.string().regex(ownedName), z.string().regex(/^[a-f0-9]{64}$/)),
}).strict()

// Add an entity kind here to opt it into the same identity, links and ownership contract.
export const VAULT_NOTE_TYPES: Readonly<Record<string, string>> = {
  package: '{{ body }}',
  area: '{{ body }}',
  document: '{{ body }}',
  'graph-signals': '{{ body }}',
  index: '{{ body }}',
}

/** Reject symlinks in every component, including dangling links and not-yet-created children. */
const safePath = (root: string, candidate: string): string => {
  const target = resolve(root, candidate)
  const rel = relative(root, target)
  if (isAbsolute(rel) || rel === '..' || rel.startsWith(`..${sep}`)) throw new Error('Vault path escapes its allowed folder')
  let current = target
  while (current !== root) {
    try {
      const stats = lstatSync(current)
      if (stats.isSymbolicLink()) throw new Error('Vault symlink path denied')
      if (stats.isFile() && stats.nlink > 1) throw new Error('Vault hard-linked file denied')
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
    }
    current = dirname(current)
  }
  return target
}
const overlaps = (a: string, b: string): boolean => a === b || a.startsWith(`${b}${sep}`) || b.startsWith(`${a}${sep}`)

const requireIgnored = async (root: string, output: string): Promise<void> => {
  const probe = toPosix(relative(root, resolve(output, 'index.md')))
  const ignored = createIgnoreFilter(root)
  if (ignored.mode === 'gitignore') {
    if (ignored.isIgnored(resolve(root, probe), false)) return
  } else {
    try {
      const check = await runCommand('git', ['check-ignore', '--quiet', '--no-index', '--', probe], { cwd: root, timeoutMs: 10_000 })
      if (check.code !== 0) throw new Error('Output is not ignored')
      // Tracked output is visible even when an ignore pattern matches it.
      const tracked = await runCommand('git', ['ls-files', '-z', '--', toPosix(relative(root, output))], { cwd: root, timeoutMs: 10_000 })
      if (tracked.code === 0 && !tracked.stdout) return
    } catch { /* Missing ignore rule is an actionable error below. */ }
  }
  throw new Error('Vault output must be git-ignored and contain no tracked files; add its directory to .gitignore')
}

export const exportVault = async (rootPath: string, config: DocBridgeConfigV1): Promise<{ output: string; notes: number; removed: number }> => {
  denyServiceOperation('vault export', config)
  const root = realpathSync.native(rootPath)
  const output = safePath(root, config.vault?.output ?? '.doc-bridge/vault')
  const human = safePath(root, config.vault?.humanNotes ?? 'docs/notes')
  if (output === root || overlaps(output, human)) throw new Error('Vault output and human-notes folders must be disjoint')
  await requireIgnored(root, output)
  const snapshot = discoverRepository({ root, config })
  return writeVault(root, output, config, snapshot)
}

const writeVault = (root: string, output: string, config: DocBridgeConfigV1, snapshot: DiscoverySnapshotV1): { output: string; notes: number; removed: number } => {
  const entities = snapshot.entities.filter(entity => entity.kind !== 'index' && entity.kind !== 'graph-signals' && Object.hasOwn(VAULT_NOTE_TYPES, entity.kind)).sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0)
  const filenames = new Map(entities.map(entity => [entity.id, `${hash(entity.id)}.md`]))
  const link = (id: string): string => {
    const filename = filenames.get(id)
    // Labels are deliberately omitted: arbitrary source names cannot alter wikilink syntax.
    return filename ? `[[${filename.slice(0, -3)}]]` : `\`${id.replace(/`/g, '')}\``
  }
  const templates = new Map(Object.entries(VAULT_NOTE_TYPES).map(([kind, bundled]) => {
    const override = config.vault?.templates?.[kind]
    return [kind, compileTemplate(override ? readFileSync(safePath(root, override), 'utf8') : bundled, `vault ${kind}`)]
  }))
  const adjacency = new Map<string, DiscoverySnapshotV1['relations']>()
  for (const relation of snapshot.relations) for (const id of new Set([relation.from, relation.to])) {
    const relations = adjacency.get(id) ?? []
    relations.push(relation)
    adjacency.set(id, relations)
  }
  const pages: Record<string, string> = {}
  const render = (filename: string, kind: string, metadata: Record<string, unknown>, body: string): void => {
    const template = templates.get(kind)!
    // Required binding fields remain outside the overridable presentation template.
    pages[filename] = `---\n${stringify({ ...metadata, type: kind }, { sortMapEntries: true })}---\n\n${renderCompiledTemplate(template, { note: metadata, body }).trimEnd()}\n`
  }
  for (const entity of entities) {
    const sources = [...new Set([...(entity.path ? [entity.path] : []), ...entity.evidence.map(item => item.path)])].filter(path => existsSync(safePath(root, path)) && lstatSync(safePath(root, path)).isFile()).sort()
    const sourceBindings = sources.map(path => {
      const bytes = readFileSync(safePath(root, path))
      const regions = entity.kind === 'document' ? parseMarkdownDocument(path, bytes.toString('utf8')).citationRegions ?? [] : []
      return { path: toPosix(path), fileHash: hash(bytes), hashAlgorithm: 'sha256-exact-bytes-v1', regions, regionHashAlgorithm: 'sha256-normalized-v1' }
    })
    const tags = Array.isArray(entity.metadata?.tags) ? entity.metadata.tags.filter((tag): tag is string => typeof tag === 'string').sort() : []
    const relations = (adjacency.get(entity.id) ?? []).sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0)
    const sourceLinks = sources.map(path => `[Source](${toPosix(relative(output, safePath(root, path))).split('/').map(part => encodeURIComponent(part).replace(/[()]/g, character => character === '(' ? '%28' : '%29')).join('/')})`)
    const body = [`# ${entity.name.replace(/[\r\n]/g, ' ')}`, '', ...sourceLinks, '', '## Relations', '', ...relations.map(relation => `- ${relation.provenance} ${relation.kind}: ${link(relation.from)} → ${link(relation.to)}`), '', '[[index]]'].join('\n')
    render(filenames.get(entity.id)!, entity.kind, { id: entity.id, sourcePath: entity.path ?? null, sources: sourceBindings, aliases: [...new Set(entity.aliases ?? [])].sort(), tags }, body)
  }
  const scores = (signal: ReadonlyMap<string, number>): string[] => [...signal].map(([id, score]) => `- ${link(id)}: ${score}`)
  render('graph-signals.md', 'graph-signals', { id: 'vault:graph-signals', aliases: [], tags: [] }, [
    '# Graph signals', '', '## Canonicality', '', ...scores(canonicality(snapshot)), '', '## Centrality', '', ...scores(centrality(snapshot)), '',
    '## Import cycles', '', ...importCycles(snapshot).map(cycle => `- ${cycle.nodes.map(link).join(' → ')}`), '',
    '## Area suggestions', '', ...areaSuggestions(snapshot).map(area => `- ${area.label}: ${area.members.map(link).join(', ')}`), '', '[[index]]',
  ].join('\n'))
  render('index.md', 'index', { id: 'vault:index', aliases: [], tags: [] }, ['# Knowledge map', '', ...entities.map(entity => `- ${entity.kind}: ${link(entity.id)}`), '', '[[graph-signals]]', '', 'Generated navigation links to source documents; it does not copy their contents.', '', 'Coverage:', ...snapshot.coverage.map(item => `- ${item.analyzer}: ${item.scope} — ${item.status}${item.reason ? ` (${item.reason})` : ''}`)].join('\n'))

  const manifestPath = safePath(root, relative(root, resolve(output, MANIFEST)))
  const previous = existsSync(manifestPath) ? ManifestSchema.parse(JSON.parse(readFileSync(manifestPath, 'utf8'))).files : {}
  // Preflight the entire set before writes: edited notes remain available for round-trip review.
  for (const [filename, expected] of Object.entries(previous)) {
    const target = safePath(root, relative(root, resolve(output, filename)))
    if (existsSync(target) && hash(readFileSync(target)) !== expected) throw new Error(`Generated vault note was edited: ${filename}; preserve or review the edit before exporting`)
  }
  for (const filename of Object.keys(pages)) {
    const target = safePath(root, relative(root, resolve(output, filename)))
    if (existsSync(target) && !Object.hasOwn(previous, filename)) throw new Error(`Vault file is not owned by the manifest: ${filename}`)
  }
  mkdirSync(output, { recursive: true })
  for (const [filename, content] of Object.entries(pages)) writeFileSync(safePath(output, filename), content, 'utf8')
  const stale = Object.keys(previous).filter(filename => !Object.hasOwn(pages, filename))
  for (const filename of stale) { const target = safePath(output, filename); if (existsSync(target)) unlinkSync(target) }
  const files = Object.fromEntries(Object.entries(pages).sort(([a], [b]) => a < b ? -1 : 1).map(([filename, content]) => [filename, hash(content)]))
  writeFileSync(manifestPath, `${JSON.stringify({ schemaVersion: 1, files }, null, 2)}\n`, 'utf8')
  return { output: toPosix(relative(root, output)), notes: Object.keys(pages).length, removed: stale.length }
}
