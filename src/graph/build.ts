import Graph, { type GraphologyGraph } from 'graphology'
import louvain from 'graphology-communities-louvain'
import hasCycle from 'graphology-dag/has-cycle.js'
import betweennessCentrality from 'graphology-metrics/centrality/betweenness.js'
import pagerank from 'graphology-metrics/centrality/pagerank.js'
import { singleSourceLength } from 'graphology-shortest-path/unweighted.js'

import type { Coverage, DiscoverySnapshotV1, Evidence, KnowledgeRelation } from '../schemas/knowledge.js'

/**
 * Graph signals over the knowledge snapshot.
 *
 * The rules engine used to derive `centrality-risk` from how many undocumented-relation findings
 * were attached to an entity — a measure of documentation debt wearing the name of an
 * architectural signal. A module can be the single point every import path runs through and carry
 * no findings at all; a well-connected but thoroughly documented module carried the highest score.
 * This module computes the real thing: betweenness over the import graph, PageRank over the
 * documentation graph, bounded shortest paths, and cycles.
 *
 * The graph is a working structure. It is built from the snapshot on demand, never serialised, and
 * `DiscoverySnapshotV1` does not learn about graphology. Nodes are inserted in sorted order and
 * every score is rounded before it is returned, so two runs over the same snapshot agree exactly
 * and an artifact built from these numbers keeps its hash.
 */

export const GRAPH_ANALYZER_VERSION = '1.0.0'

/** Edges that say "this documentation points at that": the canonicality signal. */
export const DOCUMENTATION_EDGE_KINDS = ['links-to', 'covers'] as const

/** Edges that say "this code needs that": the centrality and cycle signal. */
export const IMPORT_EDGE_KINDS = ['imports', 're-exports'] as const

/** Enough precision to rank, little enough to compare exactly across runs and platforms. */
const PRECISION = 1e6

const round = (value: number): number => Math.round(value * PRECISION) / PRECISION

export type BuildGraphOptions = {
  /** Relation kinds to include. Every other relation is left out of this view. */
  readonly kinds?: readonly string[]
  /** Undirected graphs are for community detection; everything else is directed. */
  readonly undirected?: boolean
  /** Keep external and unresolved endpoints. Off by default: they are not project architecture. */
  readonly includeExternal?: boolean
}

const isInternal = (id: string): boolean => !id.startsWith('external:') && !id.startsWith('unresolved:')

/**
 * Build a view of the snapshot as a graph.
 *
 * Nodes are added in sorted order, then edges in sorted order, so the library's internal iteration
 * order is a function of the snapshot's content and not of how the snapshot happened to be built.
 * That is what makes a metric reproducible after the input order is shuffled.
 */
export const buildKnowledgeGraph = (
  snapshot: Pick<DiscoverySnapshotV1, 'entities' | 'relations'>,
  options: BuildGraphOptions = {},
): GraphologyGraph => {
  const kinds = options.kinds ? new Set(options.kinds) : undefined
  const includeExternal = options.includeExternal ?? false
  const graph = new Graph({ type: options.undirected ? 'undirected' : 'directed', multi: false, allowSelfLoops: false })

  const relations = [...snapshot.relations]
    .filter((relation) => !kinds || kinds.has(relation.kind))
    .filter((relation) => includeExternal || (isInternal(relation.from) && isInternal(relation.to)))
    .filter((relation) => relation.from !== relation.to)
    .sort((a, b) => a.id.localeCompare(b.id))

  const referenced = new Set(relations.flatMap((relation) => [relation.from, relation.to]))
  const entities = new Set(snapshot.entities.map((entity) => entity.id))
  for (const id of [...referenced].sort()) {
    // An endpoint with no entity is still a node: the relation observed it, and dropping it
    // silently would change a path length without saying so.
    if (!graph.hasNode(id)) graph.addNode(id, { known: entities.has(id) })
  }
  for (const relation of relations) {
    if (graph.hasEdge(relation.from, relation.to)) continue
    graph.addEdge(relation.from, relation.to, { kind: relation.kind, relationId: relation.id })
  }
  return graph
}

export type GraphSignal = ReadonlyMap<string, number>

/**
 * Canonicality: PageRank over the documentation graph.
 *
 * A page many documents link to, or that covers many entities, is where a reader should start. A
 * leaf note nothing points at is not, however recently it was edited. PageRank says that without
 * anyone maintaining a list of entry points.
 */
export const canonicality = (
  snapshot: Pick<DiscoverySnapshotV1, 'entities' | 'relations'>,
  options: { readonly alpha?: number } = {},
): GraphSignal => {
  const graph = buildKnowledgeGraph(snapshot, { kinds: DOCUMENTATION_EDGE_KINDS })
  if (!graph.order) return new Map()
  const scores = pagerank(graph, { getEdgeWeight: null, alpha: options.alpha ?? 0.85 })
  return new Map(
    Object.entries(scores)
      .map(([id, score]): [string, number] => [id, round(score)])
      .sort(([a], [b]) => a.localeCompare(b)),
  )
}

/**
 * Centrality: betweenness over the import graph.
 *
 * How much of the repository's dependency structure runs through this module. High betweenness is
 * a review signal — a change here reaches further than its diff suggests — and nothing more: it is
 * a static count of shortest paths, not a statement about runtime availability.
 */
export const centrality = (
  snapshot: Pick<DiscoverySnapshotV1, 'entities' | 'relations'>,
  options: { readonly kinds?: readonly string[] } = {},
): GraphSignal => {
  const graph = buildKnowledgeGraph(snapshot, { kinds: options.kinds ?? IMPORT_EDGE_KINDS })
  if (!graph.order) return new Map()
  const scores = betweennessCentrality(graph, { getEdgeWeight: null, normalized: true })
  return new Map(
    Object.entries(scores)
      .map(([id, score]): [string, number] => [id, round(score)])
      .sort(([a], [b]) => a.localeCompare(b)),
  )
}

export type ProximityOptions = {
  readonly kinds?: readonly string[]
  /** Hops beyond which two entities are not usefully related. */
  readonly maxDepth?: number
}

export const DEFAULT_PROXIMITY_DEPTH = 3

/**
 * Relation kinds that make two entities *related*, as opposed to merely filed together.
 *
 * `contains` is left out on purpose: it is hierarchy, and including it puts every module in an
 * area two hops from every other one, which is true and tells a reader nothing. What makes a
 * module close to a document is that the document covers or mentions it; what makes two modules
 * close is that one imports the other.
 */
export const PROXIMITY_EDGE_KINDS = [
  ...IMPORT_EDGE_KINDS,
  ...DOCUMENTATION_EDGE_KINDS,
  'mentions',
  'mentions-symbol',
  'depends-on',
] as const

/**
 * Proximity: how many hops from one entity to another, bounded.
 *
 * Bounded because an unbounded answer is not useful — at ten hops everything is related to
 * everything — and because ranking and handoff selection need a cheap neighbourhood, not a
 * complete distance matrix.
 */
export const proximity = (
  snapshot: Pick<DiscoverySnapshotV1, 'entities' | 'relations'>,
  from: string,
  options: ProximityOptions = {},
): GraphSignal => {
  const maxDepth = options.maxDepth ?? DEFAULT_PROXIMITY_DEPTH
  const graph = buildKnowledgeGraph(snapshot, {
    kinds: options.kinds ?? PROXIMITY_EDGE_KINDS,
    undirected: true,
  })
  if (!graph.hasNode(from)) return new Map()
  const lengths = singleSourceLength(graph, from)
  // Nearest first, then by id: a proximity map is read from the top, and ties must not depend on
  // the order the snapshot happened to arrive in.
  return new Map(
    Object.entries(lengths)
      .filter(([id, length]) => id !== from && length <= maxDepth)
      .sort(([leftId, left], [rightId, right]) => left - right || leftId.localeCompare(rightId)),
  )
}

export type ImportCycle = {
  /** The nodes of the cycle, rotated so the lexicographically smallest is first. */
  readonly nodes: readonly string[]
  readonly relationIds: readonly string[]
  readonly evidence: readonly Evidence[]
}

/** A cycle beyond this many is the same architectural problem reported again. */
export const MAX_REPORTED_CYCLES = 16

const rotated = (nodes: readonly string[]): readonly string[] => {
  let pivot = 0
  for (let index = 1; index < nodes.length; index += 1) {
    if ((nodes[index] as string) < (nodes[pivot] as string)) pivot = index
  }
  return [...nodes.slice(pivot), ...nodes.slice(0, pivot)]
}

/**
 * Import cycles, with the edges that form them.
 *
 * `graphology-dag` answers whether a cycle exists; reporting one needs the path, because a
 * diagnostic without the edges is a claim a reader cannot check. This is a depth-first search that
 * records the stack when it closes a loop, bounded in both count and depth, and deterministic
 * because the graph iterates in sorted order.
 */
export const importCycles = (
  snapshot: Pick<DiscoverySnapshotV1, 'entities' | 'relations'>,
  options: { readonly kinds?: readonly string[]; readonly limit?: number } = {},
): readonly ImportCycle[] => {
  const kinds = options.kinds ?? IMPORT_EDGE_KINDS
  const graph = buildKnowledgeGraph(snapshot, { kinds })
  if (!graph.order || !hasCycle(graph)) return []

  const relations = new Map(snapshot.relations.map((relation) => [relation.id, relation]))
  const limit = options.limit ?? MAX_REPORTED_CYCLES
  const found = new Map<string, ImportCycle>()
  const onStack = new Set<string>()
  const visited = new Set<string>()
  const stack: string[] = []

  const edgeOf = (from: string, to: string): KnowledgeRelation | undefined => {
    const attributes = graph.getEdgeAttributes(from, to) as { relationId?: string }
    return attributes.relationId ? relations.get(attributes.relationId) : undefined
  }

  const record = (cycle: readonly string[]): void => {
    const nodes = rotated(cycle)
    const key = nodes.join('→')
    if (found.has(key) || found.size >= limit) return
    const edges = nodes.map((node, index) => edgeOf(node, nodes[(index + 1) % nodes.length] as string))
    found.set(key, {
      nodes,
      relationIds: edges.flatMap((edge) => (edge ? [edge.id] : [])),
      evidence: edges.flatMap((edge) => (edge?.evidence[0] ? [edge.evidence[0]] : [])),
    })
  }

  const visit = (node: string): void => {
    if (found.size >= limit) return
    visited.add(node)
    onStack.add(node)
    stack.push(node)
    for (const next of [...graph.outNeighbors(node)].sort()) {
      if (onStack.has(next)) {
        const start = stack.indexOf(next)
        if (start >= 0) record(stack.slice(start))
        continue
      }
      if (!visited.has(next)) visit(next)
    }
    stack.pop()
    onStack.delete(node)
  }

  for (const node of [...graph.nodes()].sort()) if (!visited.has(node)) visit(node)
  return [...found.values()].sort((a, b) => a.nodes.join().localeCompare(b.nodes.join()))
}

/** Deterministic pseudo-randomness, so a community run is reproducible. */
export const seededRandom = (seed: number): (() => number) => {
  let state = seed | 0
  return () => {
    state = (state + 0x6d2b79f5) | 0
    let t = Math.imul(state ^ (state >>> 15), 1 | state)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export const DEFAULT_COMMUNITY_SEED = 20_260_401

export type AreaSuggestion = {
  /** Suggested area label, from the deepest directory the members share. */
  readonly label: string
  readonly members: readonly string[]
}

const commonDirectory = (paths: readonly string[]): string | undefined => {
  if (!paths.length) return undefined
  const split = paths.map((path) => path.split('/').slice(0, -1))
  const first = split[0] as string[]
  const shared: string[] = []
  for (let index = 0; index < first.length; index += 1) {
    const segment = first[index] as string
    if (!split.every((parts) => parts[index] === segment)) break
    shared.push(segment)
  }
  return shared.length ? shared.join('/') : undefined
}

/**
 * Area suggestions from seeded Louvain communities over the import graph.
 *
 * A community is a hypothesis: these modules move together, so perhaps they are one unit. It is
 * never an area on its own — an area is derived from the repository's own structure or declared by
 * a human, and a clustering algorithm is neither. Suggestions travel as `coverage` entries for a
 * person or the curator agent to promote into configuration, which keeps a guess out of the graph
 * while still surfacing it.
 */
export const areaSuggestions = (
  snapshot: Pick<DiscoverySnapshotV1, 'entities' | 'relations'>,
  options: { readonly seed?: number; readonly minMembers?: number; readonly limit?: number } = {},
): readonly AreaSuggestion[] => {
  const graph = buildKnowledgeGraph(snapshot, { kinds: IMPORT_EDGE_KINDS, undirected: true })
  if (graph.order < 2 || !graph.size) return []

  const communities = louvain(graph, { rng: seededRandom(options.seed ?? DEFAULT_COMMUNITY_SEED) }) as Record<string, number>
  const paths = new Map(snapshot.entities.flatMap((entity) => (entity.path ? [[entity.id, entity.path] as const] : [])))
  const grouped = new Map<number, string[]>()
  for (const [id, community] of Object.entries(communities).sort(([a], [b]) => a.localeCompare(b))) {
    const members = grouped.get(community) ?? []
    members.push(id)
    grouped.set(community, members)
  }

  const minMembers = options.minMembers ?? 3
  const suggestions: AreaSuggestion[] = []
  for (const [, members] of [...grouped.entries()].sort(([a], [b]) => a - b)) {
    if (members.length < minMembers) continue
    const label = commonDirectory(members.flatMap((id) => (paths.get(id) ? [paths.get(id) as string] : [])))
    if (!label) continue
    suggestions.push({ label, members: [...members].sort() })
  }
  return suggestions
    .sort((a, b) => b.members.length - a.members.length || a.label.localeCompare(b.label))
    .slice(0, options.limit ?? 8)
}

/**
 * Community suggestions as coverage.
 *
 * `status: 'not-analyzed'` is the honest status: the clustering ran, but whether the cluster is an
 * area is a question nobody has answered yet.
 */
export const areaSuggestionCoverage = (
  snapshot: Pick<DiscoverySnapshotV1, 'entities' | 'relations'>,
  options: { readonly seed?: number; readonly minMembers?: number; readonly limit?: number } = {},
): readonly Coverage[] => {
  const declared = new Set(
    snapshot.entities.filter((entity) => entity.kind === 'area').map((entity) => entity.path ?? ''),
  )
  return areaSuggestions(snapshot, options)
    .filter((suggestion) => !declared.has(suggestion.label))
    .map((suggestion) => ({
      analyzer: 'graph',
      analyzerVersion: GRAPH_ANALYZER_VERSION,
      scope: `area-suggestion:${suggestion.label}`,
      status: 'not-analyzed' as const,
      reason: `${suggestion.members.length} modules cluster around ${suggestion.label}; promote it to an area in configuration to make it part of the graph.`,
      evidence: suggestion.members.slice(0, 8).flatMap((id) => {
        const path = snapshot.entities.find((entity) => entity.id === id)?.path
        return path ? [{ source: 'derived' as const, path }] : []
      }),
    }))
}
