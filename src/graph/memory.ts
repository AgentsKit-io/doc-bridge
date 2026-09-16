import type { DiscoverySnapshotV1, KnowledgeEntity, KnowledgeRelation } from '../schemas/knowledge.js'

/**
 * The repository graph behind the ecosystem's `GraphMemory` contract.
 *
 * An agent built on AgentsKit already walks its own memory with `getNode`, `findEdges` and
 * `neighbors`. This exposes the repository's structure through the same three calls, so asking
 * "what does this module import, and what documents cover it" needs no Doc Bridge-specific client.
 *
 * The contract is mirrored rather than imported: `@agentskit/memory` is an optional peer, and a
 * projection that only typechecked when an optional package happened to be installed would be a
 * published type that breaks on a clean install. `tests/graph.test.ts` asserts this implementation
 * is assignable to the real `GraphMemory` and behaves like `createInMemoryGraph` on the same
 * inputs, so the mirror cannot drift.
 */

export type GraphNode<TProps = Record<string, unknown>> = {
  id: string
  /** Type or label — here the entity kind: `module`, `document`, `area`, `package`. */
  kind: string
  properties?: TProps
  createdAt?: string
  updatedAt?: string
}

export type GraphEdge<TProps = Record<string, unknown>> = {
  id: string
  /** Verb — here the relation kind: `imports`, `covers`, `links-to`, `contains`. */
  label: string
  from: string
  to: string
  weight?: number
  properties?: TProps
}

export type GraphQuery = {
  kind?: string
  label?: string
  from?: string
  to?: string
}

export type GraphMemory = {
  upsertNode: <T>(node: GraphNode<T>) => Promise<GraphNode<T>>
  upsertEdge: <T>(edge: GraphEdge<T>) => Promise<GraphEdge<T>>
  getNode: <T>(id: string) => Promise<GraphNode<T> | null>
  findNodes: <T>(query?: GraphQuery) => Promise<GraphNode<T>[]>
  findEdges: <T>(query?: GraphQuery) => Promise<GraphEdge<T>[]>
  /** Breadth-first neighbours of `id` up to `depth`, in both directions. Default 1. */
  neighbors: <T>(id: string, options?: { depth?: number; label?: string }) => Promise<GraphNode<T>[]>
  deleteNode: (id: string) => Promise<void>
  deleteEdge: (id: string) => Promise<void>
  clear?: () => Promise<void>
}

/**
 * Extra entities and relations layered over the observed snapshot.
 *
 * Same vocabulary as the snapshot, so the approved enrichment overlay plugs in unchanged when it
 * exists. Overlay records win over observed ones with the same id, which is what "approved" has to
 * mean for it to be worth approving.
 */
export type KnowledgeOverlay = {
  readonly entities?: readonly KnowledgeEntity[]
  readonly relations?: readonly KnowledgeRelation[]
}

const nodeOf = (entity: KnowledgeEntity): GraphNode => ({
  id: entity.id,
  kind: entity.kind,
  properties: {
    name: entity.name,
    ...(entity.path !== undefined ? { path: entity.path } : {}),
    provenance: entity.provenance,
    ...(entity.aliases?.length ? { aliases: [...entity.aliases] } : {}),
    ...(entity.metadata ?? {}),
    evidenceCount: entity.evidence.length,
  },
})

const edgeOf = (relation: KnowledgeRelation): GraphEdge => ({
  id: relation.id,
  label: relation.kind,
  from: relation.from,
  to: relation.to,
  properties: {
    provenance: relation.provenance,
    ...(relation.discriminator !== undefined ? { discriminator: relation.discriminator } : {}),
    ...(relation.metadata ?? {}),
    evidenceCount: relation.evidence.length,
  },
})

const matchesNode = (node: GraphNode, query?: GraphQuery): boolean => !query?.kind || node.kind === query.kind

const matchesEdge = (edge: GraphEdge, query?: GraphQuery): boolean => {
  if (!query) return true
  if (query.label && edge.label !== query.label) return false
  if (query.from && edge.from !== query.from) return false
  if (query.to && edge.to !== query.to) return false
  return true
}

/**
 * Project a snapshot, and an optional overlay, as a `GraphMemory`.
 *
 * Writes are accepted and kept in process: the snapshot is an observation and cannot be edited by
 * a caller, so `upsertNode` and `upsertEdge` land in a working layer above it and `deleteNode`
 * masks rather than erases. That keeps the contract honest in both directions — an agent can
 * annotate what it is exploring without any of it being mistaken for something the repository
 * said. `clear` drops the working layer, never the projection.
 */
export const createDocBridgeGraphMemory = (
  snapshot: Pick<DiscoverySnapshotV1, 'entities' | 'relations'>,
  overlay: KnowledgeOverlay = {},
): GraphMemory => {
  const projectedNodes = new Map<string, GraphNode>()
  const projectedEdges = new Map<string, GraphEdge>()
  for (const entity of [...snapshot.entities, ...(overlay.entities ?? [])]) projectedNodes.set(entity.id, nodeOf(entity))
  for (const relation of [...snapshot.relations, ...(overlay.relations ?? [])]) projectedEdges.set(relation.id, edgeOf(relation))

  const writtenNodes = new Map<string, GraphNode>()
  const writtenEdges = new Map<string, GraphEdge>()
  const maskedNodes = new Set<string>()
  const maskedEdges = new Set<string>()

  const nodes = (): GraphNode[] => {
    const merged = new Map(projectedNodes)
    for (const [id, node] of writtenNodes) merged.set(id, node)
    for (const id of maskedNodes) merged.delete(id)
    return [...merged.values()].sort((a, b) => a.id.localeCompare(b.id))
  }

  const edges = (): GraphEdge[] => {
    const merged = new Map(projectedEdges)
    for (const [id, edge] of writtenEdges) merged.set(id, edge)
    for (const id of maskedEdges) merged.delete(id)
    return [...merged.values()]
      .filter((edge) => !maskedNodes.has(edge.from) && !maskedNodes.has(edge.to))
      .sort((a, b) => a.id.localeCompare(b.id))
  }

  return {
    async upsertNode<T>(node: GraphNode<T>): Promise<GraphNode<T>> {
      const now = new Date().toISOString()
      const existing = writtenNodes.get(node.id) ?? projectedNodes.get(node.id)
      const merged = { ...(existing ?? {}), ...node, createdAt: existing?.createdAt ?? now, updatedAt: now }
      maskedNodes.delete(node.id)
      writtenNodes.set(node.id, merged as GraphNode)
      return merged as GraphNode<T>
    },
    async upsertEdge<T>(edge: GraphEdge<T>): Promise<GraphEdge<T>> {
      maskedEdges.delete(edge.id)
      writtenEdges.set(edge.id, edge as GraphEdge)
      return edge
    },
    async getNode<T>(id: string): Promise<GraphNode<T> | null> {
      if (maskedNodes.has(id)) return null
      const node = writtenNodes.get(id) ?? projectedNodes.get(id)
      return node ? ({ ...node } as GraphNode<T>) : null
    },
    async findNodes<T>(query?: GraphQuery): Promise<GraphNode<T>[]> {
      return nodes().filter((node) => matchesNode(node, query)).map((node) => ({ ...node }) as GraphNode<T>)
    },
    async findEdges<T>(query?: GraphQuery): Promise<GraphEdge<T>[]> {
      return edges().filter((edge) => matchesEdge(edge, query)).map((edge) => ({ ...edge }) as GraphEdge<T>)
    },
    async neighbors<T>(id: string, options: { depth?: number; label?: string } = {}): Promise<GraphNode<T>[]> {
      const depth = Math.max(1, options.depth ?? 1)
      const all = edges().filter((edge) => !options.label || edge.label === options.label)
      const visited = new Set([id])
      let frontier = new Set([id])
      for (let step = 0; step < depth; step += 1) {
        const next = new Set<string>()
        for (const edge of all) {
          if (frontier.has(edge.from) && !visited.has(edge.to)) next.add(edge.to)
          if (frontier.has(edge.to) && !visited.has(edge.from)) next.add(edge.from)
        }
        for (const node of next) visited.add(node)
        frontier = next
        if (!next.size) break
      }
      visited.delete(id)
      const byId = new Map(nodes().map((node) => [node.id, node]))
      return [...visited]
        .sort()
        .flatMap((nodeId) => {
          const node = byId.get(nodeId)
          return node ? [{ ...node } as GraphNode<T>] : []
        })
    },
    async deleteNode(id: string): Promise<void> {
      writtenNodes.delete(id)
      maskedNodes.add(id)
      for (const edge of edges()) if (edge.from === id || edge.to === id) maskedEdges.add(edge.id)
    },
    async deleteEdge(id: string): Promise<void> {
      writtenEdges.delete(id)
      maskedEdges.add(id)
    },
    async clear(): Promise<void> {
      writtenNodes.clear()
      writtenEdges.clear()
      maskedNodes.clear()
      maskedEdges.clear()
    },
  }
}
