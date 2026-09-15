---
title: Graph signals v1
description: What Doc Bridge computes from the repository graph, what each signal means, and what it deliberately does not claim.
---

# Graph signals v1

The knowledge snapshot is a graph, and some questions are only answerable as graph questions: which
document is the entry point, which module every change reaches through, which directories move
together, where the imports run in a circle.

These are computed with [graphology](https://graphology.github.io) from the snapshot, on demand.
The graph is a working structure: it is never serialised, `DiscoverySnapshotV1` does not change, and
graphology's own format never reaches disk. Nodes and edges are inserted in sorted order and every
score is rounded before it is returned, so two runs over the same snapshot agree exactly — including
after the input order is shuffled.

## The signals

| Signal | Computed from | Over |
| --- | --- | --- |
| **Canonicality** | PageRank | `links-to` and `covers` |
| **Centrality** | betweenness, normalized | `imports` and `re-exports` |
| **Proximity** | bounded shortest path | imports, documentation, `mentions`, `depends-on` |
| **Import cycles** | depth-first search | `imports` and `re-exports` |
| **Area suggestions** | seeded Louvain communities | `imports` and `re-exports` |

External and unresolved endpoints are left out unless a caller asks for them: a dependency on a
third-party package is a fact about the repository, not a part of its architecture.

**Canonicality** answers where a reader should start. A page many documents link to, or that covers
many entities, outranks a leaf note nothing points at — however recently the leaf was edited.

**Centrality** answers how much of the dependency structure runs through one module. It is a review
signal: a change there reaches further than its diff suggests. It is *not* a statement about runtime
availability, and the diagnostic says so, because "single point of failure" is a claim about
deployment that a static import graph cannot make.

**Proximity** answers how many hops apart two entities are, bounded — three by default. Unbounded
proximity is not useful: at ten hops everything is related to everything. `contains` is excluded on
purpose. It is hierarchy, and including it puts every module in an area two hops from every other
one, which is true and tells a reader nothing.

**Import cycles** are reported with every edge that forms them. `graphology-dag` answers whether a
cycle exists; reporting one needs the path, because a diagnostic whose loop a reader cannot trace is
a claim rather than a finding. The search is bounded in count, and the cycle is rotated so the
lexicographically smallest node comes first — the same cycle found from two different entry points
is one finding.

## Area suggestions are suggestions

A Louvain community is a hypothesis: these modules move together, so perhaps they are one unit. It
never becomes an [area](./config-v1.md#analysisareas-optional) on its own. An area is derived from
the repository's own structure or declared by a human, and a clustering algorithm is neither.

Suggestions travel as `coverage` entries with `analyzer: graph`, `scope: area-suggestion:<path>` and
status `not-analyzed` — the honest status, because the clustering ran but whether the cluster is an
area is a question nobody has answered. A directory that is already an area produces no suggestion.
Community detection draws from a seeded generator, so a suggestion is reproducible rather than a
different guess each run.

## Reading the graph as memory

```ts
import { createDocBridgeGraphMemory } from '@agentskit/doc-bridge'

const graph = createDocBridgeGraphMemory(snapshot)
await graph.getNode('module:src/mcp/server.ts')
await graph.findEdges({ label: 'covers', to: 'area:src/mcp' })
await graph.neighbors('module:src/mcp/server.ts', { depth: 2 })
```

This satisfies `GraphMemory` from `@agentskit/memory`, so an agent built on AgentsKit walks
repository structure with the same three calls it uses for its own memory. A second argument layers
extra entities and relations over the observation, in the snapshot's own vocabulary, so an approved
enrichment overlay plugs in unchanged.

Writes are accepted and kept in process. The snapshot is an observation and a caller cannot edit it,
so `upsertNode` lands in a working layer above the projection and `deleteNode` masks rather than
erases — an agent can annotate what it is exploring without any of it being mistaken for something
the repository said. `clear()` drops the working layer and leaves the projection intact.

## What consumes them

`centrality-risk` in the rules engine is betweenness now. It used to count how many
undocumented-relation findings were attached to an entity, which measures documentation debt and
calls it architecture: a module every import path runs through scored zero if it happened to be
documented. Without a graph the rule reports nothing at all, which is better than reporting the
wrong thing under a name people act on.

The rule's threshold reads as a rank when it is 1 or more — `3` means "flag the three most central
entities" — and as a minimum betweenness when it is below 1.
