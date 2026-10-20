import { runCommand } from '@agentskit/cross-platform'
import { createHash } from 'node:crypto'
import { closeSync, constants, existsSync, fstatSync, lstatSync, mkdirSync, openSync, readFileSync, realpathSync, unlinkSync, writeFileSync } from 'node:fs'
import { dirname, isAbsolute, relative, resolve, sep } from 'node:path'
import { stringify } from 'yaml'
import { z } from 'zod'

import type { DocBridgeConfigV1 } from '../config/schema.js'
import { extractKnowledgeEntities } from '../entities/extract.js'
import { parseMarkdownDocument } from '../discovery/markdown.js'
import { discoverRepository } from '../discovery/repository.js'
import { denyServiceOperation } from '../execution/profile.js'
import { areaSuggestions, canonicality, centrality, importCycles } from '../graph/build.js'
import { createIgnoreFilter } from '../lib/ignore-filter.js'
import { toPosix } from '../lib/paths.js'
import { compileTemplate, renderCompiledTemplate } from '../render/engine.js'
import type { DiscoverySnapshotV1 } from '../schemas/knowledge.js'
import type { PendingReferenceFinding } from '../gates/reference-findings.js'
import { entitySummary, excludedFromVault, relationSections } from './content.js'

export const hash = (value: string | Buffer): string => createHash('sha256').update(value).digest('hex')
export const MANIFEST = '.doc-bridge-vault.json'
const ownedName = /^(?:(?:[a-f0-9]{64}|index|graph-signals)|(?:packages|areas|docs|symbols|modules|decisions|concepts|changes)\/[a-z0-9-]+)\.md$|^\.obsidian\/(?:graph|app)\.json$/
export const ManifestSchema = z.object({
  schemaVersion: z.literal(1),
  files: z.record(z.string().regex(ownedName), z.string().regex(/^[a-f0-9]{64}$/)),
}).strict()

const isMissing = (error: unknown): boolean => (error as NodeJS.ErrnoException | undefined)?.code === 'ENOENT'

/** Reads a file in one operation; a missing file yields undefined instead of a check-then-read race. */
function readIfPresent(path: string): Buffer | undefined {
  try { return readFileSync(path) } catch (error) { if (isMissing(error)) return undefined; throw error }
}

/** Removes a file in one operation; an already-missing file is not an error. */
function removeIfPresent(path: string): void {
  try { unlinkSync(path) } catch (error) { if (!isMissing(error)) throw error }
}

// Add an entity kind here to opt it into the same identity, links and ownership contract.
export const VAULT_NOTE_TYPES: Readonly<Record<string, string>> = {
  package: '{{ body }}',
  area: '{{ body }}',
  decision: '{{ body }}',
  concept: '{{ body }}',
  change: '{{ body }}',
  document: '{{ body }}',
  'graph-signals': '{{ body }}',
  index: '{{ body }}',
}

/** Reject symlinks in every component, including dangling links and not-yet-created children. */
export const safePath = (root: string, candidate: string): string => {
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

export const requireIgnored = async (root: string, output: string): Promise<void> => {
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

export const exportVault = async (rootPath: string, config: DocBridgeConfigV1, options: { findings?: readonly PendingReferenceFinding[]; snapshot?: DiscoverySnapshotV1 } = {}): Promise<{ output: string; notes: number; removed: number; findings?: number; warnings?: string[] }> => {
  denyServiceOperation('vault export', config)
  const root = realpathSync.native(rootPath)
  const output = safePath(root, config.vault?.output ?? '.doc-bridge/vault')
  const human = safePath(root, config.vault?.humanNotes ?? 'docs/notes')
  if (output === root || overlaps(output, human)) throw new Error('Vault output and human-notes folders must be disjoint')
  await requireIgnored(root, output)
  const snapshot = options.snapshot ?? discoverRepository({ root, config })
  const pages = renderVault(root, output, config, snapshot, options.findings ?? [])
  const result = writeVault(root, output, pages)
  return { ...result, ...(options.findings ? { findings: options.findings.length } : {}), ...(result.warnings?.length ? { warnings: result.warnings } : {}) }
}

const folders: Record<string, string> = { package: 'packages', area: 'areas', document: 'docs', symbol: 'symbols', module: 'modules', decision: 'decisions', concept: 'concepts', change: 'changes' }
const readableSlug = (name: string): string => name.normalize('NFKD').replace(/[\[\]|#^/\\:\x00-\x1f\x7f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60).replace(/-+$/g, '') || 'untitled'
const colorGroups = [
  { query: 'tag:#drift', color: { a: 1, rgb: 14926657 } },
  { query: 'tag:#doc-bridge/document', color: { a: 1, rgb: 3447003 } },
  { query: 'tag:#doc-bridge/symbol', color: { a: 1, rgb: 3066993 } },
  { query: 'tag:#doc-bridge/package', color: { a: 1, rgb: 9807270 } },
  { query: 'tag:#doc-bridge/module', color: { a: 1, rgb: 3449439 } },
  { query: 'tag:#doc-bridge/area', color: { a: 1, rgb: 10181046 } },
]

export const renderVault = (root: string, output: string, config: DocBridgeConfigV1, snapshot: DiscoverySnapshotV1, findings: readonly PendingReferenceFinding[] = []): Record<string, string> => {
  const knowledge = config.index?.knowledgeEntities?.enabled ? extractKnowledgeEntities({
    snapshot,
    documents: new Map(snapshot.entities.filter(entity => entity.kind === 'document' && entity.path).map(entity => [entity.path!, readFileSync(safePath(root, entity.path!), 'utf8')])),
    gitRoot: root,
    window: config.index.knowledgeEntities,
  }) : undefined
  const knowledgeById = new Map(knowledge?.entities.map(entity => [entity.id, entity]))
  if (knowledge) snapshot = { ...snapshot, entities: [...snapshot.entities, ...knowledge.entities.map(entity => ({ id: entity.id, kind: entity.kind, name: entity.name, aliases: entity.aliases, provenance: 'observed' as const, evidence: entity.evidence.flatMap(item => item.kind === 'document-region' ? [{ source: 'documentation' as const, path: item.path, lineStart: item.lineStart, lineEnd: item.lineEnd, contentHash: item.regionHash }] : []) }))], coverage: [...snapshot.coverage, ...knowledge.coverage] }

  const excluded = config.vault?.exclude ?? []
  const excludedIds = new Set(snapshot.entities.filter(entity => excludedFromVault(entity, excluded)).map(entity => entity.id))
  const entities = snapshot.entities.filter(entity => !excludedIds.has(entity.id) && entity.kind !== 'index' && entity.kind !== 'graph-signals' && (knowledge || !['decision', 'concept', 'change'].includes(entity.kind)) && (Object.hasOwn(VAULT_NOTE_TYPES, entity.kind) || (knowledge && ['symbol', 'module'].includes(entity.kind)))).sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0)
  const readable = config.vault?.fileNames === 'readable'
  const stems = new Map<string, number>()
  if (readable) for (const entity of entities) { const key = `${folders[entity.kind] ?? 'docs'}/${readableSlug(entity.name)}`; stems.set(key, (stems.get(key) ?? 0) + 1) }
  const filenames = new Map(entities.map(entity => {
    if (!readable) return [entity.id, `${hash(entity.id)}.md`]
    const folder = folders[entity.kind] ?? 'docs'
    const slug = readableSlug(entity.name)
    const stem = `${folder}/${slug}${(stems.get(`${folder}/${slug}`) ?? 0) > 1 ? `-${hash(entity.id).slice(0, 6)}` : ''}`
    return [entity.id, `${stem}.md`]
  }))
  // A finding names its target by id or by symbol name; symbols such as `signature:module:<path>:<name>`
  // usually have no note of their own. Link the closest exported note: the target, then the id without
  // its assertion prefix, then the module that owns the symbol.
  const findingTarget = (target: string): string | undefined => {
    const ids = [target, ...snapshot.entities.filter(entity => entity.name === target).map(entity => entity.id)]
    for (const id of ids) {
      const withoutPrefix = id.replace(/^[a-z-]+:(?=[a-z-]+:)/, '')
      const owner = withoutPrefix.replace(/:[^:/]+$/, '')
      const found = [id, withoutPrefix, owner].find(candidate => filenames.has(candidate))
      if (found) return found
    }
    return undefined
  }
  const link = (id: string): string => {
    const filename = filenames.get(id)
    const label = (entities.find(entity => entity.id === id)?.name ?? id).replace(/[\[\]|\r\n]/g, ' ').trim()
    return filename ? readable ? `[[${filename.slice(0, -3)}|${label}]]` : `[[${filename.slice(0, -3)}]]` : `\`${id.replace(/`/g, '')}\``
  }
  const nameOf = (id: string): string => (snapshot.entities.find(entity => entity.id === id)?.name ?? id).replace(/[\[\]|\r\n`]/g, ' ').trim()
  // Summary notes link only to other notes; an end without a note (excluded or not exported) is plain text.
  const noteLink = (id: string): string => filenames.has(id) ? link(id) : nameOf(id)
  // Open once (refusing symlinks) and check the opened descriptor, so the file read is the file checked.
  const readSource = (path: string): string | undefined => {
    let fd: number | undefined
    try {
      fd = openSync(safePath(root, path), constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0))
      return fstatSync(fd).isFile() ? readFileSync(fd, 'utf8') : undefined
    } catch { return undefined } finally { if (fd !== undefined) closeSync(fd) }
  }
  const templates = new Map(Object.entries({ ...VAULT_NOTE_TYPES, ...(knowledge ? { symbol: '{{ body }}', module: '{{ body }}' } : {}) }).filter(([kind]) => knowledge || !['decision', 'concept', 'change'].includes(kind)).map(([kind, bundled]) => {
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
      const regions = (entity.kind === 'document' || knowledgeById.has(entity.id)) ? parseMarkdownDocument(path, bytes.toString('utf8')).citationRegions ?? [] : []
      return { path: toPosix(path), fileHash: hash(bytes), hashAlgorithm: 'sha256-exact-bytes-v1', regions, regionHashAlgorithm: 'sha256-normalized-v1' }
    })
    const entityFindings = findings.filter(finding => finding.document === entity.path || finding.document === entity.id)
    const tags = [...new Set([...(Array.isArray(entity.metadata?.tags) ? entity.metadata.tags.filter((tag): tag is string => typeof tag === 'string') : []), ...(readable || config.vault?.obsidian ? [`doc-bridge/${entity.kind}`] : []), ...entityFindings.map(finding => `drift/${finding.code.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`)])].sort()
    const relations = (adjacency.get(entity.id) ?? []).sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0)
    const sourceHref = (path: string): string => toPosix(relative(output, safePath(root, path))).split('/').map(part => encodeURIComponent(part).replace(/[()]/g, character => character === '(' ? '%28' : '%29')).join('/')
    const sourceLinks = sources.map(path => `[Source](${sourceHref(path)})`)
    const observed = knowledgeById.get(entity.id)
    const evidenceLinks = observed?.evidence.flatMap(item => item.kind === 'document-region' ? [`- [Source region](${sourceHref(item.path)}#L${item.lineStart}-L${item.lineEnd}) (${item.regionHash})`] : item.kind === 'commit' ? [`- Commit: \`${item.sha}\``] : [`- Fact: ${link(item.factId)}`]) ?? []
    const knowledgeLinks = observed?.links.map(item => `- ${item.kind}: ${link(item.target)}`) ?? []
    if (observed) {
      for (const document of snapshot.entities.filter(item => item.kind === 'document' && item.path && sources.includes(item.path))) knowledgeLinks.push(`- source-document: ${link(document.id)}`)
      const ancestors = new Set(observed.links.filter(item => item.kind === 'affected-fact' || item.kind === 'defines-symbol').map(item => item.target))
      for (let changed = true; changed;) {
        changed = false
        for (const relation of snapshot.relations) if (relation.kind === 'contains' && ancestors.has(relation.to) && !ancestors.has(relation.from)) { ancestors.add(relation.from); changed = true }
      }
      for (const owner of snapshot.entities.filter(item => item.kind === 'package' && ancestors.has(item.id))) knowledgeLinks.push(`- package: ${link(owner.id)}`)
    }
    const findingLines = entityFindings.map(finding => {
      const target = findingTarget(finding.target)
      return `- ${finding.line ?? '?'} → ${finding.target} (${finding.code})${target ? ` — ${link(target)}` : ''}`
    })
    const summary = config.vault?.content === 'summary'
    const visible = relations.filter(relation => !excludedIds.has(relation.from) && !excludedIds.has(relation.to))
    const body = summary ? [
      `# ${entity.name.replace(/[\r\n]/g, ' ')}`, '', ...entitySummary(root, entity, visible, readSource), '', ...sourceLinks,
      ...relationSections(entity, visible, noteLink, nameOf),
      ...(observed ? ['', '## Evidence', '', ...evidenceLinks, '', '## Knowledge links', '', ...knowledgeLinks] : []),
      ...(findingLines.length ? ['', '## Findings', '', ...findingLines] : []),
      ...(config.vault?.indexBacklinks === false ? [] : ['', '[[index]]']),
    ].join('\n') : [`# ${entity.name.replace(/[\r\n]/g, ' ')}`, '', ...sourceLinks, '', '## Relations', '', ...relations.map(relation => `- ${relation.provenance} ${relation.kind}: ${link(relation.from)} → ${link(relation.to)}`), ...(observed ? ['', '## Evidence', '', ...evidenceLinks, '', '## Knowledge links', '', ...knowledgeLinks] : []), ...(findingLines.length ? ['', '## Findings', '', ...findingLines] : []), ...(config.vault?.indexBacklinks === false ? [] : ['', '[[index]]'])].join('\n')
    render(filenames.get(entity.id)!, entity.kind, { id: entity.id, sourcePath: entity.path ?? null, sources: sourceBindings, aliases: [...new Set(entity.aliases ?? [])].sort(), tags, ...(observed ? { evidence: observed.evidence } : {}) }, body)
  }
  const scores = (signal: ReadonlyMap<string, number>): string[] => [...signal].map(([id, score]) => `- ${link(id)}: ${score}`)
  const signalLink = (id: string): string => config.vault?.indexBacklinks === false ? (entities.find(entity => entity.id === id)?.name ?? id) : link(id)
  // Excluded entities stay out of the vault entirely, signals included.
  const kept = <T,>(items: Iterable<[string, T]>): [string, T][] => [...items].filter(([id]) => !excludedIds.has(id))
  render('graph-signals.md', 'graph-signals', { id: 'vault:graph-signals', aliases: [], tags: [] }, [
    '# Graph signals', '', '## Canonicality', '', ...kept(canonicality(snapshot)).map(([id, score]) => `- ${signalLink(id)}: ${score}`), '', '## Centrality', '', ...kept(centrality(snapshot)).map(([id, score]) => `- ${signalLink(id)}: ${score}`), '',
    '## Import cycles', '', ...importCycles(snapshot).filter(cycle => !cycle.nodes.some(id => excludedIds.has(id))).map(cycle => `- ${cycle.nodes.map(signalLink).join(' → ')}`), '',
    '## Area suggestions', '', ...areaSuggestions(snapshot).map(area => `- ${area.label}: ${area.members.filter(id => !excludedIds.has(id)).map(signalLink).join(', ')}`), '', ...(config.vault?.indexBacklinks === false ? [] : ['[[index]]']),
  ].join('\n'))
  render('index.md', 'index', { id: 'vault:index', aliases: [], tags: [] }, ['# Knowledge map', '', ...entities.map(entity => `- ${entity.kind}: ${link(entity.id)}`), '', '[[graph-signals]]', '', 'Generated navigation links to source documents; it does not copy their contents.', '', 'Coverage:', ...snapshot.coverage.map(item => `- ${item.analyzer}: ${item.scope} — ${item.status}${item.reason ? ` (${item.reason})` : ''}`)].join('\n'))

  if (config.vault?.obsidian) {
    pages['.obsidian/graph.json'] = `${JSON.stringify({ colorGroups, search: '-file:index -file:graph-signals -path:changes', showTags: false, showAttachments: false, hideUnresolved: true, showArrow: true, scale: 1, center: { x: 0, y: 0 }, repelStrength: 10, linkStrength: 1, linkDistance: 250, repulsion: 150, attraction: 1 }, null, 2)}\n`
    pages['.obsidian/app.json'] = `${JSON.stringify({ alwaysUpdateLinks: false }, null, 2)}\n`
  }
  return pages
}

const writeVault = (root: string, output: string, pages: Record<string, string>): { output: string; notes: number; removed: number; warnings?: string[] } => {
  const manifestPath = safePath(root, relative(root, resolve(output, MANIFEST)))
  const manifest = readIfPresent(manifestPath)
  const previous = manifest === undefined ? {} : ManifestSchema.parse(JSON.parse(manifest.toString('utf8'))).files
  // Preflight the entire set before writes: edited notes remain available for round-trip review.
  const warnings: string[] = []
  for (const [filename, expected] of Object.entries(previous)) {
    const current = readIfPresent(safePath(root, relative(root, resolve(output, filename))))
    if (current !== undefined && hash(current) !== expected) {
      if (filename.startsWith('.obsidian/')) { warnings.push(`Obsidian setting left unchanged after user edit: ${filename}`); delete pages[filename]; continue }
      throw new Error(`Generated vault note was edited: ${filename}; preserve or review the edit before exporting`)
    }
  }
  for (const filename of Object.keys(pages)) {
    const target = safePath(root, relative(root, resolve(output, filename)))
    if (existsSync(target) && !Object.hasOwn(previous, filename)) {
      if (filename.startsWith('.obsidian/')) { warnings.push(`Obsidian setting left unchanged because it is not manifest-owned: ${filename}`); delete pages[filename]; continue }
      throw new Error(`Vault file is not owned by the manifest: ${filename}`)
    }
  }
  mkdirSync(output, { recursive: true })
  for (const [filename, content] of Object.entries(pages)) { const target = safePath(output, filename); mkdirSync(dirname(target), { recursive: true }); writeFileSync(target, content, 'utf8') }
  const stale = Object.keys(previous).filter(filename => !Object.hasOwn(pages, filename))
  for (const filename of stale) {
    const target = safePath(output, filename)
    const current = readIfPresent(target)
    if (current !== undefined && hash(current) !== previous[filename]) { warnings.push(`Edited generated file retained: ${filename}`); continue }
    removeIfPresent(target)
  }
  const files = Object.fromEntries(Object.entries(pages).sort(([a], [b]) => a < b ? -1 : 1).map(([filename, content]) => [filename, hash(content)]))
  writeFileSync(manifestPath, `${JSON.stringify({ schemaVersion: 1, files }, null, 2)}\n`, 'utf8')
  return { output: toPosix(relative(root, output)), notes: Object.keys(pages).filter(filename => filename.endsWith('.md')).length, removed: stale.length, ...(warnings.length ? { warnings } : {}) }
}
