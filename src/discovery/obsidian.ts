import { posix } from 'node:path'
import { minimatch } from 'minimatch'
import { unified } from 'unified'
import remarkParse from 'remark-parse'
import remarkFrontmatter from 'remark-frontmatter'
import remarkWikiLink from '@flowershow/remark-wiki-link'
import { visit } from 'unist-util-visit'
import { parseDocument } from 'yaml'
import type { DocBridgeConfigV1, HumanCorpusConfig } from '../config/schema.js'
import type { Root } from 'mdast'
import type { Evidence, KnowledgeRelation } from '../schemas/knowledge.js'
import { entityId, relationId } from './identity.js'
import { toPosix } from '../lib/paths.js'

export const OBSIDIAN_ANALYZER_VERSION = '1.0.0'
export const obsidianCorpora = (config?: DocBridgeConfigV1): HumanCorpusConfig[] => {
  const human = config?.corpus?.human
  return (Array.isArray(human) ? human : human ? [human] : []).filter(item => item.plugin === 'obsidian')
}
export const obsidianCorpusPath = (path: string, corpus: HumanCorpusConfig): string | undefined => {
  const options = corpus.options
  const root = posix.normalize(toPosix([options?.contentDir, options?.root, options?.docsDir].find((value): value is string => typeof value === 'string' && value.length > 0) ?? 'docs')).replace(/^\.\//, '').replace(/\/$/, '')
  if (root.startsWith('/') || root === '..' || root.startsWith('../')) return undefined
  const relative = root === '.' ? path : path.startsWith(`${root}/`) ? path.slice(root.length + 1) : undefined
  if (relative === undefined) return undefined
  const patterns = (value: unknown): string[] => Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : []
  if (patterns(options?.exclude).some(pattern => minimatch(relative, pattern, { dot: true }))) return undefined
  const include = patterns(options?.include)
  return !include.length || include.some(pattern => minimatch(relative, pattern, { dot: true })) ? relative : undefined
}

type Reference = { target: string; embed: boolean; alias?: string; line: number }
export type ObsidianDocument = { path: string; aliases: string[]; tags: string[]; references: Reference[] }
const strings = (value: unknown): string[] => (typeof value === 'string' ? [value] : Array.isArray(value) ? value : [])
  .filter((item): item is string => typeof item === 'string' && item.trim().length > 0).map(item => item.trim()).filter(item => item.length <= 256)
const processor = unified().use(remarkParse).use(remarkFrontmatter, ['yaml']).use(remarkWikiLink, { format: 'regular' })

export const parseObsidianDocument = (path: string, text: string): ObsidianDocument => {
  const tree = processor.parse(text.replace(/^\uFEFF/, '')) as Root
  const yaml = tree.children.find(node => node.type === 'yaml')
  const parsed = yaml ? parseDocument(yaml.value) : undefined
  const frontmatter = parsed && !parsed.errors.length ? parsed.toJS({ maxAliasCount: 100 }) : undefined
  const aliases = strings(frontmatter?.aliases)
  const tags = new Set(strings(frontmatter?.tags).map(tag => tag.replace(/^#/, '')))
  const references: Reference[] = []
  visit(tree, node => {
    // The extension owns tokenization; its rendered href is deliberately not used for resolution.
    if ((node.type as string) === 'wikiLink' || (node.type as string) === 'embed') {
      const wiki = node as unknown as { value: string; data?: { alias?: string }; position?: { start: { line: number } } }
      references.push({ target: wiki.value.trim(), embed: (node.type as string) === 'embed', ...(wiki.data?.alias ? { alias: wiki.data.alias } : {}), line: wiki.position?.start.line ?? 1 })
    }
    if (node.type === 'text') for (const match of node.value.matchAll(/(?:^|\s)#([\p{L}\p{N}_/-]*[\p{L}_/-][\p{L}\p{N}_/-]*)/gu)) tags.add(match[1]!)
  })
  return { path, aliases: [...new Set(aliases)].sort().slice(0, 32), tags: [...tags].sort().slice(0, 64), references }
}

export const analyzeObsidianDocuments = (documents: readonly ObsidianDocument[], corpus: HumanCorpusConfig) => {
  const notes: { scope: string; reason: string; evidence: Evidence[] }[] = []
  const relations = new Map<string, KnowledgeRelation>()
  const assets = new Map<string, Reference[]>()
  const members = documents.filter(doc => obsidianCorpusPath(doc.path, corpus) !== undefined)
  const paths = new Map(members.map(doc => [obsidianCorpusPath(doc.path, corpus)!, doc.path]))
  const basenames = new Map<string, string[]>(), aliases = new Map<string, string[]>()
  for (const doc of members) {
    const name = posix.basename(doc.path).replace(/\.mdx?$/, '')
    basenames.set(name, [...(basenames.get(name) ?? []), doc.path])
    for (const alias of doc.aliases) aliases.set(alias, [...(aliases.get(alias) ?? []), doc.path])
  }
  for (const doc of members) for (const ref of doc.references) {
    const [raw = '', fragment] = ref.target.split('#', 2)
    const name = raw.replace(/\.mdx?$/, '')
    const path = raw.startsWith('./') || raw.startsWith('../') ? posix.normalize(posix.join(posix.dirname(obsidianCorpusPath(doc.path, corpus)!), raw)) : posix.normalize(raw)
    const exact = raw ? [path, `${path}.md`, `${path}.mdx`].flatMap(path => paths.has(path) ? [paths.get(path)!] : []) : [doc.path]
    const basenameMatches = basenames.get(name) ?? []
    const candidates = [...new Set(exact.length ? exact : basenameMatches.length ? basenameMatches : aliases.get(raw) ?? [])].sort()
    if (!candidates.length && ref.embed && posix.extname(raw) && !/\.mdx?$/.test(raw)) {
      assets.set(doc.path, [...(assets.get(doc.path) ?? []), ref].slice(0, 64))
      continue
    }
    const evidence: Evidence[] = [{ source: 'documentation', path: doc.path, lineStart: ref.line, lineEnd: ref.line }]
    if (candidates.length !== 1) {
      notes.push({ scope: `obsidian:${doc.path}:${ref.line}`, reason: `${candidates.length ? 'AMBIGUOUS_WIKILINK' : 'UNRESOLVED_WIKILINK'}: ${ref.target.slice(0, 256)}; no relation emitted.`, evidence })
      continue
    }
    const from = entityId('document', doc.path), to = entityId('document', candidates[0]!)
    const id = relationId(from, 'links-to', to)
    const prior = relations.get(id)
    const reference = { ...ref, ...(fragment !== undefined ? { fragment } : {}) }
    relations.set(id, { id, kind: 'links-to', from, to, provenance: 'observed', evidence: [...(prior?.evidence ?? []), ...evidence].slice(0, 8), metadata: { references: [...((prior?.metadata?.references as unknown[] | undefined) ?? []), reference].slice(0, 8) } })
  }
  return { notes, relations: [...relations.values()], assets }
}
