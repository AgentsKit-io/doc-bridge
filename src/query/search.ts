import type { DocBridgeIndexV1 } from '../schemas/doc-bridge-index.js'
import type { Evidence } from '../schemas/knowledge.js'
import type { Confidence, RetrievalKind } from '../schemas/retrieval-index.js'
import { rankRetrieval, type RankExplanation, type RankedEntry } from '../retrieval/rank.js'
import { buildBm25Index, bm25Search, type Bm25Index, type Bm25Input } from '../retrieval/bm25.js'
import { isProjectedEntry } from '../index-builder/project-corpus.js'
import { foldAccents, hasSearchToken, searchTokens } from './text.js'

export type SearchMatch = {
  /** The record kind as consumers have always read it: `ownership`, `intent`, `change`, or the entry kind. */
  readonly type: string
  readonly id: string
  readonly path: string
  readonly summary?: string
  readonly score: number
  /** The snapshot entity this result stands for, when it stands for one. */
  readonly entityId?: string
  readonly kind?: RetrievalKind
  readonly provenance?: 'observed' | 'declared' | 'proposed'
  readonly confidence?: Confidence
  readonly evidence?: readonly Evidence[]
  readonly explain?: RankExplanation
}

export type SearchOptions = {
  /** Attach the matched terms and each scoring component to every result. Never changes the ranking. */
  readonly explain?: boolean
  /** The `--agent` prior. */
  readonly agent?: boolean
}

/**
 * Search the index.
 *
 * An index that carries the retrieval projection is ranked over it — every snapshot entity, with
 * evidence, provenance and confidence on each result. An index built before the projection
 * existed is ranked the way it always was, over its `knowledge[]` and lookup records, so an older
 * artifact keeps answering until it is rebuilt.
 */
export const searchIndex = (index: DocBridgeIndexV1, term: string, limit = 20, options: SearchOptions = {}): SearchMatch[] => {
  if (index.projection) return projectedSearch(index, term, limit, options)
  return legacySearch(index, term, limit)
}

/**
 * How a projected result presents itself to a reader of the old shape.
 *
 * An entry that stands for an ownership record is reported as that record — `type: ownership`,
 * the record's id, its agent document as path — because that is what a routing command expects
 * to receive and what `ak-docs query ownership <id>` accepts. Everything else is reported by its
 * entity id and its kind.
 */
type Presented = { readonly agentDocs: ReadonlyMap<string, string>; readonly curatedIds: ReadonlyMap<string, string> }

const presentation = (index: DocBridgeIndexV1, known: Presented, item: RankedEntry): Pick<SearchMatch, 'type' | 'id' | 'path'> => {
  const { entry } = item
  // The unit an ownership record names, or the agent document that record points at: one answer.
  const ownershipId = entry.ownershipId ?? (entry.kind === 'document' ? known.agentDocs.get(entry.path) : undefined)
  if (ownershipId) {
    const record = index.lookup?.ownership?.[ownershipId]
    return { type: 'ownership', id: ownershipId, path: record?.agentDoc ?? entry.path }
  }
  // A curated sidecar keeps the id its frontmatter gave it: that is the id `doc.get` and llms.txt know.
  const curatedId = entry.kind === 'document' ? known.curatedIds.get(entry.path) : undefined
  return { type: entry.kind, id: curatedId ?? entry.id, path: entry.path }
}

const projectedSearch = (index: DocBridgeIndexV1, term: string, limit: number, options: SearchOptions): SearchMatch[] => {
  const projection = index.projection
  if (!projection) return []
  const ranked = rankRetrieval(projection, term, { limit: Math.max(limit * 2, 40), ...(options.agent ? { agent: true } : {}) })
  /*
   * Which ownership record an agent document stands for. A record attached to a projected unit
   * is authoritative; a corpus-derived seed that points at the same document is the same unit
   * under another name and must not win the presentation over it.
   */
  const agentDocs = new Map<string, string>()
  for (const entry of projection.entries) {
    const record = entry.ownershipId ? index.lookup?.ownership?.[entry.ownershipId] : undefined
    if (record?.agentDoc && !agentDocs.has(record.agentDoc)) agentDocs.set(record.agentDoc, record.id)
  }
  for (const record of Object.values(index.lookup?.ownership ?? {})) {
    if (record.agentDoc && !agentDocs.has(record.agentDoc)) agentDocs.set(record.agentDoc, record.id)
  }
  const known: Presented = {
    agentDocs,
    curatedIds: new Map(index.knowledge.filter((entry) => !isProjectedEntry(entry)).map((entry) => [entry.path, entry.id])),
  }
  const byPath = new Map<string, SearchMatch>()

  for (const item of ranked) {
    const presented = presentation(index, known, item)
    const match: SearchMatch = {
      ...presented,
      ...(item.entry.summary ? { summary: item.entry.summary } : {}),
      score: item.score,
      entityId: item.entry.id,
      kind: item.entry.kind,
      provenance: item.entry.provenance,
      confidence: item.confidence,
      evidence: [{ source: evidenceSource(item.entry.kind), path: item.entry.path, contentHash: item.entry.contentHash }],
      ...(options.explain ? { explain: item.explanation } : {}),
    }
    const existing = byPath.get(match.path)
    if (!existing || match.score > existing.score || (match.score === existing.score && match.type === 'ownership' && existing.type !== 'ownership')) {
      byPath.set(match.path, match)
    }
  }

  return [...byPath.values()].sort((a, b) => b.score - a.score || a.id.localeCompare(b.id)).slice(0, limit)
}

const evidenceSource = (kind: RetrievalKind): Evidence['source'] =>
  kind === 'module' ? 'code' : kind === 'document' ? 'documentation' : kind === 'intent' || kind === 'change' ? 'configuration' : 'derived'

/*
 * ---------------------------------------------------------------------------------------------
 * The pre-projection ranking, kept verbatim for indexes that carry no projection.
 * ---------------------------------------------------------------------------------------------
 */

const BM25_SCALE = 50
const EXACT_IDENTITY = 240
const EXACT_SYMBOL = 200
const DIRECTORY_MATCH = 120
const TOKEN_ID = 120
const TOKEN_BASE = 100
const TOKEN_SYMBOL = 90
const SHORT_ID_BONUS = 40
const CURATED_FACTOR = 1.15
const OWNERSHIP_FACTOR = 1.1
const ROUTE_TITLE_FACTOR = 1.6
const CHANGE_INTENT_FACTOR = 1.4
const CHANGE_WITHOUT_INTENT_FACTOR = 0.15
const KIND_FACTOR = 1.15
const PARTIAL_ID_FACTOR = 1.2
const RELEVANCE_FLOOR = 1 / 3

const LEGACY_WEIGHTS = { id: 8, symbols: 7, title: 6, path: 4, tags: 3, description: 2, body: 1 } as const

const PACKAGE_INTENT =
  /\b(package|module|pkg|edit|change|where|owns?|ownership|handoff|start)\b|\b(?:pacote|pacotes|modulo|modulos|onde|quem|dono|donos|responsavel|responsaveis|comec\w*|inici\w*|edit\w*|mud\w*|alter\w*)/i
const CHANGE_INTENT =
  /\b(change|edit|modify|update|fix|migrate|replace)\b|\b(?:alter\w*|mud\w*|modific\w*|edit\w*|atualiz\w*|corrig\w*|migr\w*|substitu\w*|troc\w*)/i
const SYMBOL_SHAPED = /[a-z0-9][A-Z]|^[A-Za-z_$][A-Za-z0-9_$]{2,}$/
const PATH_SHAPED = /\/|\.[A-Za-z]{1,4}$/

type CandidateFields = {
  readonly id: string
  readonly title: string
  readonly path: string
  readonly description?: string
  readonly body?: string
  readonly tags?: readonly string[]
  readonly symbols?: readonly string[]
}

type Candidate = {
  readonly ref: string
  readonly match: Omit<SearchMatch, 'score'>
  readonly fields: CandidateFields
  readonly entryType?: string
}

const pathBase = (path: string): string => foldAccents((path.split('/').pop() ?? '').replace(/\.[A-Za-z0-9]+$/, '').toLowerCase())

const preferOwnership = (term: string): boolean => PACKAGE_INTENT.test(term) || /^(where|how).*(edit|change|package|module)/i.test(term)

const titleCoversQuery = (title: string, tokens: readonly string[]): boolean =>
  tokens.length > 1 && tokens.every((token) => hasSearchToken(foldAccents(title.toLowerCase()), token))

const identityBoost = (fields: CandidateFields, tokens: readonly string[], term: string): number => {
  const idLower = foldAccents(fields.id.toLowerCase())
  const pathLower = foldAccents(fields.path.toLowerCase())
  const termLower = foldAccents(term.toLowerCase().trim())
  const base = pathBase(fields.path)
  const symbols = new Set((fields.symbols ?? []).map((symbol) => foldAccents(symbol.toLowerCase())))
  let boost = 0
  if (idLower === termLower || base === termLower || pathLower === termLower) boost += EXACT_IDENTITY
  if (symbols.has(termLower)) boost += EXACT_SYMBOL
  if (termLower && (pathLower.startsWith(`${termLower}/`) || pathLower.includes(`/${termLower}/`))) boost += DIRECTORY_MATCH
  for (const token of tokens) {
    if (idLower === token) boost += TOKEN_ID
    if (base === token) boost += TOKEN_BASE
    if (symbols.has(token)) boost += TOKEN_SYMBOL
  }
  if (tokens.includes(idLower)) boost += Math.max(0, SHORT_ID_BONUS - idLower.length)
  return boost
}

const candidateRef = (kind: string, position: number, id: string): string => `${kind}#${position}#${id}`

const knowledgeCandidates = (index: DocBridgeIndexV1): Candidate[] =>
  index.knowledge.map((entry, position) => ({
    ref: candidateRef('knowledge', position, entry.id),
    match: { type: 'knowledge', id: entry.id, path: entry.path, ...(entry.description ? { summary: entry.description } : {}) },
    fields: {
      id: entry.id,
      title: entry.title,
      path: entry.path,
      ...(entry.description ? { description: entry.description } : {}),
      ...(entry.body ? { body: entry.body } : {}),
      ...(entry.tags ? { tags: entry.tags } : {}),
      ...(entry.symbols ? { symbols: entry.symbols } : {}),
    },
    entryType: entry.type,
  }))

const ownershipCandidates = (index: DocBridgeIndexV1): Candidate[] =>
  Object.entries(index.lookup?.ownership ?? {}).map(([id, owner], position) => {
    const agentDoc = owner.agentDoc ? index.knowledge.find((entry) => entry.path === owner.agentDoc) : undefined
    const description = owner.purpose ?? agentDoc?.description
    return {
      ref: candidateRef('ownership', position, id),
      match: { type: 'ownership', id, path: owner.agentDoc ?? owner.path, ...(owner.purpose ? { summary: owner.purpose } : {}) },
      fields: {
        id,
        title: agentDoc?.title ?? id,
        path: [owner.path, owner.agentDoc, owner.humanDoc].filter(Boolean).join(' '),
        ...(description ? { description } : {}),
        ...(agentDoc?.body ? { body: agentDoc.body } : {}),
        tags: [owner.group, owner.layer, 'ownership'].filter((value): value is string => Boolean(value)),
      },
      entryType: 'ownership',
    }
  })

const intentCandidates = (index: DocBridgeIndexV1): Candidate[] =>
  Object.values(index.lookup?.intents ?? {}).map((intent, position) => ({
    ref: candidateRef('intent', position, intent.id),
    match: { type: 'intent', id: intent.id, path: intent.paths[0] ?? '', summary: intent.title },
    fields: { id: intent.id, title: intent.title, path: intent.paths.join(' '), tags: ['intent'] },
    entryType: 'intent',
  }))

const changeCandidates = (index: DocBridgeIndexV1): Candidate[] =>
  Object.values(index.lookup?.changes ?? {}).map((change, position) => ({
    ref: candidateRef('change', position, change.id),
    match: { type: 'change', id: change.id, path: change.startHere, summary: change.title },
    fields: { id: change.id, title: change.title, path: change.startHere, tags: ['change', ...(change.relatedPackages ?? [])] },
    entryType: 'change',
  }))

const partialIdMatch = (id: string, tokens: readonly string[]): boolean => {
  const idLower = foldAccents(id.toLowerCase())
  return tokens.some(
    (token) => idLower !== token && (idLower.startsWith(`${token}-`) || idLower.endsWith(`-${token}`) || (idLower.includes(token) && idLower.length <= token.length + 4)),
  )
}

const priorFactor = (candidate: Candidate, tokens: readonly string[], term: string, wantOwnership: boolean): number => {
  const type = candidate.match.type
  const trimmed = term.trim()
  const covered = titleCoversQuery(candidate.fields.title, tokens)
  let factor = 1
  if (!isProjectedEntry({ type: candidate.entryType ?? '' })) factor *= CURATED_FACTOR
  if (partialIdMatch(candidate.fields.id, tokens)) factor *= PARTIAL_ID_FACTOR
  if (type === 'ownership' && wantOwnership) factor *= OWNERSHIP_FACTOR
  if ((type === 'intent' || type === 'change') && covered) factor *= ROUTE_TITLE_FACTOR
  if (type === 'change') factor *= CHANGE_INTENT.test(term) ? CHANGE_INTENT_FACTOR : covered ? 1 : CHANGE_WITHOUT_INTENT_FACTOR
  const oneWord = !/\s/.test(trimmed)
  const looksLikeSymbol = oneWord && SYMBOL_SHAPED.test(trimmed)
  const looksLikePath = oneWord && PATH_SHAPED.test(trimmed)
  if ((looksLikeSymbol || looksLikePath) && candidate.entryType === 'module') factor *= KIND_FACTOR
  if (!looksLikeSymbol && !looksLikePath && tokens.length >= 3 && candidate.entryType === 'document') factor *= KIND_FACTOR
  return factor
}

type PreparedIndex = { readonly byRef: ReadonlyMap<string, Candidate>; readonly bm25: Bm25Index }

const prepared = new WeakMap<DocBridgeIndexV1, PreparedIndex>()

const prepare = (index: DocBridgeIndexV1): PreparedIndex | undefined => {
  const cached = prepared.get(index)
  if (cached) return cached
  const candidates = [...knowledgeCandidates(index), ...ownershipCandidates(index), ...intentCandidates(index), ...changeCandidates(index)]
  if (!candidates.length) return undefined
  const inputs: Bm25Input[] = candidates.map((candidate) => ({ ref: candidate.ref, fields: candidate.fields }))
  const weights = { ...LEGACY_WEIGHTS, ...Object.fromEntries(Object.entries(index.retrieval?.weights ?? {}).filter(([field]) => field in LEGACY_WEIGHTS)) }
  const value: PreparedIndex = {
    byRef: new Map(candidates.map((candidate) => [candidate.ref, candidate])),
    bm25: buildBm25Index(inputs, weights, index.retrieval?.params ?? {}),
  }
  prepared.set(index, value)
  return value
}

const legacySearch = (index: DocBridgeIndexV1, term: string, limit: number): SearchMatch[] => {
  const tokens = searchTokens(term)
  if (!tokens.length) return []
  const ready = prepare(index)
  if (!ready) return []
  const { byRef, bm25 } = ready
  const hits = bm25Search(bm25, tokens)
  const wantOwnership = preferOwnership(term)
  const byPath = new Map<string, SearchMatch>()

  for (const hit of hits) {
    const candidate = byRef.get(hit.ref)
    if (!candidate) continue
    const score = hit.score * BM25_SCALE * priorFactor(candidate, tokens, term, wantOwnership) + identityBoost(candidate.fields, tokens, term)
    const match: SearchMatch = { ...candidate.match, score }
    const existing = byPath.get(match.path)
    if (!existing || match.score > existing.score || (match.score === existing.score && match.type === 'ownership' && existing.type !== 'ownership')) {
      byPath.set(match.path, match)
    }
  }

  const ranked = [...byPath.values()]
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score
      const aExact = tokens.includes(foldAccents(a.id.toLowerCase())) ? 1 : 0
      const bExact = tokens.includes(foldAccents(b.id.toLowerCase())) ? 1 : 0
      if (bExact !== aExact) return bExact - aExact
      if (a.type === 'ownership' && b.type !== 'ownership') return -1
      if (b.type === 'ownership' && a.type !== 'ownership') return 1
      return a.id.localeCompare(b.id)
    })
    .slice(0, limit)

  const best = ranked[0]?.score ?? 0
  return best > 0 ? ranked.filter((match) => match.score >= best * RELEVANCE_FLOOR) : ranked
}
