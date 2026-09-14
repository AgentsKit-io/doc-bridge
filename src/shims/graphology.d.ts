/**
 * graphology under `moduleResolution: NodeNext`.
 *
 * These packages ship CommonJS type declarations with an ESM-style `export default`. Node loads
 * their ESM build (they declare an `import` condition) and gets the class or function, but
 * TypeScript reads the CommonJS declarations and types the default import as the module namespace
 * — so `new Graph()` reads as "not constructable" and `pagerank(graph)` as "not callable", both
 * wrongly. The packages publish one `types` path for both conditions, so there is nothing to
 * select.
 *
 * Rather than cast at every call site, this declares the surface the graph layer actually uses,
 * the way it behaves at runtime. It is deliberately narrow: nothing here is a guess, every
 * signature is exercised by `tests/graph.test.ts` against real numeric expectations, so a drift
 * from the library fails a test rather than hiding behind a cast.
 */

declare module 'graphology' {
  export type GraphologyAttributes = Record<string, unknown>

  export type GraphologyOptions = {
    readonly type?: 'directed' | 'undirected' | 'mixed'
    readonly multi?: boolean
    readonly allowSelfLoops?: boolean
  }

  export interface GraphologyGraph {
    readonly order: number
    readonly size: number
    hasNode(node: string): boolean
    addNode(node: string, attributes?: GraphologyAttributes): string
    hasEdge(source: string, target: string): boolean
    addEdge(source: string, target: string, attributes?: GraphologyAttributes): string
    getEdgeAttributes(source: string, target: string): GraphologyAttributes
    nodes(): string[]
    edges(): string[]
    outNeighbors(node: string): string[]
    neighbors(node: string): string[]
  }

  const Graph: new (options?: GraphologyOptions) => GraphologyGraph
  export default Graph
}

declare module 'graphology-metrics/centrality/pagerank.js' {
  import type { GraphologyGraph } from 'graphology'

  const pagerank: (
    graph: GraphologyGraph,
    options?: {
      readonly getEdgeWeight?: string | null
      readonly alpha?: number
      readonly maxIterations?: number
      readonly tolerance?: number
    },
  ) => Record<string, number>
  export default pagerank
}

declare module 'graphology-metrics/centrality/betweenness.js' {
  import type { GraphologyGraph } from 'graphology'

  const betweennessCentrality: (
    graph: GraphologyGraph,
    options?: { readonly getEdgeWeight?: string | null; readonly normalized?: boolean },
  ) => Record<string, number>
  export default betweennessCentrality
}

declare module 'graphology-shortest-path/unweighted.js' {
  import type { GraphologyGraph } from 'graphology'

  export function singleSourceLength(graph: GraphologyGraph, source: string): Record<string, number>
  export function bidirectional(graph: GraphologyGraph, source: string, target: string): string[] | null
}

declare module 'graphology-dag/has-cycle.js' {
  import type { GraphologyGraph } from 'graphology'

  const hasCycle: (graph: GraphologyGraph) => boolean
  export default hasCycle
}

declare module 'graphology-communities-louvain' {
  import type { GraphologyGraph } from 'graphology'

  const louvain: (
    graph: GraphologyGraph,
    options?: { readonly rng?: () => number; readonly resolution?: number; readonly randomWalk?: boolean },
  ) => Record<string, number>
  export default louvain
}
