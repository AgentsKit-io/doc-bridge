---
type: package
package: '@agentskit/doc-bridge'
editRoot: src
humanDoc: /docs/POSITIONING
owner: doc-bridge-maintainers
lifecycle: active
sourceOfTruth: src
validationPath: pnpm test && pnpm typecheck
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

A file-backed entity carries its file's hash, and a second scan may reuse an entity whose hash is
unchanged — but only while the universe its references resolve against is identical, and only from
a snapshot produced by this pipeline, these analyzers and this configuration. Reuse either
reproduces a cold scan exactly or it is refused, and the run reports what it reused as `coverage`.

Markdown for people is rendered from templates in `src/render/`, never concatenated: a template
sees only the variables `src/render/data.ts` computes, sorted and without timestamps, and the
synchronous evaluator in `src/render/engine.ts` must keep rendering what knap renders. Every
generated region carries a `<!-- doc-bridge:generated hash=… -->` marker so the analyzer skips it
and the audit can report a hand edit inside it; `llms.txt` is the exception and stays byte-identical.
Enrichment (`src/enrich/`, `src/schemas/enrichment.ts`) is advisory by construction. A proposal is
a typed claim with one deterministic validator per kind; a validator checks, it never judges. An
accepted entry binds to the content hash of the entity it describes and expires when that moves;
no entry deletes or alters observed data, and the projection asserts it. The overlay is read only
while `intelligence.registry.enabled` is true, a read never writes, and a corrupt overlay is no
overlay. No agent approves anything — not its own output, not another's — and human approvals go
through the ecosystem approval gate. Adding a proposal kind means a schema, a validator, a policy,
a valid fixture and a rejection fixture, and a row in `docs/spec/enrichment-overlay-v1.md`.

An enrichment run reports its own shape (`src/enrich/stats.ts`): counts per kind, a rejection
histogram, invented references counted apart from other rejections, cost, and stability against the
previous run. `stats` stays outside the overlay's content hash — two runs that decided identically
must agree on their hash while disagreeing about how long they took. The overlay may leave retrieval
unchanged or improve it; it may not lower hit@3, and `measureOverlayRetrievalDelta`
(`src/bench/overlay-delta.ts`) projects both indexes from one snapshot so the only difference
between the two runs is the overlay. A drop is a finding about the agent, never a new baseline.
See [Measured enrichment v1](../spec/measured-enrichment-v1.md).
