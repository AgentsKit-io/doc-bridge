---
title: StudioGraphV1
description: Bounded deterministic graph and review inbox for local studio consumers.
owner: maintainers
lifecycle: active
sourceOfTruth: src/schemas/studio-graph.ts
validationPath: pnpm vitest run tests/studio.test.ts --maxWorkers=2
---

# StudioGraphV1

`StudioGraphV1Schema` is the strict runtime validator; `StudioGraphV1JsonSchema`
is its JSON Schema projection. Both and the TypeScript types are public exports.
The top-level `type` is `studio-graph`, `schemaVersion` is `1`. Unknown versions
and fields are rejected. This separate presentation artifact does not change
`DocBridgeIndexV1` or `AgentHandoffV1`.

| Field | Meaning |
| --- | --- |
| `source` | Project name, source index hash and its supported declared algorithm; optional caller-supplied exact revision SHA. No filesystem root. A dirty-tree export must omit revision. |
| `nodes` | Stable `id`, `label`, `kind`, optional repository-relative `path`, `sourceKind`, `areaId`, `cluster`, real `timestamps`, and `metrics`. |
| `edges` | Stable `id`, `from`, `to`, `kind`, positive `weight` up to 1, optional original `sourceKind`. Every endpoint exists in emitted nodes. |
| `findings` | Reference code plus the original strict `FindingV1`, retaining status, routing, evidence, revision/configuration binding and `documentationUpdate: updated-in-this-change`. |
| `proposals` | Stable `id`, `kind` (`overlay` or `vault-diff`), `targetIds`, `label`, `evidenceHash`, `status`, optional `prUrl`. Targets may be absent from the bounded graph. |
| `coverage` | Entity feature enabled/disabled, original `entityAnalysis` coverage (up to 32 records), supplied/not-analyzed inbox inputs and explicit limitations. An absent finding input does not mean no drift. |
| `truncation` | Each collection and documents separately report `total`, `emitted`, `omitted`; total equals emitted plus omitted. |

Node kinds are `package`, `area`, `document`, `symbol`, `fact`, `decision`,
`concept`, `change`, `human-note`. Retrieval modules are facts with
`sourceKind: module`. Exported symbols use the existing change-set identity
`entityId('symbol', moduleId + ':' + exportName)` and the module's path, without
invented declaration coordinates. Human notes require explicit exact paths
via `--human-note`; a file's location alone does not establish authorship.
Legacy indexes project document nodes and explicitly lack graph metrics.
Generic configuration/signature/CLI adapter facts are not present in the
retrieval index and are not invented by this exporter.

Edge kinds include `links-to`, `mentions`, `owns`, `cites`, `supersedes`,
`changed-by`, `explains`, plus native `imports`, `re-exports`, `depends-on`,
`covers` to preserve architectural signals. Retrieval `contains` maps to
`owns` and `mentions-symbol` maps to `mentions`, retaining `sourceKind`.
Retrieval references to a module remain module references: the bounded index
cannot reconstruct historical cited-symbol evidence. All exported weights
are currently 1; confidence is not silently converted into weight.
Knowledge entities cite their evidence documents, explain exact affected
facts/paths, supersede exact entities, or receive incoming `changed-by` edges.
Unresolved/external endpoints never become invented nodes.

`metrics.canonicality` is the existing index PageRank over documentation
links/covers, **before studio truncation**. `metrics.centrality` is normalized
betweenness over emitted imports/re-exports using the existing graph helper;
it is absent for nodes outside that graph. `metrics.degree` counts incident
emitted edges (a self-loop once). Missing metrics mean unavailable, not zero.
`areaId` and `cluster` refer only to emitted nodes; truncated groups are omitted.
`timestamps.authored` accepts a real declared ISO date from a knowledge entity;
`timestamps.committed` reserves a real ISO instant for future consumers. No
scan time, guessed commit time, or filesystem modification time is generated.

Finding codes are `BROKEN_REFERENCE`, `AMBIGUOUS_REFERENCE`, `CHANGED_REFERENCE`.
Only matching engine finding categories project into this reference inbox;
other findings are outside this view. The export never diagnoses a broken
reference from failed resolution. `updated-in-this-change` reports an edit;
it does not resolve a remaining finding. Proposal statuses are `proposed`,
`accepted`, `in-review`, `merged`, `rejected`, `stale`, `superseded`. They are
presentation state copied from validated inputs, not engine authorization.
Native `vault-edit` enrichment proposals map to `kind: vault-diff`, including
accepted, pending and rejected records from the overlay produced by `ak-docs vault diff`.
A supplied overlay is not revalidated against current evidence by this command.

## Bounds and determinism

`STUDIO_LIMITS` caps nodes at 800, documents/human notes at 300, edges at 2,000,
findings and proposals at 100 each, and pretty-printed UTF-8 output including
newline at 2,000,000 bytes. Within each kind, IDs sort by code point, never locale. Selection interleaves
kind buckets by ordinal then ID so big module collections do not crowd out
packages, areas or history. Document caps precede node caps; emitted arrays
sort by ID. Dangling edges and group references are removed.
If bounded text still exceeds the byte budget, remove proposals, then findings,
then edges, then nodes from the end, updating counts. Metrics are computed
only after final graph selection. There is no random clustering or network.
Symbol expansion retains at most the first 800 candidates in canonical module-ID
and export-name order, counting all omitted symbols and their ownership edges.
This avoids expanding millions of symbol nodes before the output cap.
Source entity IDs are unchanged; relation IDs use the shared identity helper.
Run timestamps are omitted, so identical inputs/options produce identical bytes.
An explicit revision is provenance, never a new identity or approval binding.

## Search and why

`StudioSearchV1` has `type: studio-search`, `schemaVersion: 1`, `indexHash`,
`query` (up to 1,024 characters), and at most 100 `results`. Each contains
`nodeId`, `label`, finite `score`, and optional `why` with `matched` field terms,
`components` scoring numbers and optional `surfacedBy: { kind, id }`.
`searchStudioGraph(index, graph, query)` reuses deterministic engine ranking
with explanations and filters to emitted nodes; it rejects a mismatched index hash or hash algorithm.
This is ranked index search, not a claim that history entities have lexical
ranking. A UI may separately filter labels for decision/concept/change nodes.

`StudioWhyV1` has `type: studio-why`, `schemaVersion: 1`, `indexHash`, `node`,
incident `edges`, `findingIds`, and `proposalIds`. `whyStudioNode(graph, id)`
returns that bounded entity page or throws for unavailable IDs. Explain that
truncation can hide neighbors; no result may imply an exhaustive repository map.
