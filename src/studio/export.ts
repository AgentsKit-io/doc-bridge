import { z } from 'zod'
import { entityId, relationId } from '../discovery/identity.js'
import { centrality } from '../graph/build.js'
import { sha256NormalizedV1 } from '../index-builder/content-hash.js'
import { searchIndex } from '../query/search.js'
import { DocBridgeIndexV1Schema, type DocBridgeIndexV1 } from '../schemas/doc-bridge-index.js'
import { EnrichmentOverlayV1Schema, type EnrichmentOverlayV1 } from '../schemas/enrichment.js'
import { FindingV1Schema, type FindingV1 } from '../schemas/findings.js'
import {
  STUDIO_LIMITS, StudioNodeV1Schema, StudioGraphV1Schema, StudioProposalV1Schema, StudioSearchV1Schema, StudioWhyV1Schema,
  type StudioGraphV1, type StudioNodeV1, type StudioEdgeV1, type StudioProposalV1, type StudioSearchV1, type StudioWhyV1,
} from '../schemas/studio-graph.js'

export type StudioExportOptions = {
  revision?: string
  humanNotes?: readonly string[]
  findings?: readonly FindingV1[]
  overlay?: EnrichmentOverlayV1
  vaultDiff?: readonly StudioProposalV1[]
}
const compare = (a: { id: string }, b: { id: string }): number => a.id < b.id ? -1 : a.id > b.id ? 1 : 0
const edgeKinds = new Set(['links-to', 'mentions', 'owns', 'cites', 'supersedes', 'changed-by', 'explains', 'imports', 're-exports', 'depends-on', 'covers'])
const document = (node: StudioNodeV1): boolean => node.kind === 'document' || node.kind === 'human-note'
const tally = (total: number, emitted: number) => ({ total, emitted, omitted: total - emitted })

/** Pure bounded presentation projection; never scans, approves, or changes its source index. */
export const exportStudioGraph = (input: DocBridgeIndexV1, options: StudioExportOptions = {}): StudioGraphV1 => {
  const index = DocBridgeIndexV1Schema.parse(input)
  const notes = new Set(z.array(StudioNodeV1Schema.shape.path.unwrap()).max(300).parse(options.humanNotes ?? []))
  const nodes = new Map<string, StudioNodeV1>()
  const edges = new Map<string, StudioEdgeV1>()
  let symbolTotal = 0
  let retainedSymbols = 0
  const limitations = ['Graph caps apply before centrality and degree; those metrics describe the emitted view.', 'The index has bounded adjacency per entry; studio truncation does not measure earlier discovery/retrieval omissions.', 'Generic adapter facts are not in the retrieval index; module and exported-symbol facts are available.', 'Timestamps are emitted only from explicit knowledge-entity dates; file modification times are never inferred.']
  const addEdge = (from: string, kind: StudioEdgeV1['kind'], to: string, sourceKind?: string): void => {
    const id = relationId(from, kind, to)
    const previous = edges.get(id)
    const original = [previous?.sourceKind, sourceKind !== kind ? sourceKind : undefined].filter((value): value is string => Boolean(value)).sort()[0]
    edges.set(id, { id, from, to, kind, weight: 1, ...(original ? { sourceKind: original } : {}) })
  }
  if (index.projection) for (const entry of [...index.projection.entries].sort(compare)) {
    const kind = entry.kind === 'module' ? 'fact' : entry.kind === 'intent' ? 'concept' : entry.kind === 'document' && notes.has(entry.path) ? 'human-note' : entry.kind
    nodes.set(entry.id, { id: entry.id, label: entry.title, kind, path: entry.path, sourceKind: entry.kind,
      ...(entry.graph.areaId ? { areaId: entry.graph.areaId } : {}), ...(entry.graph.areaId || entry.graph.packageId ? { cluster: entry.graph.areaId ?? entry.graph.packageId } : {}),
      metrics: { canonicality: entry.graph.pagerank, degree: 0 } })
    if (entry.kind === 'module') for (const symbol of [...(entry.symbols ?? [])].sort()) {
      symbolTotal += 1
      // No bounded view can retain more than 800 symbols; avoid expanding millions of candidates.
      if (retainedSymbols >= STUDIO_LIMITS.nodes) continue
      retainedSymbols += 1
      const id = entityId('symbol', `${entry.id}:${symbol}`)
      nodes.set(id, { id, label: symbol, kind: 'symbol', path: entry.path, ...(entry.graph.areaId ? { areaId: entry.graph.areaId, cluster: entry.graph.areaId } : {}), metrics: { degree: 0 } })
      addEdge(entry.id, 'owns', id)
    }
    for (const relation of entry.graph.outbound) {
      const kind = relation.kind === 'contains' ? 'owns' : relation.kind === 'mentions-symbol' ? 'mentions' : relation.kind
      if (edgeKinds.has(kind)) addEdge(entry.id, kind as StudioEdgeV1['kind'], relation.id, relation.kind)
    }
    if (entry.graph.packageId && entry.graph.packageId !== entry.id) addEdge(entry.graph.packageId, 'owns', entry.id)
    if (entry.graph.areaId && entry.graph.areaId !== entry.id) addEdge(entry.graph.areaId, 'owns', entry.id)
  }
  else {
    limitations.push('Legacy index: no relation projection, PageRank or centrality available; regenerate the index for graph signals.')
    for (const entry of index.knowledge) nodes.set(entry.id, { id: entry.id, label: entry.title, kind: notes.has(entry.path) ? 'human-note' : 'document', path: entry.path, metrics: { degree: 0 } })
  }
  const pathNodes = new Map<string, StudioNodeV1[]>()
  for (const node of nodes.values()) if (node.path) pathNodes.set(node.path, [...(pathNodes.get(node.path) ?? []), node])
  for (const entity of index.knowledgeEntities?.entities ?? []) {
    const region = entity.evidence.find(item => item.kind === 'document-region')
    const path = region?.kind === 'document-region' ? region.path : undefined
    nodes.set(entity.id, { id: entity.id, label: entity.name, kind: entity.kind, ...(path ? { path } : {}),
      ...(entity.date && /^\d{4}-\d{2}-\d{2}$/.test(entity.date) && z.string().date().safeParse(entity.date).success ? { timestamps: { authored: entity.date } } : {}), metrics: { degree: 0 } })
    if (path) for (const node of pathNodes.get(path) ?? []) if (document(node)) addEdge(entity.id, 'cites', node.id)
    for (const link of entity.links) {
      const symbolId = link.symbol ? entityId('symbol', `${link.target}:${link.symbol}`) : undefined
      const targets = link.kind === 'affected-path' ? (pathNodes.get(link.target) ?? []).filter(node => node.kind !== 'symbol').map(node => node.id) : [symbolId && nodes.has(symbolId) ? symbolId : link.target]
      for (const target of targets) {
        if (link.kind === 'superseded-by') addEdge(target, 'supersedes', entity.id)
        else if (link.kind === 'supersedes') addEdge(entity.id, 'supersedes', target)
        else if (entity.kind === 'change') addEdge(target, 'changed-by', entity.id)
        else addEdge(entity.id, 'explains', target)
      }
    }
  }
  const allNodes = [...nodes.values()].sort(compare)
  const perKind = new Map<string, number>()
  const balanced = allNodes.map(node => {
    const rank = perKind.get(node.kind) ?? 0
    perKind.set(node.kind, rank + 1)
    return { node, rank }
  }).sort((a, b) => a.rank - b.rank || compare(a.node, b.node))
  let docs = 0
  const emittedNodes = balanced.filter(({ node }) => !document(node) || ++docs <= STUDIO_LIMITS.documents).slice(0, STUDIO_LIMITS.nodes).map(({ node }) => node).sort(compare)
  const allEdges = [...edges.values()].filter(edge => nodes.has(edge.from) && nodes.has(edge.to)).sort(compare)
  const emittedIds = new Set(emittedNodes.map(node => node.id))
  const emittedEdges = allEdges.filter(edge => emittedIds.has(edge.from) && emittedIds.has(edge.to)).slice(0, STUDIO_LIMITS.edges)
  const categories: Record<string, StudioGraphV1['findings'][number]['code']> = { 'broken-reference': 'BROKEN_REFERENCE', 'ambiguous-reference': 'AMBIGUOUS_REFERENCE', 'changed-reference': 'CHANGED_REFERENCE' }
  const findings = z.array(FindingV1Schema).max(100_000).parse(options.findings ?? []).filter(finding => Object.hasOwn(categories, finding.category)).sort(compare).map(finding => ({ code: categories[finding.category]!, finding }))
  const proposals: StudioProposalV1[] = []
  if (options.overlay) {
    const overlay = EnrichmentOverlayV1Schema.parse(options.overlay)
    for (const [entries, status] of [[overlay.accepted, 'accepted'], [overlay.pending, 'proposed']] as const) for (const entry of entries) {
      const proposal = entry.proposal
      proposals.push({ id: proposal.proposalId, kind: proposal.kind === 'vault-edit' ? 'vault-diff' : 'overlay', targetIds: [proposal.entity], status, label: proposal.reason, evidenceHash: sha256NormalizedV1(proposal.evidence) })
    }
    for (const entry of overlay.rejected) proposals.push({ id: entry.proposalId, kind: entry.kind === 'vault-edit' ? 'vault-diff' : 'overlay', targetIds: entry.entity ? [entry.entity] : [], status: 'rejected', label: entry.detail ?? entry.reason, evidenceHash: entry.decision?.evidenceHash ?? sha256NormalizedV1(entry) })
    limitations.push('Overlay status is copied from the supplied artifact; export does not revalidate approval bindings or accept proposals.')
  }
  proposals.push(...z.array(StudioProposalV1Schema).max(10_000).parse(options.vaultDiff ?? []).map(proposal => {
    if (proposal.kind !== 'vault-diff') throw new Error('Expected vault-diff proposals')
    return proposal
  }))
  proposals.sort(compare)
  const graph: StudioGraphV1 = {
    type: 'studio-graph', schemaVersion: 1,
    source: { project: index.project?.name ?? 'repository', indexHash: index.contentHash, indexHashAlgo: index.contentHashAlgo, ...(options.revision ? { revision: options.revision } : {}) },
    nodes: emittedNodes, edges: emittedEdges, findings: findings.slice(0, STUDIO_LIMITS.findings), proposals: proposals.slice(0, STUDIO_LIMITS.proposals),
    coverage: { entities: index.knowledgeEntities ? 'enabled' : 'disabled', entityAnalysis: index.knowledgeEntities?.coverage ?? [], findings: options.findings ? 'supplied' : 'not-analyzed', proposals: options.overlay || options.vaultDiff ? 'supplied' : 'not-analyzed', limitations },
    truncation: { nodes: tally(0, 0), documents: tally(0, 0), edges: tally(0, 0), findings: tally(0, 0), proposals: tally(0, 0) },
  }
  const finalize = (): void => {
    const ids = new Set(graph.nodes.map(node => node.id))
    graph.edges = graph.edges.filter(edge => ids.has(edge.from) && ids.has(edge.to))
    for (const node of graph.nodes) { if (node.areaId && !ids.has(node.areaId)) delete node.areaId; if (node.cluster && !ids.has(node.cluster)) delete node.cluster }
    graph.truncation = { nodes: tally(allNodes.length + symbolTotal - retainedSymbols, graph.nodes.length), documents: tally(allNodes.filter(document).length, graph.nodes.filter(document).length), edges: tally(allEdges.length + symbolTotal - retainedSymbols, graph.edges.length), findings: tally(findings.length, graph.findings.length), proposals: tally(proposals.length, graph.proposals.length) }
  }
  finalize()
  // Reserve space for metrics so final serialization always fits the public byte cap.
  while (Buffer.byteLength(JSON.stringify(graph, null, 2)) > STUDIO_LIMITS.bytes - 100_000) {
    if (graph.proposals.length) graph.proposals.pop()
    else if (graph.findings.length) graph.findings.pop()
    else if (graph.edges.length) graph.edges.pop()
    else if (graph.nodes.length) graph.nodes.pop()
    else throw new Error('Studio metadata exceeds byte budget')
    finalize()
  }
  const snapshot = { entities: [], relations: graph.edges.map(edge => ({ ...edge, provenance: 'observed' as const, evidence: [] })) }
  const scores = centrality(snapshot)
  const degree = new Map<string, number>()
  for (const edge of graph.edges) for (const id of new Set([edge.from, edge.to])) degree.set(id, (degree.get(id) ?? 0) + 1)
  for (const node of graph.nodes) {
    node.metrics.degree = degree.get(node.id) ?? 0
    if (scores.has(node.id)) node.metrics.centrality = scores.get(node.id)!
  }
  const result = StudioGraphV1Schema.parse(graph)
  if (Buffer.byteLength(JSON.stringify(result, null, 2) + '\n') > STUDIO_LIMITS.bytes) throw new Error('Studio export exceeds byte budget')
  return result
}

/** Reuse engine ranking; only results represented in this bounded graph are returned. */
export const searchStudioGraph = (index: DocBridgeIndexV1, graph: StudioGraphV1, query: string): StudioSearchV1 => {
  if (index.contentHash !== graph.source.indexHash || index.contentHashAlgo !== graph.source.indexHashAlgo) throw new Error('Studio graph and search index differ')
  const nodes = new Map(graph.nodes.map(node => [node.id, node]))
  return StudioSearchV1Schema.parse({ type: 'studio-search', schemaVersion: 1, indexHash: index.contentHash, query,
    results: searchIndex(index, query, 100, { explain: true }).flatMap(match => {
      const node = nodes.get(match.entityId ?? match.id)
      return node ? [{ nodeId: node.id, label: node.label, score: match.score, ...(match.explain ? { why: { matched: match.explain.matched, components: match.explain.components, ...(match.explain.surfacedBy ? { surfacedBy: { kind: match.explain.surfacedBy.kind, id: match.explain.surfacedBy.id } } : {}) } } : {}) }] : []
    }) })
}
export const whyStudioNode = (graph: StudioGraphV1, id: string): StudioWhyV1 => {
  const node = graph.nodes.find(node => node.id === id)
  if (!node) throw new Error('Node unavailable in bounded studio graph')
  return StudioWhyV1Schema.parse({ type: 'studio-why', schemaVersion: 1, indexHash: graph.source.indexHash, node,
    edges: graph.edges.filter(edge => edge.from === id || edge.to === id),
    findingIds: graph.findings.filter(item => item.finding.entities.includes(id)).map(item => item.finding.id),
    proposalIds: graph.proposals.filter(proposal => proposal.targetIds.includes(id)).map(proposal => proposal.id) })
}
