import { toString as mdastToString } from 'mdast-util-to-string'
import remarkFrontmatter from 'remark-frontmatter'
import remarkGfm from 'remark-gfm'
import remarkParse from 'remark-parse'
import { unified } from 'unified'
import { visit } from 'unist-util-visit'
import { parse as parseYaml } from 'yaml'
import type { Root, RootContent } from 'mdast'

import { sha256NormalizedV1 } from '../index-builder/content-hash.js'
import { resolveFuzzyReference } from '../lib/fuzzy-match.js'
import { toPosix } from '../lib/paths.js'
import type { Evidence, KnowledgeRelation } from '../schemas/knowledge.js'
import { relationId } from './identity.js'

/**
 * The Markdown analyzer.
 *
 * Documentation was previously read with regular expressions: frontmatter by one, the `docbridge`
 * block by a hand-written YAML subset, and the prose not at all. Headings, links and inline code
 * were discarded — so a repository where 23 documents linked to other documents and 14 cited
 * source paths produced no edges from any of it, and one document in ninety-two counted as
 * documented. A real parser turns that prose into evidence-backed relations with line numbers,
 * which is the difference between a graph that knows what its documentation says and one that
 * only knows the documentation exists.
 *
 * Every edge here is `observed` with file and line evidence from the node's own position. Nothing
 * is inferred from a near-match unless the near-match is unambiguous.
 */

export const MARKDOWN_ANALYZER_VERSION = '1.0.0'

/** Headings deeper than this are structure, not subject matter. */
const MAX_HEADING_DEPTH = 3
const MAX_HEADINGS = 64
const MAX_SUMMARY_LENGTH = 400
const MAX_TITLE_LENGTH = 256

/** A document with more relations than this is an index page; the tail adds noise, not knowledge. */
export const MARKDOWN_RELATION_CAP = 64

/**
 * A region a generator owns. The analyzer skips it when collecting mentions, so Doc Bridge does
 * not read its own output back in as evidence about the repository.
 */
const GENERATED_OPEN = /<!--\s*doc-bridge:generated(?:\s+hash=([A-Za-z0-9]+))?[^>]*-->/
const GENERATED_CLOSE = /<!--\s*\/\s*doc-bridge:generated\s*-->/

const EXTERNAL_LINK = /^(?:[a-z][a-z0-9+.-]*:|\/\/|#|mailto:)/i

export type MarkdownHeading = {
  readonly depth: number
  readonly text: string
  readonly line: number
}

export type MarkdownReference = {
  /** The link target, or the inline code token. */
  readonly value: string
  /** Link text, when the reference came from a link. */
  readonly text?: string
  readonly line: number
}

export type MarkdownGeneratedRegion = {
  readonly lineStart: number
  readonly lineEnd: number
  readonly hash?: string
}

/** The frontmatter fields the knowledge model understands. Everything else is left alone. */
export type MarkdownFrontmatter = {
  readonly type?: string
  readonly audience?: string
  readonly owner?: string
  readonly lifecycle?: string
  readonly tier?: string
}

export type MarkdownDocumentV1 = {
  readonly path: string
  readonly title?: string
  readonly headings: readonly MarkdownHeading[]
  readonly summary?: string
  readonly wordCount: number
  readonly frontmatter: MarkdownFrontmatter
  readonly generatedRegions: readonly MarkdownGeneratedRegion[]
  readonly contentHash: string
  /** Links outside generated regions. */
  readonly links: readonly MarkdownReference[]
  /** Inline code tokens outside generated regions. */
  readonly codeTokens: readonly MarkdownReference[]
  /** Raw frontmatter text and the line it starts on, for the declaration parser. */
  readonly frontmatterBlock?: { readonly value: string; readonly line: number }
}

const processor = unified()
  .use(remarkParse)
  .use(remarkFrontmatter, ['yaml'])
  .use(remarkGfm)

type Positioned = { readonly position?: { readonly start: { readonly line: number } } | undefined }

const lineOf = (node: Positioned): number => node.position?.start.line ?? 1

const withinGenerated = (line: number, regions: readonly MarkdownGeneratedRegion[]): boolean =>
  regions.some((region) => line >= region.lineStart && line <= region.lineEnd)

/** Cap a summary at a sentence boundary when there is one, and never mid-word. */
const boundedSummary = (value: string): string | undefined => {
  const text = value.replace(/\s+/g, ' ').trim()
  if (!text) return undefined
  if (text.length <= MAX_SUMMARY_LENGTH) return text
  const sliced = text.slice(0, MAX_SUMMARY_LENGTH)
  const sentenceEnd = Math.max(sliced.lastIndexOf('. '), sliced.lastIndexOf('! '), sliced.lastIndexOf('? '))
  if (sentenceEnd > MAX_SUMMARY_LENGTH * 0.4) return sliced.slice(0, sentenceEnd + 1).trim()
  const wordEnd = sliced.lastIndexOf(' ')
  return (wordEnd > 0 ? sliced.slice(0, wordEnd) : sliced).trim()
}

const frontmatterField = (data: unknown, key: keyof MarkdownFrontmatter): string | undefined => {
  if (typeof data !== 'object' || data === null || Array.isArray(data)) return undefined
  const value = (data as Record<string, unknown>)[key]
  if (typeof value === 'string' && value.trim()) return value.trim().slice(0, 128)
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  return undefined
}

/**
 * The frontmatter fields the knowledge model reads, parsed as real YAML.
 *
 * Unparseable frontmatter yields no fields rather than a guess: the declaration layer is what
 * reports the syntax error, with a line number, and one report is better than two.
 */
const frontmatterSubset = (value: string | undefined): MarkdownFrontmatter => {
  if (!value) return {}
  let data: unknown
  try {
    data = parseYaml(value)
  } catch {
    return {}
  }
  const subset: Record<string, string> = {}
  for (const key of ['type', 'audience', 'owner', 'lifecycle', 'tier'] as const) {
    const field = frontmatterField(data, key)
    if (field !== undefined) subset[key] = field
  }
  return subset
}

/**
 * The audience a document declares about itself.
 *
 * `audience` is authoritative by definition — it is the author naming their reader. `type` counts
 * only when it happens to name an audience, because in practice it names a document kind
 * (`package`, `module`, `index`), and putting that in the audience field would corrupt the
 * coverage counts that read it.
 */
const AUDIENCES = new Set(['agent', 'human', 'archive', 'project', 'internal', 'external', 'unclassified'])

export const declaredAudience = (frontmatter: MarkdownFrontmatter): string | undefined => {
  if (frontmatter.audience) return frontmatter.audience.toLowerCase()
  const type = frontmatter.type?.toLowerCase()
  return type && AUDIENCES.has(type) ? type : undefined
}

const generatedRegions = (tree: Root, totalLines: number): MarkdownGeneratedRegion[] => {
  const regions: MarkdownGeneratedRegion[] = []
  let open: { line: number; hash?: string } | undefined

  visit(tree, 'html', (node) => {
    const line = lineOf(node)
    const closing = GENERATED_CLOSE.exec(node.value)
    if (closing) {
      if (open) regions.push({ lineStart: open.line, lineEnd: node.position?.end.line ?? line, ...(open.hash ? { hash: open.hash } : {}) })
      open = undefined
      return
    }
    const opening = GENERATED_OPEN.exec(node.value)
    if (!opening) return
    // A second opening marker closes the previous region: generators emit regions, not nests.
    if (open) regions.push({ lineStart: open.line, lineEnd: line - 1, ...(open.hash ? { hash: open.hash } : {}) })
    open = { line, ...(opening[1] ? { hash: opening[1] } : {}) }
  })

  // An unclosed marker owns the rest of the file, which is what a trailing generated block is.
  if (open) regions.push({ lineStart: open.line, lineEnd: totalLines, ...(open.hash ? { hash: open.hash } : {}) })
  return regions
}

export const parseMarkdownDocument = (path: string, content: string): MarkdownDocumentV1 => {
  const normalized = content.replace(/^\uFEFF/, '')
  const tree = processor.parse(normalized) as Root
  const totalLines = normalized.split(/\r?\n/).length

  const frontmatterNode = tree.children.find((child): child is RootContent & { type: 'yaml'; value: string } => child.type === 'yaml')
  const regions = generatedRegions(tree, totalLines)

  const headings: MarkdownHeading[] = []
  const links: MarkdownReference[] = []
  const codeTokens: MarkdownReference[] = []
  let title: string | undefined
  let summary: string | undefined

  visit(tree, (node) => {
    if (node.type === 'yaml') return
    const line = lineOf(node as { position?: { start: { line: number } } })

    if (node.type === 'heading') {
      const text = mdastToString(node).trim()
      if (!text) return
      if (!title && node.depth === 1) title = text.slice(0, MAX_TITLE_LENGTH)
      if (node.depth <= MAX_HEADING_DEPTH && headings.length < MAX_HEADINGS) {
        headings.push({ depth: node.depth, text: text.slice(0, MAX_TITLE_LENGTH), line })
      }
      return
    }

    if (node.type === 'paragraph' && !summary && !withinGenerated(line, regions)) {
      // A paragraph that is only a link is navigation, not a description of the document.
      const onlyLink = node.children.length === 1 && node.children[0]?.type === 'link'
      if (!onlyLink) summary = boundedSummary(mdastToString(node))
      return
    }

    if (node.type === 'link' && !withinGenerated(line, regions)) {
      const text = mdastToString(node).trim()
      links.push({ value: node.url, ...(text ? { text } : {}), line })
      return
    }

    if (node.type === 'inlineCode' && !withinGenerated(line, regions)) {
      const value = node.value.trim()
      if (value) codeTokens.push({ value, line })
    }
  })

  const frontmatter = frontmatterSubset(frontmatterNode?.value)
  const body = tree.children.filter((child) => child.type !== 'yaml')
  const prose = body.map((child) => mdastToString(child)).join(' ')
  const wordCount = prose.split(/\s+/).filter(Boolean).length

  return {
    path,
    ...(title ? { title } : {}),
    headings,
    ...(summary ? { summary } : {}),
    wordCount,
    frontmatter,
    generatedRegions: regions,
    contentHash: sha256NormalizedV1(normalized),
    links,
    codeTokens,
    ...(frontmatterNode
      ? { frontmatterBlock: { value: frontmatterNode.value, line: lineOf(frontmatterNode) } }
      : {}),
  }
}



export type MarkdownResolution = {
  /** Repository-relative paths of every scanned document. */
  readonly documents: ReadonlyMap<string, string>
  /** Repository-relative module path to entity id. */
  readonly modules: ReadonlyMap<string, string>
  /** Package name, and short name, to entity id. */
  readonly packages: ReadonlyMap<string, string>
  /** Exported symbol to the entity ids of every module exporting it. */
  readonly symbols: ReadonlyMap<string, readonly string[]>
  readonly relationCap?: number
}

export type MarkdownNote = {
  readonly scope: string
  readonly reason: string
  readonly evidence: readonly Evidence[]
}

export type MarkdownAnalysis = {
  readonly relations: readonly KnowledgeRelation[]
  readonly notes: readonly MarkdownNote[]
  readonly truncated: boolean
}

const documentEvidence = (path: string, line: number): Evidence => ({
  source: 'documentation',
  path,
  lineStart: line,
  lineEnd: line,
})

/** Resolve a relative link against the document's own directory, POSIX-style. */
const resolveRelative = (from: string, target: string): string | undefined => {
  if (!target || EXTERNAL_LINK.test(target)) return undefined
  const clean = target.split('#')[0]?.split('?')[0] ?? ''
  if (!clean) return undefined
  const base = clean.startsWith('/') ? [] : from.split('/').slice(0, -1)
  const segments = [...base]
  for (const segment of clean.replace(/^\//, '').split('/')) {
    if (!segment || segment === '.') continue
    if (segment === '..') {
      if (!segments.length) return undefined
      segments.pop()
      continue
    }
    segments.push(segment)
  }
  return segments.length ? toPosix(segments.join('/')) : undefined
}

/** A token that could be a repository path, as opposed to prose or a symbol. */
const pathShaped = (value: string): boolean => /[/.]/.test(value) && !/\s/.test(value)

export const analyzeMarkdownDocument = (
  document: MarkdownDocumentV1,
  documentId: string,
  resolution: MarkdownResolution,
): MarkdownAnalysis => {
  const cap = resolution.relationCap ?? MARKDOWN_RELATION_CAP
  const relations = new Map<string, KnowledgeRelation>()
  const notes: MarkdownNote[] = []
  const ambiguous = new Map<string, Evidence[]>()
  let truncated = false

  const add = (kind: string, to: string, line: number, confidence?: 'fuzzy'): void => {
    if (to === documentId) return
    const id = relationId(documentId, kind, to)
    const existing = relations.get(id)
    if (existing) {
      // One relation, every place the document says it — evidence accumulates, the edge does not.
      if (existing.evidence.length < 8) {
        relations.set(id, { ...existing, evidence: [...existing.evidence, documentEvidence(document.path, line)] })
      }
      return
    }
    if (relations.size >= cap) {
      truncated = true
      return
    }
    relations.set(id, {
      id,
      kind,
      from: documentId,
      to,
      provenance: 'observed',
      evidence: [documentEvidence(document.path, line)],
      ...(confidence ? { metadata: { confidence } } : {}),
    })
  }

  const pathCandidates = [...resolution.documents.keys(), ...resolution.modules.keys()]

  /** A path-shaped reference: a document link, a module mention, or an unambiguous near-miss. */
  const resolvePath = (candidate: string, line: number, linkKind: 'links-to' | 'mentions'): boolean => {
    const documentEntity = resolution.documents.get(candidate)
    if (documentEntity) {
      add(linkKind === 'links-to' ? 'links-to' : 'mentions', documentEntity, line)
      return true
    }
    const moduleEntity = resolution.modules.get(candidate)
    if (moduleEntity) {
      add('mentions', moduleEntity, line)
      return true
    }
    const fuzzy = resolveFuzzyReference(candidate, pathCandidates)
    if (!fuzzy) return false
    const target = resolution.documents.get(fuzzy.candidate) ?? resolution.modules.get(fuzzy.candidate)
    if (!target) return false
    add(resolution.documents.has(fuzzy.candidate) ? linkKind : 'mentions', target, line, 'fuzzy')
    return true
  }

  for (const link of document.links) {
    const resolved = resolveRelative(document.path, link.value)
    if (resolved) resolvePath(resolved, link.line, 'links-to')
    // Link text can name a path or package even when the href points elsewhere.
    if (link.text) resolveToken(link.text, link.line)
  }

  for (const token of document.codeTokens) resolveToken(token.value, token.line)

  /**
   * An inline code token or a link label. In order: a repository path, a package name, then an
   * exported symbol — and a symbol only when exactly one module exports it, because sending an
   * agent to one of two possible definitions is worse than sending it nowhere.
   */
  function resolveToken(raw: string, line: number): void {
    const value = raw.trim()
    if (!value || value.length > 256) return

    if (pathShaped(value)) {
      const direct = value.replace(/^\.\//, '')
      if (resolution.documents.has(direct) || resolution.modules.has(direct)) {
        resolvePath(direct, line, 'mentions')
        return
      }
    }

    const packageEntity = resolution.packages.get(value)
    if (packageEntity) {
      add('mentions', packageEntity, line)
      return
    }

    const modules = resolution.symbols.get(value)
    if (modules?.length === 1 && modules[0]) {
      add('mentions-symbol', modules[0], line)
      return
    }
    if (modules && modules.length > 1) {
      const evidence = ambiguous.get(value) ?? []
      if (evidence.length < 8) evidence.push(documentEvidence(document.path, line))
      ambiguous.set(value, evidence)
      return
    }

    if (pathShaped(value)) resolvePath(value.replace(/^\.\//, ''), line, 'mentions')
  }

  for (const [token, evidence] of [...ambiguous.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    notes.push({
      scope: `mentions-symbol:${document.path}:${token}`,
      reason: `"${token}" is exported by ${resolution.symbols.get(token)?.length ?? 0} modules; the reference is ambiguous and produced no relation.`,
      evidence,
    })
  }

  if (truncated) {
    notes.push({
      scope: `relations:${document.path}`,
      reason: `Document references more than ${cap} entities; the remainder was not recorded.`,
      evidence: [documentEvidence(document.path, 1)],
    })
  }

  return {
    relations: [...relations.values()].sort((a, b) => a.id.localeCompare(b.id)),
    notes,
    truncated,
  }
}
