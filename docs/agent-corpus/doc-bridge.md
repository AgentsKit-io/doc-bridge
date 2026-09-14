---
type: package
package: '@agentskit/doc-bridge'
editRoot: src
humanDoc: /docs/POSITIONING
---

# Doc Bridge core

Owns the public CLI, index, MCP, gates, and doctor contracts. Preserve deterministic behavior and run `pnpm test && pnpm typecheck`.

Analyzers emit `observed` facts with file and line evidence, and say what they could not resolve
as coverage rather than guessing: an ambiguous reference produces a note, not an edge. A near-miss
resolves only at the Jaro-Winkler threshold with a single candidate. Adding an analyzer means
adding its version to `analyzerVersions` and bumping `pipelineVersion`, never changing the
`DiscoverySnapshotV1` envelope.

Areas (`area:<dir>`) are the unit between a package and a file. Each module belongs to exactly
one — the most specific — so containment is a tree and area-scope aggregation has one answer per
module. An ownership path is an area by declaration even when convention would not derive it.

Graph signals live in `src/graph/` and are computed on demand, never stored: sort node and edge
insertion before any metric, round every score, and keep graphology's format out of every artifact.
A clustering result is a suggestion in `coverage`, never an entity. A static signal must not be
worded as a runtime claim.
