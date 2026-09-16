---
'@agentskit/doc-bridge': minor
---

Compute graph signals with a graph library instead of ad-hoc counting, and expose the repository
graph through the ecosystem memory contract.

`centrality-risk` in the rules engine derived from the number of undocumented-relation findings
attached to an entity — documentation debt wearing the name of an architectural signal. A module
every import path runs through scored zero if it happened to be documented. It is now betweenness
over the import graph, and without a graph the rule reports nothing rather than reporting the wrong
thing under a name people act on. On this repository it flags `src/cli/program.ts` first, which is
the correct answer and one the old heuristic never gave.

`src/graph/build.ts` adds, on graphology:

- **canonicality** from PageRank over `links-to` and `covers`, so a documentation entry point
  outranks a leaf page;
- **centrality** from normalized betweenness over `imports` and `re-exports`;
- **proximity** from bounded shortest paths, excluding `contains`, which is hierarchy and would put
  every module in an area two hops from every other one;
- **import cycles** with every edge that forms them as evidence, reported as a new `IMPORT_CYCLE`
  diagnostic — this repository has exactly one, between two `src/doctor` modules;
- **area suggestions** from seeded Louvain communities, emitted only as `coverage` with
  `analyzer: graph` and `scope: area-suggestion:<path>`, status `not-analyzed`. A clustering
  algorithm does not get to name the architecture.

`createDocBridgeGraphMemory(snapshot, overlay)` in `src/graph/memory.ts` projects the graph behind
`GraphMemory` from `@agentskit/memory`, so an agent built on AgentsKit walks repository structure
with the same `getNode`, `findEdges` and `neighbors` calls it uses for its own memory. Writes land
in a working layer above the projection and deletes mask rather than erase: the snapshot is an
observation, and nothing a caller writes should be mistaken for something the repository said.

The graph is never serialised and `DiscoverySnapshotV1` is unchanged. Insertion is sorted and every
score rounded, so metrics are identical across runs and after the input order is shuffled.
`pipelineVersion` becomes `1.4.0` with a `graph` analyzer version.
