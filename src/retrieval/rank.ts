import { foldAccents, hasSearchToken, searchTokens } from '../query/text.js'
import type { Confidence, RetrievalEdge, RetrievalEntry, RetrievalIndexV1 } from '../schemas/retrieval-index.js'
import { buildBm25Index, bm25Search, type Bm25Hit, type Bm25Index } from './bm25.js'
import { weakerConfidence } from './project.js'

/**
 * Ranking over the retrieval projection.
 *
 * The score has named parts, and every part is reported when asked, because a ranking that
 * cannot say why it put one record above another cannot be corrected: a wrong answer is then an
 * opinion about weights rather than a bug with a line number. Lexical evidence is BM25 over the
 * projected fields; identity boosts reward a query that names a thing rather than describes it;
 * graph proximity rewards being next to what the query clearly found; canonicality rewards the
 * page other pages point at; the audience prior is what `--agent` means. Priors multiply the
 * lexical evidence rather than adding to it, so a favoured record still needs a real match.
 */

/** Turns a BM25 score into the same magnitude as the identity boosts below. */
const BM25_SCALE = 50

const EXACT_ID = 200
const EXACT_PATH = 150
const EXACT_SYMBOL = 150
const DIRECTORY_MATCH = 120
const TOKEN_ID = 120
const TOKEN_PATH = 100
const TOKEN_SYMBOL = 90
const SHORT_ID_BONUS = 40
/** A query this short is a name; a longer one is a sentence that happens to contain names. */
const NAMING_QUERY_TOKENS = 2

/**
 * Proximity: a candidate one hop from something the query clearly found is probably what the
 * query meant, or the place to read about it. Two hops is a weaker hint. Only the ten strongest
 * lexical hits count as anchors — beyond that the "clearly found" premise no longer holds — and
 * the boost is as strong as the anchor: being next to the best match is worth the full amount,
 * being next to a marginal one worth a fraction, so a hub page that barely matched cannot lift
 * everything it links to above the module that answers.
 */
const PROXIMITY_ANCHORS = 10
const PROXIMITY_ONE_HOP = 30
const PROXIMITY_TWO_HOPS = 12

/**
 * Canonicality: log-scaled PageRank, so a page every document links to earns a bounded bonus and
 * the long tail of leaf pages earns close to nothing. Scaled by the corpus size, because a
 * PageRank is a share of one and only means something relative to the uniform 1/N.
 */
const CANONICALITY_SCALE = 4

/** The `--agent` prior: documentation written for an agent answers an agent's question first. */
const AUDIENCE_FIT = 25

/**
 * Accepted agent signals: bounded influence.
 *
 * An entry's signal is a share in 0..1 of this weight, and the weight is 15% of the exact-id
 * boost. That is the whole contract: an accepted rank hint or canonical marker can reorder
 * near-ties among lexical hits, and can never lift an entry past one the query named exactly.
 * Signals apply to lexical hits only, like every other tie-breaker.
 */
export const ACCEPTED_SIGNALS_SHARE = 0.15
export const ACCEPTED_SIGNALS_WEIGHT = Math.round(EXACT_ID * ACCEPTED_SIGNALS_SHARE)

const CURATED_FACTOR = 1.15
const OWNERSHIP_FACTOR = 1.1
const ROUTE_TITLE_FACTOR = 1.6
const CHANGE_INTENT_FACTOR = 1.4
const CHANGE_WITHOUT_INTENT_FACTOR = 0.15
const KIND_FACTOR = 1.15
const PARTIAL_ID_FACTOR = 1.2

export const RELEVANCE_FLOOR = 1 / 3

const PACKAGE_INTENT =
  /\b(package|module|pkg|edit|change|where|owns?|ownership|handoff|start)\b|\b(?:pacote|pacotes|modulo|modulos|onde|quem|dono|donos|responsavel|responsaveis|comec\w*|inici\w*|edit\w*|mud\w*|alter\w*)/i
const CHANGE_INTENT =
  /\b(change|edit|modify|update|fix|migrate|replace)\b|\b(?:alter\w*|mud\w*|modific\w*|edit\w*|atualiz\w*|corrig\w*|migr\w*|substitu\w*|troc\w*)/i
const SYMBOL_SHAPED = /[a-z0-9][A-Z]|^[A-Za-z_$][A-Za-z0-9_$]{2,}$/
const PATH_SHAPED = /\/|\.[A-Za-z]{1,4}$/

export type ScoreComponents = {
  readonly lexical: number
  readonly prior: number
  readonly exactId: number
  readonly exactPath: number
  readonly exactSymbol: number
  readonly graphProximity: number
  readonly canonicality: number
  readonly audienceFit: number
  readonly acceptedAgentSignals: number
}

export type RankExplanation = {
  /** Query terms after the lexicon: what the ranker actually looked for. */
  readonly terms: readonly string[]
  /** Which terms matched in which field. */
  readonly matched: Readonly<Record<string, readonly string[]>>
  readonly components: ScoreComponents
  /**
   * The edge proximity found this result through. When nothing matched lexically it is the only
   * reason the result is here; otherwise it is what the proximity component stands on.
   */
  readonly surfacedBy?: { readonly kind: string; readonly id: string; readonly confidence: Confidence; readonly hops: number }
}

export type RankedEntry = {
  readonly entry: RetrievalEntry
  readonly score: number
  /**
   * The entry's own confidence when the query matched it directly; when a relation alone
   * surfaced it, the weaker of the entry and that relation — a result is as trustworthy as the
   * least trustworthy step that produced it.
   */
  readonly confidence: Confidence
  readonly explanation: RankExplanation
}

export type RankOptions = {
  readonly limit?: number
  /** The `--agent` prior: favour documentation written for an agent. */
  readonly agent?: boolean
  /** Per-entry accepted overlay signals (0..1), by entry id. Overrides the `agentSignal` the projection carries. */
  readonly signals?: ReadonlyMap<string, number>
  /**
   * Results scoring below this share of the best score are dropped. The default spends context
   * on nothing weak; a caller assembling a neighbourhood rather than an answer passes 0.
   */
  readonly floor?: number
}

const round = (value: number): number => Math.round(value * 1_000_000) / 1_000_000

const pathBase = (path: string): string => foldAccents((path.split('/').pop() ?? '').replace(/\.[A-Za-z0-9]+$/, '').toLowerCase())

const preferOwnership = (term: string): boolean => PACKAGE_INTENT.test(term) || /^(where|how).*(edit|change|package|module)/i.test(term)

const titleCoversQuery = (title: string, tokens: readonly string[]): boolean =>
  tokens.length > 1 && tokens.every((token) => hasSearchToken(foldAccents(title.toLowerCase()), token))

const partialIdMatch = (id: string, tokens: readonly string[]): boolean => {
  const idLower = foldAccents(id.toLowerCase())
  return tokens.some(
    (token) =>
      idLower !== token &&
      (idLower.startsWith(`${token}-`) || idLower.endsWith(`-${token}`) || (idLower.includes(token) && idLower.length <= token.length + 4)),
  )
}

/** The names an entry answers to when the query is an identifier: its aliases and, for a route, its id. */
const identifiers = (entry: RetrievalEntry): string[] =>
  [...new Set([...entry.aliases, ...(entry.kind === 'intent' || entry.kind === 'change' ? [entry.id] : []), ...(entry.ownershipId ? [entry.ownershipId] : [])])].map((value) =>
    foldAccents(value.toLowerCase()),
  )

type Identity = { readonly exactId: number; readonly exactPath: number; readonly exactSymbol: number }

/**
 * The query names the thing rather than describing it.
 *
 * A module is identified by its path and its exported symbols, a package or an area by its id and
 * its aliases (an ownership id, a short name), a document by its filename. The whole query is
 * checked before its tokens, so `src/mcp/server.ts` beats every record that merely mentions `mcp`.
 */
const identityBoost = (entry: RetrievalEntry, tokens: readonly string[], term: string): Identity => {
  const ids = identifiers(entry)
  const entityId = foldAccents(entry.id.toLowerCase())
  const pathLower = foldAccents(entry.path.toLowerCase())
  const termLower = foldAccents(term.toLowerCase().trim())
  const base = pathBase(entry.path)
  const symbols = new Set((entry.symbols ?? []).map((symbol) => foldAccents(symbol.toLowerCase())))
  let exactId = 0
  let exactPath = 0
  let exactSymbol = 0

  if (ids.includes(termLower) || entityId === termLower) exactId += EXACT_ID
  if (base === termLower || pathLower === termLower) exactPath += EXACT_PATH
  if (symbols.has(termLower)) exactSymbol += EXACT_SYMBOL
  if (termLower && (pathLower.startsWith(`${termLower}/`) || pathLower.includes(`/${termLower}/`))) exactPath += DIRECTORY_MATCH

  /*
   * Per-token identity for filenames and symbols is for short queries: `search index` names
   * `searchIndex`, and `bm25` names `bm25.ts`. A sentence does not name a file by containing one
   * of its tokens — in "where are workflow transitions persisted", `transition` coinciding with an
   * exported name is lexical evidence, which BM25 already weighs, not identity. An id or an alias
   * is different: an ownership id is a name someone chose for a unit, and "integration setup auth"
   * does name `auth`. Directory segments never count: an area or a package is named by the whole
   * term, or by an alias it was given.
   */
  const file = entry.kind === 'document' || entry.kind === 'module'
  const naming = tokens.length <= NAMING_QUERY_TOKENS
  for (const token of tokens) {
    if (ids.includes(token)) exactId += TOKEN_ID
    if (naming && file && base === token) exactPath += TOKEN_PATH
    if (naming && symbols.has(token)) exactSymbol += TOKEN_SYMBOL
  }

  // Prefer a short id when the query is the id: "core" should mean the core package.
  const shortest = ids.filter((id) => tokens.includes(id)).sort((a, b) => a.length - b.length)[0]
  if (shortest) exactId += Math.max(0, SHORT_ID_BONUS - shortest.length)

  return { exactId, exactPath, exactSymbol }
}

/** A nudge toward the kind of record the query shape asks for. A prior, not a filter. */
const priorFactor = (entry: RetrievalEntry, tokens: readonly string[], term: string, wantOwnership: boolean): number => {
  const trimmed = term.trim()
  const covered = titleCoversQuery(entry.title, tokens)
  let factor = 1

  if (entry.audience === 'agent' || entry.audience === 'human-and-agent') factor *= CURATED_FACTOR
  if (identifiers(entry).some((id) => partialIdMatch(id, tokens))) factor *= PARTIAL_ID_FACTOR
  if (entry.ownershipId && wantOwnership) factor *= OWNERSHIP_FACTOR
  if ((entry.kind === 'intent' || entry.kind === 'change') && covered) factor *= ROUTE_TITLE_FACTOR
  if (entry.kind === 'change') factor *= CHANGE_INTENT.test(term) ? CHANGE_INTENT_FACTOR : covered ? 1 : CHANGE_WITHOUT_INTENT_FACTOR

  const oneWord = !/\s/.test(trimmed)
  const looksLikeSymbol = oneWord && SYMBOL_SHAPED.test(trimmed)
  const looksLikePath = oneWord && PATH_SHAPED.test(trimmed)
  if ((looksLikeSymbol || looksLikePath) && entry.kind === 'module') factor *= KIND_FACTOR
  if (!looksLikeSymbol && !looksLikePath && tokens.length >= 3 && entry.kind === 'document') factor *= KIND_FACTOR

  return factor
}

type Prepared = {
  readonly byId: ReadonlyMap<string, RetrievalEntry>
  readonly bm25: Bm25Index
  /** Undirected one-hop neighbourhood over documentation and import edges, by entry id. */
  readonly neighbours: ReadonlyMap<string, readonly RetrievalEdge[]>
  readonly entryCount: number
}

const prepared = new WeakMap<RetrievalIndexV1, Prepared>()

/**
 * Tokenising every entry is the expensive part of a search and gives the same result for every
 * query against the same index, so it is done once per index object. The map is weak: nothing is
 * retained once the caller drops the index.
 */
const prepare = (index: RetrievalIndexV1): Prepared => {
  const cached = prepared.get(index)
  if (cached) return cached
  const neighbours = new Map<string, RetrievalEdge[]>()
  const link = (from: string, edge: RetrievalEdge): void => {
    const list = neighbours.get(from)
    if (list) list.push(edge)
    else neighbours.set(from, [edge])
  }
  for (const entry of index.entries) {
    for (const edge of entry.graph.inbound) link(entry.id, edge)
    for (const edge of entry.graph.outbound) link(entry.id, edge)
  }
  const value: Prepared = {
    byId: new Map(index.entries.map((entry) => [entry.id, entry])),
    bm25: buildBm25Index(index.entries.map((entry) => ({ ref: entry.id, fields: entry.fields })), index.weights, index.params),
    neighbours,
    entryCount: index.entries.length,
  }
  prepared.set(index, value)
  return value
}

type Reach = { readonly hops: number; readonly via: RetrievalEdge; readonly anchorShare: number }

/**
 * What the strongest lexical hits are next to, within two hops.
 *
 * Nearest wins: an entry reachable in one hop from one anchor and two from another is one hop
 * away. The edge recorded is the one that made the shortest reach, so the explanation names a
 * real relation and the result's confidence can be no better than that relation's.
 */
const reachable = (ready: Prepared, anchors: readonly Bm25Hit[]): ReadonlyMap<string, Reach> => {
  const reach = new Map<string, Reach>()
  const anchored = new Set(anchors.map((anchor) => anchor.ref))
  const best = anchors[0]?.score ?? 0
  // Anchors are visited strongest first, so the first reach recorded is the strongest one.
  for (const anchor of anchors) {
    const anchorShare = best > 0 ? anchor.score / best : 0
    for (const first of ready.neighbours.get(anchor.ref) ?? []) {
      if (anchored.has(first.id)) continue
      const known = reach.get(first.id)
      if (!known || known.hops > 1) reach.set(first.id, { hops: 1, via: { kind: first.kind, id: anchor.ref, confidence: first.confidence }, anchorShare })
      for (const second of ready.neighbours.get(first.id) ?? []) {
        if (anchored.has(second.id) || second.id === anchor.ref) continue
        if (!reach.has(second.id)) {
          reach.set(second.id, { hops: 2, via: { kind: second.kind, id: first.id, confidence: weakerConfidence(first.confidence, second.confidence) }, anchorShare })
        }
      }
    }
  }
  return reach
}

const canonicalityBoost = (pagerank: number, entryCount: number): number =>
  pagerank > 0 && entryCount > 0 ? CANONICALITY_SCALE * Math.log1p(pagerank * entryCount) : 0

/**
 * Rank the projection against a query.
 *
 * Ordering is total: score descending, then an exact id match, then an ownership-backed entry,
 * then id ascending — so two runs agree exactly and a tie never depends on insertion order.
 * Results below a third of the best score are dropped: retrieval exists to spend fewer tokens.
 */
export const rankRetrieval = (index: RetrievalIndexV1, term: string, options: RankOptions = {}): RankedEntry[] => {
  const tokens = searchTokens(term)
  if (!tokens.length || !index.entries.length) return []
  const ready = prepare(index)
  const hits = bm25Search(ready.bm25, tokens)
  const wantOwnership = preferOwnership(term)
  const limit = options.limit ?? 20

  const hitByRef = new Map<string, Bm25Hit>(hits.map((hit) => [hit.ref, hit]))
  const reach = reachable(ready, hits.slice(0, PROXIMITY_ANCHORS))

  // Candidates are every lexical hit plus what the strongest hits are next to.
  const candidateIds = new Set<string>([...hitByRef.keys(), ...reach.keys()])
  const ranked: RankedEntry[] = []

  for (const id of candidateIds) {
    const entry = ready.byId.get(id)
    if (!entry) continue
    const hit = hitByRef.get(id)
    const near = reach.get(id)
    const lexical = round((hit?.score ?? 0) * BM25_SCALE)
    const prior = round(priorFactor(entry, tokens, term, wantOwnership))
    const identity = identityBoost(entry, tokens, term)
    const graphProximity = near ? round((near.hops === 1 ? PROXIMITY_ONE_HOP : PROXIMITY_TWO_HOPS) * near.anchorShare) : 0
    const canonicality = round(canonicalityBoost(entry.graph.pagerank, ready.entryCount))
    const audienceFit = options.agent && (entry.audience === 'agent' || entry.audience === 'human-and-agent') ? AUDIENCE_FIT : 0
    const signal = Math.min(1, Math.max(0, options.signals?.get(id) ?? entry.agentSignal ?? 0))
    const acceptedAgentSignals = round(signal * ACCEPTED_SIGNALS_WEIGHT)

    /*
     * A record nothing matched lexically is only here because of proximity. It earns proximity
     * and nothing else: the query did not name it, and canonicality is a tie-breaker among
     * answers, not an answer. Everything else scales from the lexical evidence.
     */
    const evidence = hit ? lexical * prior + identity.exactId + identity.exactPath + identity.exactSymbol : 0
    const score = round(evidence + graphProximity + (hit ? canonicality + audienceFit + acceptedAgentSignals : 0))
    if (score <= 0) continue

    const components: ScoreComponents = {
      lexical,
      prior,
      exactId: hit ? identity.exactId : 0,
      exactPath: hit ? identity.exactPath : 0,
      exactSymbol: hit ? identity.exactSymbol : 0,
      graphProximity,
      canonicality: hit ? canonicality : 0,
      audienceFit: hit ? audienceFit : 0,
      acceptedAgentSignals: hit ? acceptedAgentSignals : 0,
    }
    ranked.push({
      entry,
      score,
      confidence: near && !hit ? weakerConfidence(entry.confidence, near.via.confidence) : entry.confidence,
      explanation: {
        terms: tokens,
        matched: hit?.matched ?? {},
        components,
        ...(near ? { surfacedBy: { ...near.via, hops: near.hops } } : {}),
      },
    })
  }

  ranked.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score
    const aExact = a.explanation.components.exactId > 0 ? 1 : 0
    const bExact = b.explanation.components.exactId > 0 ? 1 : 0
    if (bExact !== aExact) return bExact - aExact
    const aOwned = a.entry.ownershipId ? 1 : 0
    const bOwned = b.entry.ownershipId ? 1 : 0
    if (bOwned !== aOwned) return bOwned - aOwned
    return a.entry.id.localeCompare(b.entry.id)
  })

  const best = ranked[0]?.score ?? 0
  const floor = options.floor ?? RELEVANCE_FLOOR
  const kept = best > 0 ? ranked.filter((item) => item.score >= best * floor) : ranked
  return kept.slice(0, limit)
}

