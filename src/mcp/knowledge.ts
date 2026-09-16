import { applyBudget, type BudgetedSection } from '../budget/sections.js'
import type { DocBridgeConfigV1 } from '../config/schema.js'
import { handoffForEntity, resolveHandoffEntry } from '../query/handoff.js'
import { runQuery } from '../query/query.js'
import { searchIndex, type SearchMatch, type SearchOptions } from '../query/search.js'
import { formatRetrievedDocuments, type RetrievedDocument } from '../retriever/doc-bridge-retriever.js'
import type { AgentHandoffV1 } from '../schemas/agent-handoff.js'
import type { BudgetReport } from '../schemas/budget.js'
import type { DocBridgeIndexV1 } from '../schemas/doc-bridge-index.js'
import type { Evidence, KnowledgeDiagnostic, ReconciliationReportV1 } from '../schemas/knowledge.js'
import type { Confidence, RetrievalEntry, RetrievalIndexV1, RetrievalKind } from '../schemas/retrieval-index.js'

/**
 * The two calls an agent makes before editing: search, and one lookup that answers "tell me
 * about this" with the entity, its neighbourhood, the documents about it, its handoff, its open
 * diagnostics and its evidence — bounded by a declared token budget when the caller has one.
 *
 * Both read the retrieval projection the CLI reads and rank with the same `searchIndex`, so a
 * result here is the result `ak-docs search` prints for the same query and index; a test compares
 * the two rather than assuming it. Neither imports anything under `src/agents`: this is the
 * deterministic layer, and a lookup costs milliseconds with no model in the loop.
 */

export const KNOWLEDGE_TOOLS_SCHEMA_VERSION = 1 as const

/** Characters of body text an evidence excerpt carries: enough to recognise the passage, not to read it. */
const EXCERPT_CHARS = 240
const MAX_NEIGHBOURS_PER_KIND = 32
const MAX_DIAGNOSTICS = 32
const MAX_EVIDENCE = 8
export const MAX_LOOKUP_DEPTH = 3

export type KnowledgeSearchRequest = {
  readonly query: string
  /** Keep only these entry kinds. Filtering happens after ranking, so it never changes an order. */
  readonly kinds?: readonly RetrievalKind[] | undefined
  readonly limit?: number | undefined
  readonly explain?: boolean | undefined
  readonly budgetTokens?: number | undefined
  /** The `--agent` prior. */
  readonly agent?: boolean | undefined
}

export type KnowledgeSearchResult = SearchMatch & {
  readonly title?: string
  /** The opening of the projected body: the evidence excerpt a budget sheds first. */
  readonly excerpt?: string
}

export type KnowledgeSearchResponse = {
  readonly type: 'knowledge-search'
  readonly schemaVersion: typeof KNOWLEDGE_TOOLS_SCHEMA_VERSION
  readonly source: string
  readonly query: string
  readonly kinds?: readonly RetrievalKind[]
  readonly limit: number
  readonly count: number
  readonly results: readonly KnowledgeSearchResult[]
  readonly budget?: BudgetReport
}

export type KnowledgeLookupRequest = {
  readonly id?: string | undefined
  readonly path?: string | undefined
  /** How many hops of the graph to include as neighbours. 1 by default, at most `MAX_LOOKUP_DEPTH`. */
  readonly depth?: number | undefined
  readonly budgetTokens?: number | undefined
}

export type KnowledgeLookupEntity = {
  readonly id: string
  readonly kind: RetrievalKind
  readonly path: string
  readonly title: string
  readonly summary?: string
  readonly audience?: RetrievalEntry['audience']
  readonly aliases: readonly string[]
  readonly symbols?: readonly string[]
  readonly tags: readonly string[]
  readonly provenance: RetrievalEntry['provenance']
  readonly confidence: Confidence
  readonly contentHash: string
  readonly ownershipId?: string
  readonly areaId?: string
  readonly packageId?: string
  readonly pagerank: number
}

export type KnowledgeNeighbour = {
  readonly id: string
  readonly kind: RetrievalKind
  readonly path: string
  readonly title: string
  readonly summary?: string
  /** Whether the edge points at the entity or away from it. */
  readonly direction: 'inbound' | 'outbound'
  readonly confidence: Confidence
  /** Hops from the entity. */
  readonly distance: number
  /** The entry this one was reached through, when it is more than one hop away. */
  readonly via?: string
}

export type KnowledgeDocumentRef = {
  readonly id: string
  readonly path: string
  readonly title: string
  readonly summary?: string
  readonly audience?: RetrievalEntry['audience']
  readonly pagerank: number
}

export type KnowledgeEvidence = Evidence & {
  readonly excerpt?: string
}

export type KnowledgeLookupResponse = {
  readonly type: 'knowledge-lookup'
  readonly schemaVersion: typeof KNOWLEDGE_TOOLS_SCHEMA_VERSION
  readonly source: string
  readonly depth: number
  readonly entity: KnowledgeLookupEntity
  /** Neighbours by relation kind, keys sorted, each list by distance then id. */
  readonly neighbours: Readonly<Record<string, readonly KnowledgeNeighbour[]>>
  readonly documents: {
    readonly covering: readonly KnowledgeDocumentRef[]
    readonly mentioning: readonly KnowledgeDocumentRef[]
  }
  readonly handoff: AgentHandoffV1
  readonly diagnostics: {
    /** The reconciliation report the diagnostics came from, or null when no workflow run exists. */
    readonly reportHash: string | null
    readonly open: readonly KnowledgeDiagnostic[]
  }
  readonly evidence: readonly KnowledgeEvidence[]
  readonly budget?: BudgetReport
}

export type KnowledgeLookupOptions = {
  readonly root?: string
  /** The latest reconciliation report, when a workflow run has produced one. */
  readonly report?: () => ReconciliationReportV1 | undefined
}

const requireProjection = (index: DocBridgeIndexV1, tool: string): RetrievalIndexV1 => {
  if (!index.projection) throw new Error(`${tool} needs an index with a retrieval projection. Run: ak-docs index`)
  return index.projection
}

/** The opening of a body, cut at a word boundary, so an excerpt never ends mid-token. */
const excerptOf = (body: string | undefined): string | undefined => {
  const text = (body ?? '').replace(/\s+/g, ' ').trim()
  if (!text) return undefined
  if (text.length <= EXCERPT_CHARS) return text
  const cut = text.lastIndexOf(' ', EXCERPT_CHARS)
  return `${text.slice(0, cut > EXCERPT_CHARS / 2 ? cut : EXCERPT_CHARS).trimEnd()}…`
}

const evidenceSource = (kind: RetrievalKind): Evidence['source'] =>
  kind === 'module' ? 'code' : kind === 'document' ? 'documentation' : kind === 'intent' || kind === 'change' ? 'configuration' : 'derived'

const withoutSummary = <T extends { readonly summary?: string }>(value: T): T => {
  const { summary: _summary, ...rest } = value
  return rest as T
}

/*
 * ---------------------------------------------------------------------------------------------
 * knowledge.search
 * ---------------------------------------------------------------------------------------------
 */

const searchSections = (): readonly BudgetedSection<KnowledgeSearchResponse>[] => [
  {
    name: 'evidenceExcerpts',
    content: [],
    strip: (payload) => ({ ...payload, results: payload.results.map(({ excerpt: _excerpt, ...result }) => result) }),
  },
  {
    name: 'summaries',
    content: [],
    strip: (payload) => ({ ...payload, results: payload.results.map(withoutSummary) }),
  },
]

const sectionsWithContent = <T>(sections: readonly BudgetedSection<T>[], content: (name: BudgetedSection<T>['name']) => unknown): BudgetedSection<T>[] =>
  sections.map((section) => ({ ...section, content: content(section.name) }))

/**
 * Ranked entries for a query.
 *
 * With no `kinds`, this is exactly `searchIndex(index, query, limit)` — the CLI's call — with a
 * title and an excerpt added to each result. With `kinds`, the ranking is fetched deeper and
 * filtered, because a filter applied before the limit would return fewer than `limit` results
 * for a query that mostly matched another kind.
 */
export const knowledgeSearch = (index: DocBridgeIndexV1, request: KnowledgeSearchRequest): KnowledgeSearchResponse => {
  const projection = requireProjection(index, 'knowledge.search')
  const limit = request.limit ?? 20
  const options: SearchOptions = { ...(request.explain ? { explain: true } : {}), ...(request.agent ? { agent: true } : {}) }
  const kinds = request.kinds && request.kinds.length ? [...new Set(request.kinds)].sort() : undefined
  const matches = kinds
    ? searchIndex(index, request.query, Math.max(limit * 4, 40), options)
        .filter((match) => match.kind !== undefined && kinds.includes(match.kind))
        .slice(0, limit)
    : searchIndex(index, request.query, limit, options)
  const byId = new Map(projection.entries.map((entry) => [entry.id, entry]))

  const results: KnowledgeSearchResult[] = matches.map((match) => {
    const entry = match.entityId ? byId.get(match.entityId) : undefined
    const excerpt = excerptOf(entry?.fields.body)
    return { ...match, ...(entry ? { title: entry.title } : {}), ...(excerpt ? { excerpt } : {}) }
  })

  const response: KnowledgeSearchResponse = {
    type: 'knowledge-search',
    schemaVersion: KNOWLEDGE_TOOLS_SCHEMA_VERSION,
    source: `projection:${projection.contentHash}`,
    query: request.query,
    ...(kinds ? { kinds } : {}),
    limit,
    count: results.length,
    results,
  }
  if (request.budgetTokens === undefined) return response

  const sections = sectionsWithContent(searchSections(), (name) =>
    name === 'evidenceExcerpts' ? results.map((result) => result.excerpt).filter(Boolean) : results.map((result) => result.summary).filter(Boolean),
  )
  const budgeted = applyBudget(response, sections, request.budgetTokens)
  return { ...budgeted.payload, budget: budgeted.budget }
}

/*
 * ---------------------------------------------------------------------------------------------
 * knowledge.lookup
 * ---------------------------------------------------------------------------------------------
 */

const toEntity = (entry: RetrievalEntry): KnowledgeLookupEntity => ({
  id: entry.id,
  kind: entry.kind,
  path: entry.path,
  title: entry.title,
  ...(entry.summary ? { summary: entry.summary } : {}),
  ...(entry.audience ? { audience: entry.audience } : {}),
  aliases: entry.aliases,
  ...(entry.symbols?.length ? { symbols: entry.symbols } : {}),
  tags: entry.tags,
  provenance: entry.provenance,
  confidence: entry.confidence,
  contentHash: entry.contentHash,
  ...(entry.ownershipId ? { ownershipId: entry.ownershipId } : {}),
  ...(entry.graph.areaId ? { areaId: entry.graph.areaId } : {}),
  ...(entry.graph.packageId ? { packageId: entry.graph.packageId } : {}),
  pagerank: entry.graph.pagerank,
})

const toDocumentRef = (entry: RetrievalEntry): KnowledgeDocumentRef => ({
  id: entry.id,
  path: entry.path,
  title: entry.title,
  ...(entry.summary ? { summary: entry.summary } : {}),
  ...(entry.audience ? { audience: entry.audience } : {}),
  pagerank: entry.graph.pagerank,
})

const byCanonicality = (a: RetrievalEntry, b: RetrievalEntry): number => b.graph.pagerank - a.graph.pagerank || a.id.localeCompare(b.id)

type Edge = { readonly kind: string; readonly id: string; readonly confidence: Confidence; readonly direction: KnowledgeNeighbour['direction'] }

/**
 * Every edge at an entry, both directions, plus the hierarchy the projection records as fields
 * rather than edges: a module is contained by its area, an area contains its modules. The
 * projection carries `contains` nowhere in `inbound`/`outbound` — it is hierarchy, not a
 * relation the ranker walks — but an agent asking about an area wants its modules listed.
 */
const edgesAt = (projection: RetrievalIndexV1, entry: RetrievalEntry): Edge[] => {
  const edges: Edge[] = [
    ...entry.graph.inbound.map((edge) => ({ ...edge, direction: 'inbound' as const })),
    ...entry.graph.outbound.map((edge) => ({ ...edge, direction: 'outbound' as const })),
  ]
  const parent = entry.kind === 'module' || entry.kind === 'area' ? (entry.graph.areaId ?? entry.graph.packageId) : undefined
  if (parent && parent !== entry.id) edges.push({ kind: 'contains', id: parent, confidence: 'observed', direction: 'inbound' })
  if (entry.kind === 'area' || entry.kind === 'package') {
    for (const child of projection.entries) {
      if (child.id === entry.id) continue
      const childParent = child.kind === 'area' || child.kind === 'module' ? (child.graph.areaId ?? child.graph.packageId) : undefined
      if (childParent === entry.id) edges.push({ kind: 'contains', id: child.id, confidence: 'observed', direction: 'outbound' })
    }
  }
  return edges
}

/**
 * The neighbourhood, breadth first, bounded by depth and by count per relation kind.
 *
 * An entry is recorded once, at the distance it was first reached, under the relation that
 * reached it; the traversal visits entries in sorted id order at every level so the record is
 * the same whatever order the projection listed them in.
 */
const neighboursOf = (projection: RetrievalIndexV1, byId: ReadonlyMap<string, RetrievalEntry>, target: RetrievalEntry, depth: number): Record<string, KnowledgeNeighbour[]> => {
  const seen = new Set<string>([target.id])
  const grouped = new Map<string, KnowledgeNeighbour[]>()
  let frontier: RetrievalEntry[] = [target]
  for (let distance = 1; distance <= depth && frontier.length; distance += 1) {
    const next: RetrievalEntry[] = []
    for (const current of frontier) {
      const edges = edgesAt(projection, current).sort((a, b) => a.kind.localeCompare(b.kind) || a.id.localeCompare(b.id) || a.direction.localeCompare(b.direction))
      for (const edge of edges) {
        const entry = byId.get(edge.id)
        if (!entry || seen.has(entry.id)) continue
        seen.add(entry.id)
        next.push(entry)
        const list = grouped.get(edge.kind) ?? []
        list.push({
          id: entry.id,
          kind: entry.kind,
          path: entry.path,
          title: entry.title,
          ...(entry.summary ? { summary: entry.summary } : {}),
          direction: edge.direction,
          confidence: edge.confidence,
          distance,
          ...(distance > 1 ? { via: current.id } : {}),
        })
        grouped.set(edge.kind, list)
      }
    }
    frontier = next.sort((a, b) => a.id.localeCompare(b.id))
  }
  return Object.fromEntries(
    [...grouped.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([kind, list]) => [kind, list.sort((a, b) => a.distance - b.distance || a.id.localeCompare(b.id)).slice(0, MAX_NEIGHBOURS_PER_KIND)]),
  )
}

const SEVERITY_RANK: Readonly<Record<KnowledgeDiagnostic['severity'], number>> = { error: 0, warn: 1, info: 2, off: 3 }

/** Diagnostics that name the entity or point at its file and are not confirmed as fine. */
const openDiagnosticsFor = (report: ReconciliationReportV1 | undefined, target: RetrievalEntry): KnowledgeDiagnostic[] =>
  (report?.diagnostics ?? [])
    .filter((diagnostic) => diagnostic.status !== 'confirmed' && diagnostic.severity !== 'off')
    .filter((diagnostic) => diagnostic.entityIds?.includes(target.id) || diagnostic.evidence.some((item) => item.path === target.path))
    .sort((a, b) => SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity] || a.id.localeCompare(b.id))
    .slice(0, MAX_DIAGNOSTICS)

const lookupSections = (): readonly BudgetedSection<KnowledgeLookupResponse>[] => [
  {
    name: 'evidenceExcerpts',
    content: [],
    strip: (payload) => ({ ...payload, evidence: payload.evidence.map(({ excerpt: _excerpt, ...item }) => item) }),
  },
  {
    name: 'related',
    content: [],
    strip: (payload) => {
      const { related: _related, ...handoff } = payload.handoff
      return { ...payload, handoff }
    },
  },
  {
    name: 'neighbours',
    content: [],
    strip: (payload) => ({ ...payload, neighbours: {} }),
  },
  {
    name: 'summaries',
    content: [],
    strip: (payload) => ({
      ...payload,
      entity: withoutSummary(payload.entity),
      neighbours: Object.fromEntries(Object.entries(payload.neighbours).map(([kind, list]) => [kind, list.map(withoutSummary)])),
      documents: { covering: payload.documents.covering.map(withoutSummary), mentioning: payload.documents.mentioning.map(withoutSummary) },
    }),
  },
]

/** Which entry a lookup names: by id first, then by path, through the same resolution the handoff uses. */
export const resolveLookupEntry = (projection: RetrievalIndexV1, request: Pick<KnowledgeLookupRequest, 'id' | 'path'>): RetrievalEntry => {
  const key = request.id ?? request.path
  if (!key) throw new Error('knowledge.lookup requires id or path')
  const path = key.replace(/\/$/, '')
  const entry = request.id ? resolveHandoffEntry(projection, request.id) : (projection.entries.find((item) => item.path === path) ?? resolveHandoffEntry(projection, path))
  if (!entry) throw new Error(`Unknown entity "${key}". Try: ak-docs search "${key}"`)
  return entry
}

/**
 * Everything an agent wants to know about one entity before editing, in one bounded response.
 *
 * The handoff is the one `handoff.resolve` returns for the same entity; the documents are the
 * projection's `coveredBy` and `mentionedBy`, most canonical first; the diagnostics are the open
 * ones from the latest reconciliation report that name the entity or its file; the evidence is
 * the entity's own path and hash and those of the documents about it, each with the opening of
 * its body as an excerpt — the first thing a budget sheds.
 */
export const knowledgeLookup = (index: DocBridgeIndexV1, config: DocBridgeConfigV1, request: KnowledgeLookupRequest, options: KnowledgeLookupOptions = {}): KnowledgeLookupResponse => {
  const projection = requireProjection(index, 'knowledge.lookup')
  const depth = Math.min(MAX_LOOKUP_DEPTH, Math.max(1, request.depth ?? 1))
  const target = resolveLookupEntry(projection, request)
  const byId = new Map(projection.entries.map((entry) => [entry.id, entry]))
  const handoffOptions = options.root ? { root: options.root } : {}

  const handoff =
    target.kind === 'intent' || target.kind === 'change'
      ? (runQuery(index, config, { kind: target.kind, id: target.id, agent: true }, handoffOptions) as AgentHandoffV1)
      : handoffForEntity(index, target.id, config, handoffOptions)

  const documentsOf = (ids: readonly string[]): RetrievalEntry[] =>
    ids.map((id) => byId.get(id)).filter((entry): entry is RetrievalEntry => entry !== undefined && entry.kind === 'document').sort(byCanonicality)
  const covering = documentsOf(target.graph.coveredBy)
  const mentioning = documentsOf(target.graph.mentionedBy).filter((entry) => !covering.includes(entry))

  const report = options.report?.()
  const evidence: KnowledgeEvidence[] = [
    {
      source: evidenceSource(target.kind),
      path: target.path,
      contentHash: target.contentHash,
      context: `${target.kind} ${target.id}`,
      ...(excerptOf(target.fields.body) ? { excerpt: excerptOf(target.fields.body) as string } : {}),
    },
    ...[...covering.map((entry) => ({ entry, context: `covers ${target.id}` })), ...mentioning.map((entry) => ({ entry, context: `mentions ${target.id}` }))]
      .slice(0, MAX_EVIDENCE - 1)
      .map(({ entry, context }) => ({
        source: 'documentation' as const,
        path: entry.path,
        contentHash: entry.contentHash,
        context,
        ...(excerptOf(entry.fields.body) ? { excerpt: excerptOf(entry.fields.body) as string } : {}),
      })),
  ]

  const response: KnowledgeLookupResponse = {
    type: 'knowledge-lookup',
    schemaVersion: KNOWLEDGE_TOOLS_SCHEMA_VERSION,
    source: `projection:${projection.contentHash}`,
    depth,
    entity: toEntity(target),
    neighbours: neighboursOf(projection, byId, target, depth),
    documents: { covering: covering.map(toDocumentRef), mentioning: mentioning.map(toDocumentRef) },
    handoff,
    diagnostics: { reportHash: report?.contentHash ?? null, open: openDiagnosticsFor(report, target) },
    evidence,
  }
  if (request.budgetTokens === undefined) return response

  const sections = sectionsWithContent(lookupSections(), (name) => {
    if (name === 'evidenceExcerpts') return response.evidence.map((item) => item.excerpt).filter(Boolean)
    if (name === 'related') return response.handoff.related ?? []
    if (name === 'neighbours') return response.neighbours
    return [
      response.entity.summary,
      ...Object.values(response.neighbours).flatMap((list) => list.map((item) => item.summary)),
      ...response.documents.covering.map((item) => item.summary),
      ...response.documents.mentioning.map((item) => item.summary),
    ].filter(Boolean)
  })
  const budgeted = applyBudget(response, sections, request.budgetTokens)
  return { ...budgeted.payload, budget: budgeted.budget }
}

/*
 * ---------------------------------------------------------------------------------------------
 * handoff.resolve with a budget
 * ---------------------------------------------------------------------------------------------
 */

/**
 * A handoff trimmed to a budget. Its droppable sections are `related` and the note that repeats
 * the target's summary; `startHere`, `readBeforeEditing`, `editRoots`, `checks` and `evidence`
 * are what an agent acts on and are never shed.
 */
export const budgetedHandoff = (index: DocBridgeIndexV1, handoff: AgentHandoffV1, budgetTokens: number): AgentHandoffV1 => {
  const entry = index.projection && handoff.metadata?.entityId ? resolveHandoffEntry(index.projection, String(handoff.metadata.entityId)) : undefined
  const summaryNotes = entry?.summary ? handoff.notes.filter((note) => note === entry.summary) : []
  const sections: BudgetedSection<AgentHandoffV1>[] = [
    {
      name: 'related',
      content: handoff.related ?? [],
      strip: (payload) => {
        const { related: _related, ...rest } = payload
        return rest
      },
    },
    {
      name: 'summaries',
      content: summaryNotes,
      strip: (payload) => ({ ...payload, notes: payload.notes.filter((note) => !summaryNotes.includes(note)) }),
    },
  ]
  const budgeted = applyBudget(handoff, sections, budgetTokens)
  return { ...budgeted.payload, budget: budgeted.budget }
}

/*
 * ---------------------------------------------------------------------------------------------
 * Text renderings
 * ---------------------------------------------------------------------------------------------
 */

const budgetLine = (budget: BudgetReport | undefined): string[] =>
  budget
    ? [`Budget: ${budget.tokens.total}/${budget.tokens.budget} tokens (${budget.tokenMethod}), fits: ${budget.fits ? 'yes' : 'no'}, dropped: ${budget.dropped.length ? budget.dropped.join(', ') : 'nothing'}`]
    : []

const joined = (parts: readonly (string | undefined)[]): string => parts.filter((part): part is string => Boolean(part && part.trim())).join('\n\n')

/** The search payload as prose: one numbered block per result, through `formatRetrievedDocuments`. */
export const formatKnowledgeSearchText = (response: KnowledgeSearchResponse): string => {
  const documents: RetrievedDocument[] = response.results.map((result) => ({
    id: result.entityId ?? result.id,
    source: result.path,
    score: result.score,
    content: joined([`${result.title ?? result.id} [${result.kind ?? result.type}] score=${result.score.toFixed(2)}${result.confidence ? ` confidence=${result.confidence}` : ''}`, result.summary, result.excerpt]),
  }))
  return [`Query: ${response.query} (${response.count} result${response.count === 1 ? '' : 's'})`, ...budgetLine(response.budget), formatRetrievedDocuments(documents)].filter(Boolean).join('\n\n')
}

/** The lookup payload as prose: the entity, then one block per section that has content. */
export const formatKnowledgeLookupText = (response: KnowledgeLookupResponse): string => {
  const { entity, handoff } = response
  const documents: RetrievedDocument[] = [
    {
      id: entity.id,
      source: entity.path,
      content: joined([`${entity.title} [${entity.kind}] confidence=${entity.confidence}`, entity.summary, response.evidence[0]?.excerpt]),
    },
  ]
  const neighbourLines = Object.entries(response.neighbours).flatMap(([kind, list]) => list.map((item) => `${kind} ${item.direction === 'inbound' ? '←' : '→'} ${item.id} (${item.kind}, ${item.distance} hop${item.distance === 1 ? '' : 's'})`))
  if (neighbourLines.length) documents.push({ id: 'neighbours', content: neighbourLines.join('\n') })
  const documentLines = [
    ...response.documents.covering.map((item) => `covers: ${item.path}${item.summary ? ` — ${item.summary}` : ''}`),
    ...response.documents.mentioning.map((item) => `mentions: ${item.path}${item.summary ? ` — ${item.summary}` : ''}`),
  ]
  if (documentLines.length) documents.push({ id: 'documents', content: documentLines.join('\n') })
  documents.push({
    id: 'handoff',
    content: [
      `startHere: ${handoff.startHere}`,
      `readBeforeEditing: ${handoff.readBeforeEditing.join(', ')}`,
      `editRoots: ${handoff.editRoots.join(', ')}`,
      `checks: ${handoff.checks.join(', ') || '(none)'}`,
      ...(handoff.related?.length ? [`related: ${handoff.related.map((row) => `${row.direction} ${row.id} (${row.strength})`).join(', ')}`] : []),
    ].join('\n'),
  })
  if (response.diagnostics.open.length) {
    documents.push({ id: 'diagnostics', content: response.diagnostics.open.map((item) => `[${item.severity}] ${item.code}: ${item.message}`).join('\n') })
  }
  documents.push({ id: 'evidence', content: response.evidence.map((item) => `${item.path}${item.contentHash ? ` @${item.contentHash.slice(0, 12)}` : ''}${item.context ? ` (${item.context})` : ''}`).join('\n') })
  return [...budgetLine(response.budget), formatRetrievedDocuments(documents)].join('\n\n')
}
