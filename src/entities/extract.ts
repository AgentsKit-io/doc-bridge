import { createHash } from 'node:crypto'
// cross-platform-ignore: synchronous native git, no shell/.cmd shim or unbounded arguments; matches local discovery
import { execFileSync } from 'node:child_process'
import { normalizeEol, splitLines } from '@agentskit/cross-platform'
import { posix } from 'node:path'
import { toString } from 'mdast-util-to-string'
import type { RootContent, ListItem } from 'mdast'
import remarkParse from 'remark-parse'
import remarkFrontmatter from 'remark-frontmatter'
import { unified } from 'unified'
import { parseDocument } from 'yaml'
import { entityId } from '../discovery/identity.js'
import { parseMarkdownDocument } from '../discovery/markdown.js'
import { KnowledgeEntitiesV1Schema, type KnowledgeEntitiesV1, type KnowledgeEntityV1, type KnowledgeEntityLinkV1 } from '../schemas/knowledge-entity.js'
import type { DiscoverySnapshotV1 } from '../schemas/knowledge.js'
import type { DocBridgeConfigV1 } from '../config/schema.js'
import { isServiceProfile } from '../execution/profile.js'

export type ExtractKnowledgeEntitiesOptions = {
  snapshot: DiscoverySnapshotV1
  documents: ReadonlyMap<string, string>
  /** Omitted for captured/storage-backed inputs: never read an unrelated local checkout. */
  gitRoot?: string
  window?: NonNullable<NonNullable<DocBridgeConfigV1['index']>['knowledgeEntities']>
}
const MAX_ENTITIES = 10_000
const MAX_REGION_BYTES = 16_384
const MAX_DOCUMENT_BYTES = 4 * 1024 * 1024
const MAX_CORPUS_BYTES = 64 * 1024 * 1024
const parser = unified().use(remarkParse).use(remarkFrontmatter, ['yaml'])
const sha256 = (value: string) => createHash('sha256').update(value).digest('hex')
const relativePath = (value: string) => value.length <= 512 && !value.startsWith('/') && !value.includes('\\') && !value.includes('\0') && !value.split('/').includes('..')

/** Observations only: exact names and cited paths, without fuzzy owner selection. */
export const extractKnowledgeEntities = (options: ExtractKnowledgeEntitiesOptions): KnowledgeEntitiesV1 => {
  const entities = new Map<string, KnowledgeEntityV1>()
  const reasons = new Set<string>()
  const code = new Map<string, string[]>()
  const symbols = new Map<string, string[]>()
  const declared = new Map<string, string[]>()
  const forwarded = new Map<string, string[]>()
  for (const fact of options.snapshot.entities) {
    if (fact.kind === 'symbol') for (const name of [fact.name, ...(fact.aliases ?? [])]) {
      symbols.set(name, [...(symbols.get(name) ?? []), fact.id])
    }
    if (fact.kind === 'module' && Array.isArray(fact.metadata?.exports)) {
      const reexports = Array.isArray(fact.metadata.reexports) ? fact.metadata.reexports : []
      for (const name of fact.metadata.exports) if (typeof name === 'string' && name !== '*' && name !== 'default') {
        const owners = reexports.includes(name) ? forwarded : declared
        owners.set(name, [...(owners.get(name) ?? []), fact.id])
      }
    }
    if (!['document', 'external'].includes(fact.kind)) for (const path of new Set([fact.path, ...fact.evidence.map(item => item.path)].filter((value): value is string => Boolean(value)))) {
      code.set(path, [...(code.get(path) ?? []), fact.id])
    }
  }
  for (const [name, owners] of [...forwarded, ...declared]) if (!symbols.has(name)) symbols.set(name, declared.get(name) ?? owners)
  if (options.snapshot.entities.some(entity => entity.kind === 'document' && entity.path && !options.documents.has(entity.path))) reasons.add('unread-document')
  const bounded = <T>(items: T[], cap: number, reason: string): T[] => {
    if (items.length > cap) reasons.add(reason)
    return items.slice(0, cap)
  }
  const unique = <T>(values: T[]): T[] => [...new Map(values.map(value => [JSON.stringify(value), value])).values()]
  const add = (entity: KnowledgeEntityV1): void => {
    const prior = entities.get(entity.id)
    if (!prior && entities.size >= MAX_ENTITIES) { reasons.add('entity-limit'); return }
    if (prior) {
      entity = { ...prior, aliases: bounded(unique([...prior.aliases, ...entity.aliases]).sort(), 32, 'alias-limit'), evidence: bounded(unique([...prior.evidence, ...entity.evidence]), 64, 'evidence-limit'), links: bounded(unique([...prior.links, ...entity.links]), 64, 'link-limit') }
    }
    entities.set(entity.id, entity)
  }
  const pathLinks = (paths: string[]): KnowledgeEntityLinkV1[] => bounded([...new Set(paths)].sort().flatMap(path => [
    { kind: 'affected-path' as const, target: path },
    ...(code.get(path) ?? []).map(target => ({ kind: 'affected-fact' as const, target })),
  ]), 64, 'link-limit')
  let bytes = 0
  let documents = 0
  const adrIds = new Map<string, string>()
  const supersessions: { id: string; kind: 'supersedes' | 'superseded-by'; path: string }[] = []
  for (const [path, content] of [...options.documents].sort(([a], [b]) => a.localeCompare(b))) {
    if (entities.size >= MAX_ENTITIES) { reasons.add('entity-limit'); break }
    if (++documents > 10_000 || bytes + Buffer.byteLength(content) > MAX_CORPUS_BYTES) { reasons.add('document-budget'); break }
    bytes += Buffer.byteLength(content)
    if (!relativePath(path) || Buffer.byteLength(content) > MAX_DOCUMENT_BYTES) { reasons.add('document-limit'); continue }
    const tree = parser.parse(content)
    const lineOffsets = [0]
    for (const match of content.matchAll(/\r\n|\r|\n/g)) lineOffsets.push(match.index + match[0].length)
    const children = bounded(tree.children, 8192, 'node-limit')
    const markdown = parseMarkdownDocument(path, normalizeEol(content))
    const references = bounded([...markdown.links, ...markdown.codeTokens], 4096, 'reference-limit')
    const yaml = tree.children.find(node => node.type === 'yaml')
    const parsed = yaml?.type === 'yaml' ? parseDocument(yaml.value) : undefined
    let frontmatter: Record<string, unknown> = {}
    try {
      const value: unknown = parsed?.toJS({ maxAliasCount: 0 })
      if (!parsed?.errors.length && value && typeof value === 'object' && !Array.isArray(value)) frontmatter = value as Record<string, unknown>
      if (parsed?.errors.length) reasons.add('invalid-frontmatter')
    } catch { reasons.add('invalid-frontmatter') }
    for (const node of children) {
      if (!['paragraph', 'list'].includes(node.type) || (node.position?.start.line ?? 0) > 40) continue
      for (const line of splitLines(toString(node))) {
        const declaration = /^(?:\*\*)?(Status|Date|Supersedes|Superseded-by)(?:\*\*)?:\s+(.+)$/i.exec(line)
        if (declaration && frontmatter[declaration[1]!.toLowerCase()] === undefined) frontmatter[declaration[1]!.toLowerCase()] = declaration[2]!.trim()
      }
    }
    const string = (key: string, max = 128): string | undefined => {
      const value = frontmatter[key]
      if (typeof value !== 'string' || !value.length) return
      if (value.length > max) reasons.add('metadata-limit')
      return value.slice(0, max)
    }
    const values = (key: string): string[] => (Array.isArray(frontmatter[key]) ? frontmatter[key] : typeof frontmatter[key] === 'string' ? [frontmatter[key]] : []).filter((value): value is string => typeof value === 'string' && value.length > 0)
    const headings = bounded(children.filter((node): node is Extract<RootContent, { type: 'heading' }> => node.type === 'heading'), 128, 'heading-limit')
    const title = string('title', 256) ?? (headings[0] ? toString(headings[0]) : posix.basename(path, posix.extname(path)))
    const isAdr = /(?:^|\/)(?:adrs?|decisions)(?:\/|[-_.])/i.test(path) || /^(?:adr|decision)$/i.test(string('type') ?? '')
    const glossary = /(?:glossary|definitions)/i.test(path) || /^(?:glossary|definitions)$/i.test(string('type') ?? '')
    const conceptDocument = string('type') === 'concept' || (!isAdr && !glossary && !/changelog/i.test(path) && values('aliases').length > 0)
    const changelog = /(?:^|\/)changelog(?:\.[^/]*)?$/i.test(path)
    const excluded = (node: RootContent | ListItem): boolean => !node.position || markdown.generatedRegions.some(region => node.position!.start.line <= region.lineEnd && node.position!.end.line >= region.lineStart)
    const region = (start: RootContent | ListItem, end?: RootContent | ListItem) => {
      const lineStart = start.position!.start.line
      const lineEnd = end ? Math.max(lineStart, end.position!.start.line - 1) : lineOffsets.length
      return { kind: 'document-region' as const, path, lineStart, lineEnd, regionHash: sha256(content.slice(lineOffsets[lineStart - 1], lineOffsets[lineEnd] ?? content.length)) }
    }
    const emit = (kind: KnowledgeEntityV1['kind'], name: string, start: RootContent | ListItem, end?: RootContent | ListItem, aliases: string[] = [], discriminator = ''): string | undefined => {
      if (name.length > 256) { reasons.add('name-limit'); return }
      if (!name.trim() || excluded(start)) return
      const evidence = region(start, end)
      const raw = content.slice(lineOffsets[evidence.lineStart - 1], lineOffsets[evidence.lineEnd] ?? content.length)
      if (markdown.generatedRegions.some(region => evidence.lineStart <= region.lineEnd && evidence.lineEnd >= region.lineStart)) { reasons.add('generated-region'); return }
      if (Buffer.byteLength(raw) > MAX_REGION_BYTES) { reasons.add('region-limit'); return }
      const id = entityId(`knowledge-${kind}`, kind === 'concept' ? name : `${path}:${name}${discriminator}`)
      if (!entities.has(id) && entities.size >= MAX_ENTITIES) { reasons.add('entity-limit'); return }
      const tokens = references.filter(token => token.line >= evidence.lineStart && token.line <= evidence.lineEnd)
      const citedPaths = tokens.flatMap(token => {
        const value = token.value.split('#')[0]!.replace(/:\d+(?:[-–]\d+)?$/, '')
        const resolved = posix.normalize(posix.join(posix.dirname(path), value))
        return code.has(value) ? [value] : code.has(resolved) ? [resolved] : []
      })
      const links = pathLinks(citedPaths)
      for (const token of tokens) {
        const ids = [...new Set(symbols.get(token.value) ?? [])]
        if (ids.length === 1) links.push({ kind: 'affected-fact', target: ids[0]!, symbol: token.value })
        else if (ids.length > 1) reasons.add('ambiguous-symbol')
      }
      if (aliases.some(value => value.length > 256)) reasons.add('alias-limit')
      const names = bounded([...new Set(aliases)].filter(value => value.length <= 256).sort(), 32, 'alias-limit')
      if (kind === 'concept') {
        const matches = [...new Set([name, ...names].flatMap(value => symbols.get(value) ?? []))]
        if (matches.length === 1) {
          const symbol = [name, ...names].find(value => symbols.get(value)?.includes(matches[0]!))!
          links.push({ kind: 'defines-symbol', target: matches[0]!, symbol })
        }
        else if (matches.length > 1) reasons.add('ambiguous-symbol')
      }
      const linkedFacts = links.filter(link => link.kind === 'defines-symbol' || link.kind === 'affected-fact').map(link => ({ kind: 'fact' as const, factId: link.target }))
      add({ schemaVersion: 1, id, kind, name, aliases: names, evidence: bounded(unique([evidence, ...linkedFacts]), 64, 'evidence-limit'), links: bounded(unique(links), 64, 'link-limit'), ...(kind === 'decision' ? { ...(string('status') ? { status: string('status') } : {}), ...(string('date') ? { date: string('date') } : {}) } : {}) })
      return id
    }
    if (conceptDocument && children[0]) emit('concept', title, children[0], undefined, values('aliases'))
    if (glossary && values('aliases').length) reasons.add('unbound-glossary-aliases')
    if (isAdr && children[0]) {
      const id = emit('decision', title, tree.children[0]!, undefined)
      if (id) {
        adrIds.set(path, id)
        for (const kind of ['supersedes', 'superseded-by'] as const) for (const target of values(kind)) {
          const resolved = posix.normalize(posix.join(posix.dirname(path), target))
          if (relativePath(resolved)) supersessions.push({ id, kind, path: resolved })
        }
      }
    }
    const occurrences = new Map<string, number>()
    for (const heading of headings) {
      if (excluded(heading)) continue
      const name = toString(heading)
      const end = headings.find(next => next.position!.start.offset! > heading.position!.start.offset! && next.depth <= heading.depth)
      const occurrence = occurrences.get(name) ?? 0
      occurrences.set(name, occurrence + 1)
      if (!isAdr && /^(?:decision|decisions)(?:\s|:|$)/i.test(name)) emit('decision', name, heading, end, [], `:${occurrence}`)
      if (glossary && (heading.depth > (headings[0]?.depth ?? 0) || !/\b(?:glossary|definitions)\b/i.test(name))) emit('concept', name, heading, end)
    }
    for (let index = 0; index < children.length; index++) {
      const node = children[index]!
      if (changelog && node.type === 'list' && !excluded(node)) {
        const release = headings.filter(heading => heading.depth === 2 && heading.position!.start.offset! < node.position!.start.offset!).at(-1)
        if (release) for (let itemIndex = 0; itemIndex < node.children.length; itemIndex++) {
          const item = node.children[itemIndex]!
          const name = toString(item).slice(0, 256)
          emit('change', name, item, node.children[itemIndex + 1] ?? tree.children[index + 1], [], `:${toString(release)}`)
        }
      }
      if (node.type !== 'paragraph' || excluded(node)) continue
      const raw = content.slice(node.position!.start.offset!, node.position!.end.offset!)
      let offset = node.position!.start.offset!
      let line = node.position!.start.line
      for (const value of raw.split(/(?<=\n)|(?<=\r)(?!\n)/)) {
        const definition = /^(?:\*\*([^*\n]+)\*\*\s*:\s+|([^\n]+?)\s+[—–]\s+)\S/.exec(value)
        if (definition) {
          const start: RootContent = { type: 'paragraph', children: [], position: { start: { line, column: 1, offset }, end: { line, column: value.length + 1, offset: offset + value.length } } }
          const end: RootContent = { type: 'paragraph', children: [], position: { start: { line: line + 1, column: 1, offset: offset + value.length }, end: { line: line + 1, column: 1, offset: offset + value.length } } }
          emit('concept', (definition[1] ?? definition[2])!.trim(), start, end)
        }
        offset += value.length
        line++
      }
      const definition = /^([^\r\n]+)(?:\r\n|\r|\n)\s*:\s+(\S[\s\S]*)$/.exec(raw)
      if (!definition) continue
      const name = definition[1]!.trim()
      emit('concept', name, node, tree.children[index + 1])
    }
  }
  for (const item of supersessions) {
    const target = adrIds.get(item.path)
    if (target) {
      const entity = entities.get(item.id)!
      entity.links = bounded(unique([...entity.links, { kind: item.kind, target }]), 64, 'link-limit')
    } else reasons.add('unresolved-supersession')
  }
  const documentReasons = [...reasons].sort()
  const coverage: KnowledgeEntitiesV1['coverage'] = [{ analyzer: 'knowledge-entities', analyzerVersion: '1.0.0', scope: 'documents', status: documentReasons.length ? 'partial' : 'complete', ...(documentReasons.length ? { reason: documentReasons.join(', ') } : {}) }]
  if (options.gitRoot && !isServiceProfile(options.snapshot)) {
    const git = (args: string[]): string => execFileSync('git', ['--no-pager', '-c', 'core.quotepath=false', '-c', 'protocol.allow=never', ...args], { cwd: options.gitRoot, env: { ...process.env, GIT_ALLOW_PROTOCOL: '', GIT_NO_LAZY_FETCH: '1', GIT_TERMINAL_PROMPT: '0' }, encoding: 'utf8', timeout: 10_000, maxBuffer: 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'] })
    try {
      const count = options.window?.maxCommits ?? 50
      if (!Number.isInteger(count) || count < 1 || count > 200) throw new Error('Invalid history window')
      const tag = options.window?.sinceTag
      if (tag && (!/^[A-Za-z0-9][A-Za-z0-9._/-]*$/.test(tag) || tag.includes('..'))) throw new Error('Invalid tag')
      const base = tag ? git(['rev-parse', '--verify', `refs/tags/${tag}^{commit}`]).trim() : undefined
      if (base) git(['merge-base', '--is-ancestor', base, 'HEAD'])
      const hashes = splitLines(git(['log', '--first-parent', `--max-count=${count + 1}`, '--format=%H', ...(base ? [`${base}..HEAD`] : ['HEAD']), '--']).trim()).filter(Boolean)
      const deadline = Date.now() + 10_000
      let truncated = hashes.length > count
      for (const sha of hashes.slice(0, count)) {
        if (Date.now() > deadline || entities.size >= MAX_ENTITIES) { truncated = true; break }
        const output = git(['show', '-s', '--format=%s%x00%B', sha, '--']).split('\0')
        const name = output[0]!.trim().slice(0, 256)
        const body = output[1] ?? ''
        const changedPaths = git(['diff-tree', '--first-parent', '-m', '--root', '-r', '--no-renames', '--no-commit-id', '--name-only', '-z', sha, '--']).split('\0').filter(Boolean)
        const paths = changedPaths.filter(relativePath)
        if (paths.length !== changedPaths.length) reasons.add('path-limit')
        const match = /^([a-zA-Z][a-zA-Z0-9-]*)(?:\(([^)]+)\))?(!)?:\s+/.exec(name)
        const links = pathLinks(paths)
        add({ schemaVersion: 1, id: entityId('knowledge-change', sha), kind: 'change', name: name || sha, aliases: [], evidence: [{ kind: 'commit', sha }, ...links.filter(link => link.kind === 'affected-fact').slice(0, 63).map(link => ({ kind: 'fact' as const, factId: link.target }))], links, ...(match ? { conventional: { type: match[1]!.slice(0, 128), ...(match[2] ? { scope: match[2].slice(0, 128) } : {}), breaking: Boolean(match[3]) || /^BREAKING[ -]CHANGE:/m.test(body) } } : {}) })
      }
      coverage.push({ analyzer: 'knowledge-entities', analyzerVersion: '1.0.0', scope: 'git:first-parent', status: truncated ? 'partial' : 'complete', reason: truncated ? 'History window or extraction budget reached; older commits not analyzed.' : 'Complete within the configured history window.' })
    } catch {
      coverage.push({ analyzer: 'knowledge-entities', analyzerVersion: '1.0.0', scope: 'git:first-parent', status: 'not-analyzed', reason: 'History unavailable, invalid tag/window, or git command budget exceeded.' })
    }
  } else coverage.push({ analyzer: 'knowledge-entities', analyzerVersion: '1.0.0', scope: 'git:first-parent', status: 'not-analyzed', reason: 'No local history source supplied.' })
  if (reasons.size > documentReasons.length) coverage.push({ analyzer: 'knowledge-entities', scope: 'links', status: 'partial', reason: [...reasons].sort().join(', ') })
  return KnowledgeEntitiesV1Schema.parse({ schemaVersion: 1, entities: [...entities.values()].sort((a, b) => a.id.localeCompare(b.id)).map(entity => ({ ...entity, evidence: entity.evidence.sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b))), links: [...new Map(entity.links.map(link => [JSON.stringify(link), link])).values()].sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b))) })), coverage })
}
