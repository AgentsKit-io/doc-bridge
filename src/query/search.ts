import type { DocBridgeIndexV1 } from '../schemas/doc-bridge-index.js'
import { buildBm25Index, bm25Search, type Bm25Index, type Bm25Input } from '../retrieval/bm25.js'
import { resolveSearchParams, resolveSearchWeights } from '../retrieval/weights.js'
import { isProjectedEntry } from '../index-builder/project-corpus.js'
import { foldAccents, hasSearchToken, searchTokens } from './text.js'

export type SearchMatch = {
  readonly type: string
  readonly id: string
  readonly path: string
  readonly summary?: string
  readonly score: number
}

/**
 * Ranking is BM25 over weighted fields, plus boosts for identity and a prior on result kind.
 *
 * The split matters. BM25 is the evidence: it knows that a term appearing in every record is
 * worth almost nothing and that a short title is a stronger signal than a long body. The boosts
 * are the identity rules an agent depends on — typing an exported symbol, a file path or a
 * package name should land on that exact thing, not on the document that mentions it most. The
 * priors are the old intent heuristics, kept as a nudge toward a kind of result rather than a
 * filter that could hide the right answer.
 */

/** Turns a BM25 score into the same magnitude as the identity boosts below. */
const BM25_SCALE = 50

const EXACT_IDENTITY = 240
const EXACT_SYMBOL = 200
const DIRECTORY_MATCH = 120
const TOKEN_ID = 120
const TOKEN_BASE = 100
const TOKEN_SYMBOL = 90
const SHORT_ID_BONUS = 40

/**
 * Priors multiply the lexical evidence rather than adding to it.
 *
 * An additive nudge behaves differently in a four-record repository than in a four-thousand-record
 * one: BM25 scores are small when there is little to discriminate, so a flat bonus would decide
 * the ranking on its own and a curated sidecar would outrank the document that actually answers
 * the query. As a multiplier a prior can only amplify evidence that already exists — a record
 * nothing matched stays unranked however well it is favoured.
 */
const CURATED_FACTOR = 1.15
const OWNERSHIP_FACTOR = 1.1
const ROUTE_TITLE_FACTOR = 1.6
const CHANGE_INTENT_FACTOR = 1.4
/**
 * A change route answers "I am about to change X", not "what is X". Without that intent in the
 * query it used to be filtered out entirely; demoting it instead keeps it reachable when nothing
 * better matches, which is what a prior means.
 */
const CHANGE_WITHOUT_INTENT_FACTOR = 0.15
const KIND_FACTOR = 1.15
/**
 * The query is part of a record's id without being it — `schema` against `zod-schema`. Real
 * evidence, but not identity, so it amplifies the lexical score instead of being added to it: a
 * flat bonus for a partial id match is enough to outrank a whole matching document in a small
 * repository, which is exactly the kind of wrong answer this ranking exists to stop.
 */
const PARTIAL_ID_FACTOR = 1.2

const RELEVANCE_FLOOR = 1 / 3

/*
 * Query-shape heuristics, in both languages the lexicon supports. An English-only pattern would
 * mean a Portuguese question is ranked by different rules than the same question in English —
 * routing silently switched off for half the corpus this library exists to serve. The Portuguese
 * alternatives are stems with an open ending, since the verb carries the tense.
 */
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

const pathBase = (path: string): string =>
  foldAccents((path.split('/').pop() ?? '').replace(/\.[A-Za-z0-9]+$/, '').toLowerCase())

const preferOwnership = (term: string): boolean =>
  PACKAGE_INTENT.test(term) || /^(where|how).*(edit|change|package|module)/i.test(term)

/** Every query token appears in a route's title: the route is about exactly this. */
const titleCoversQuery = (title: string, tokens: readonly string[]): boolean =>
  tokens.length > 1 && tokens.every((token) => hasSearchToken(foldAccents(title.toLowerCase()), token))

/**
 * Exact-identity boosts: the query names the thing rather than describing it.
 *
 * A projected module is identified by its path and its exported symbols, a package by its id, a
 * document by its filename — so all three are checked, and the whole query string is checked
 * before its tokens so `src/mcp/server.ts` beats every record that merely mentions `mcp`.
 */
const identityBoost = (fields: CandidateFields, tokens: readonly string[], term: string): number => {
  const idLower = foldAccents(fields.id.toLowerCase())
  const pathLower = foldAccents(fields.path.toLowerCase())
  const termLower = foldAccents(term.toLowerCase().trim())
  const base = pathBase(fields.path)
  const symbols = new Set((fields.symbols ?? []).map((symbol) => foldAccents(symbol.toLowerCase())))
  let boost = 0

  if (idLower === termLower || base === termLower || pathLower === termLower) boost += EXACT_IDENTITY
  if (symbols.has(termLower)) boost += EXACT_SYMBOL
  if (termLower && (pathLower.startsWith(`${termLower}/`) || pathLower.includes(`/${termLower}/`))) {
    boost += DIRECTORY_MATCH
  }

  for (const token of tokens) {
    if (idLower === token) boost += TOKEN_ID
    if (base === token) boost += TOKEN_BASE
    if (symbols.has(token)) boost += TOKEN_SYMBOL
  }

  // Prefer a short id when the query is the id: "core" should mean the core package.
  if (tokens.includes(idLower)) boost += Math.max(0, SHORT_ID_BONUS - idLower.length)

  return boost
}

/**
 * A candidate's `ref` carries its position, so two records with the same id — a curated sidecar
 * and the document projected from the same area, say — can never collapse into one posting.
 */
const candidateRef = (kind: string, position: number, id: string): string => `${kind}#${position}#${id}`

const knowledgeCandidates = (index: DocBridgeIndexV1): Candidate[] =>
  index.knowledge.map((entry, position) => ({
    ref: candidateRef('knowledge', position, entry.id),
    match: {
      type: 'knowledge',
      id: entry.id,
      path: entry.path,
      ...(entry.description ? { summary: entry.description } : {}),
    },
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
    const agentDoc = owner.agentDoc
      ? index.knowledge.find((entry) => entry.path === owner.agentDoc)
      : undefined
    const path = owner.agentDoc ?? owner.path
    const description = owner.purpose ?? agentDoc?.description
    return {
      ref: candidateRef('ownership', position, id),
      match: {
        type: 'ownership',
        id,
        path,
        ...(owner.purpose ? { summary: owner.purpose } : {}),
      },
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
    fields: {
      id: change.id,
      title: change.title,
      path: change.startHere,
      tags: ['change', ...(change.relatedPackages ?? [])],
    },
    entryType: 'change',
  }))

/** The query names part of an id without naming the id: `schema` against `zod-schema`. */
const partialIdMatch = (id: string, tokens: readonly string[]): boolean => {
  const idLower = foldAccents(id.toLowerCase())
  return tokens.some(
    (token) =>
      idLower !== token &&
      (idLower.startsWith(`${token}-`) ||
        idLower.endsWith(`-${token}`) ||
        (idLower.includes(token) && idLower.length <= token.length + 4)),
  )
}

/**
 * A nudge toward the kind of record the query shape asks for. A prior, not a filter: a
 * misclassified query loses ranking, never the right answer.
 */
const priorFactor = (candidate: Candidate, tokens: readonly string[], term: string, wantOwnership: boolean): number => {
  const type = candidate.match.type
  const trimmed = term.trim()
  const covered = titleCoversQuery(candidate.fields.title, tokens)
  let factor = 1

  if (!isProjectedEntry({ type: candidate.entryType ?? '' })) factor *= CURATED_FACTOR
  if (partialIdMatch(candidate.fields.id, tokens)) factor *= PARTIAL_ID_FACTOR
  if (type === 'ownership' && wantOwnership) factor *= OWNERSHIP_FACTOR
  if ((type === 'intent' || type === 'change') && covered) factor *= ROUTE_TITLE_FACTOR
  if (type === 'change') {
    factor *= CHANGE_INTENT.test(term)
      ? CHANGE_INTENT_FACTOR
      : covered
        ? 1
        : CHANGE_WITHOUT_INTENT_FACTOR
  }

  const oneWord = !/\s/.test(trimmed)
  const looksLikeSymbol = oneWord && SYMBOL_SHAPED.test(trimmed)
  const looksLikePath = oneWord && PATH_SHAPED.test(trimmed)
  if ((looksLikeSymbol || looksLikePath) && candidate.entryType === 'module') factor *= KIND_FACTOR
  if (!looksLikeSymbol && !looksLikePath && tokens.length >= 3 && candidate.entryType === 'document') {
    factor *= KIND_FACTOR
  }

  return factor
}

type PreparedIndex = {
  readonly byRef: ReadonlyMap<string, Candidate>
  readonly bm25: Bm25Index
}

/**
 * Tokenizing three hundred records is the expensive part of a search, and it produces the same
 * result for every query against the same index. Memoizing it per index object turns a benchmark
 * of sixty queries from seconds into milliseconds; the map is weak, so nothing is retained once
 * the caller drops the index.
 */
const prepared = new WeakMap<DocBridgeIndexV1, PreparedIndex>()

const prepare = (index: DocBridgeIndexV1): PreparedIndex | undefined => {
  const cached = prepared.get(index)
  if (cached) return cached

  const candidates = [
    ...knowledgeCandidates(index),
    ...ownershipCandidates(index),
    ...intentCandidates(index),
    ...changeCandidates(index),
  ]
  if (!candidates.length) return undefined

  const inputs: Bm25Input[] = candidates.map((candidate) => ({ ref: candidate.ref, fields: candidate.fields }))
  const value: PreparedIndex = {
    byRef: new Map(candidates.map((candidate) => [candidate.ref, candidate])),
    bm25: buildBm25Index(inputs, resolveSearchWeights(index.retrieval?.weights), resolveSearchParams(index.retrieval?.params)),
  }
  prepared.set(index, value)
  return value
}

export const searchIndex = (index: DocBridgeIndexV1, term: string, limit = 20): SearchMatch[] => {
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
    const score =
      hit.score * BM25_SCALE * priorFactor(candidate, tokens, term, wantOwnership) +
      identityBoost(candidate.fields, tokens, term)
    const match: SearchMatch = { ...candidate.match, score }
    const existing = byPath.get(match.path)
    if (
      !existing ||
      match.score > existing.score ||
      (match.score === existing.score && match.type === 'ownership' && existing.type !== 'ownership')
    ) {
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
