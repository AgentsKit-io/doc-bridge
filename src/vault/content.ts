import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { minimatch } from 'minimatch'

import type { DiscoverySnapshotV1 } from '../schemas/knowledge.js'

type Entity = DiscoverySnapshotV1['entities'][number]
type Relation = DiscoverySnapshotV1['relations'][number]

/** Longest summary written into a note: a pointer to the source, never a copy of it. */
export const SUMMARY_MAX = 240

/** Human headings for each relation kind, seen from the note's side: [outgoing, incoming]. */
const RELATION_HEADINGS: Readonly<Record<string, readonly [string, string]>> = {
  contains: ['Contains', 'Part of'],
  imports: ['Imports', 'Imported by'],
  'depends-on': ['Depends on', 'Depended on by'],
  'links-to': ['Links to', 'Linked from'],
  'mentions-symbol': ['Mentions code', 'Documented by'],
  mentions: ['Mentions', 'Mentioned by'],
  're-exports': ['Re-exports', 'Re-exported by'],
}

const clip = (text: string): string => {
  const flat = text.replace(/\s+/g, ' ').trim()
  if (flat.length <= SUMMARY_MAX) return flat
  const cut = flat.slice(0, SUMMARY_MAX)
  return `${cut.slice(0, Math.max(cut.lastIndexOf(' '), SUMMARY_MAX - 40))}…`
}

/** Markdown inline syntax that would render as links, embeds or HTML inside the vault is flattened to text. */
const plain = (text: string): string => text
  .replace(/!?\[\[([^\]|]*)(?:\|([^\]]*))?\]\]/g, (_, target: string, label?: string) => label ?? target)
  .replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1')
  // Angle brackets are dropped outright, so no HTML element can survive in a note.
  .replace(/[<>\[\]]/g, '')

/** The declared description, else the first prose paragraph after the title. */
export const documentSummary = (markdown: string): string | undefined => {
  const front = markdown.match(/^---\r?\n([\s\S]*?)\r?\n---/)
  const declared = front?.[1]?.match(/^description:\s*(.+)$/m)?.[1]?.trim().replace(/^(['"])(.*)\1$/, '$2')
  if (declared) return clip(plain(declared))
  const body = front ? markdown.slice(front[0].length) : markdown
  let fenced = false
  const paragraph: string[] = []
  for (const line of body.split(/\r?\n/)) {
    if (/^\s*(```|~~~)/.test(line)) { fenced = !fenced; if (paragraph.length) break; continue }
    if (fenced) continue
    const text = line.trim()
    if (!text) { if (paragraph.length) break; continue }
    if (/^(#|>|\||[-*+] |\d+\. |<)/.test(text)) { if (paragraph.length) break; continue }
    paragraph.push(text)
  }
  return paragraph.length ? clip(plain(paragraph.join(' '))) : undefined
}

/** The leading block or line comment of a source module, if it opens with one. */
export const moduleSummary = (source: string): string | undefined => {
  const text = source.replace(/^#!.*\r?\n/, '').trimStart()
  const block = text.match(/^\/\*\*?([\s\S]*?)\*\//)
  const lines = block ? block[1]!.split(/\r?\n/).map(line => line.replace(/^\s*\*\s?/, '')) : text.match(/^(?:\/\/.*(?:\r?\n|$))+/)?.[0].split(/\r?\n/).map(line => line.replace(/^\s*\/\/\s?/, ''))
  const summary = lines?.filter(line => !/^\s*@/.test(line) && !/eslint|prettier|@ts-/.test(line)).join(' ')
  return summary?.trim() ? clip(plain(summary)) : undefined
}

const packageDescription = (root: string, path: string | undefined): string | undefined => {
  const manifest = join(root, path ?? '.', 'package.json')
  if (!existsSync(manifest)) return undefined
  try {
    const description = (JSON.parse(readFileSync(manifest, 'utf8')) as { description?: unknown }).description
    return typeof description === 'string' && description.trim() ? clip(plain(description)) : undefined
  } catch { return undefined }
}

const count = (n: number, word: string): string => `${n} ${word}${n === 1 ? '' : 's'}`

/** One or two plain lines that say what the entity is, written under the note title. */
export const entitySummary = (root: string, entity: Entity, relations: readonly Relation[], read: (path: string) => string | undefined): string[] => {
  const outgoing = (kind: string) => relations.filter(relation => relation.kind === kind && relation.from === entity.id && relation.to !== entity.id)
  const incoming = (kind: string) => relations.filter(relation => relation.kind === kind && relation.to === entity.id && relation.from !== entity.id)
  const distinct = (list: readonly Relation[], side: 'from' | 'to') => new Set(list.map(relation => relation[side])).size
  if (entity.kind === 'document') {
    const source = entity.path ? read(entity.path) : undefined
    const summary = source === undefined ? undefined : documentSummary(source)
    const facts = [`\`${entity.path}\``, distinct(outgoing('mentions-symbol'), 'to') ? `mentions ${count(distinct(outgoing('mentions-symbol'), 'to'), 'code module')}` : '', distinct(incoming('links-to'), 'from') ? `linked from ${count(distinct(incoming('links-to'), 'from'), 'document')}` : ''].filter(Boolean)
    return [...(summary ? [summary] : []), `Documentation: ${facts.join(' · ')}.`]
  }
  if (entity.kind === 'module') {
    const source = entity.path ? read(entity.path) : undefined
    const summary = source === undefined ? undefined : moduleSummary(source)
    const documented = distinct(incoming('mentions-symbol'), 'from')
    const facts = [`\`${entity.path}\``, `imports ${distinct(outgoing('imports'), 'to')}`, `imported by ${distinct(incoming('imports'), 'from')}`, documented ? `documented by ${count(documented, 'document')}` : 'not referenced by any document'].filter(Boolean)
    return [...(summary ? [summary] : []), `Code module: ${facts.join(' · ')}.`]
  }
  if (entity.kind === 'package') {
    const description = packageDescription(root, entity.path)
    return [...(description ? [description] : []), `Package \`${entity.name}\` containing ${count(distinct(outgoing('contains'), 'to'), 'member')}.`]
  }
  if (entity.kind === 'area') return [`Area \`${entity.path ?? entity.name}\` with ${count(distinct(outgoing('contains'), 'to'), 'member')}.`]
  return []
}

/** Relations grouped under human headings, deduplicated, each linking the other end. */
export const relationSections = (entity: Entity, relations: readonly Relation[], link: (id: string) => string, label: (id: string) => string): string[] => {
  const groups = new Map<string, Set<string>>()
  for (const relation of relations) {
    if (relation.from === relation.to) continue
    const out = relation.from === entity.id
    const other = out ? relation.to : relation.from
    const [outHeading, inHeading] = RELATION_HEADINGS[relation.kind] ?? [relation.kind, `${relation.kind} (incoming)`]
    const heading = out ? outHeading : inHeading
    groups.set(heading, (groups.get(heading) ?? new Set()).add(other))
  }
  const order = Object.values(RELATION_HEADINGS).flat()
  return [...groups].sort(([a], [b]) => (order.indexOf(a) + 1 || 99) - (order.indexOf(b) + 1 || 99) || (a < b ? -1 : 1)).flatMap(([heading, ids]) => [
    '', `## ${heading}`, '', ...[...ids].sort((a, b) => label(a).localeCompare(label(b)) || (a < b ? -1 : 1)).map(id => `- ${link(id)}`),
  ])
}

const matches = (path: string, patterns: readonly string[]): boolean =>
  patterns.some(pattern => minimatch(path, pattern, { dot: true }) || minimatch(`${path}/`, pattern, { dot: true }))

/**
 * True when an entity is left out of the vault: its source path matches an exclude glob, or it has
 * no path of its own and every piece of its evidence comes from excluded files.
 */
export const excludedFromVault = (entity: Entity, patterns: readonly string[]): boolean => {
  if (!patterns.length) return false
  if (entity.path) return matches(entity.path, patterns)
  const paths = entity.evidence.map(item => item.path).filter((path): path is string => Boolean(path))
  return paths.length > 0 && paths.every(path => matches(path, patterns))
}
