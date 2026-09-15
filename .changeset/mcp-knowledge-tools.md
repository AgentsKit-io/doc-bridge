---
'@agentskit/doc-bridge': minor
---

Answer an agent's question in one bounded MCP call, report findings in the shape the ecosystem
consumes, and stop the doctor from grading what it did not measure.

`knowledge.search { query, kinds?, limit?, explain?, budgetTokens? }` ranks the retrieval
projection with the same `searchIndex` the CLI uses — its results are what `ak-docs search`
prints for the same query and index, which a test compares — and adds a title and a body excerpt
to each. `knowledge.lookup { id | path, depth?, budgetTokens? }` returns, in one response, the
entity, its neighbours by relation kind (hierarchy included, up to three hops), the documents that
cover or mention it, the handoff `handoff.resolve` would return, the open diagnostics of the
latest reconciliation report that name it, and its evidence with excerpts. `format: 'text'` on
either renders the same payload through `formatRetrievedDocuments`.

When `budgetTokens` is present, both tools and `handoff.resolve` trim through `compileBudget`
(mirrored from `@agentskit/core`, which is an optional peer, and asserted identical to the real
function by test) in the declared order: evidence excerpts, then `related`, then neighbours, then
summaries. The response reports `tokens.total`, `fits`, the sections kept and dropped and
`tokenMethod: 'approximate'`. The entity, the evidence paths and hashes, the handoff fields and the
diagnostics are never dropped; a payload whose core exceeds the budget says `fits: false` rather
than truncating them. `AgentHandoffV1` gains an optional `budget` field. Every pre-existing tool
name, argument and payload is unchanged.

`ak-docs check --json --format finding` and `docbridge.diagnostics { format: 'finding' }` emit
every reconciliation diagnostic as a `Finding` from `@agentskit/core/finding` with severities from
`SEVERITY_ORDER` (`error → high`, `warn → medium`, `info → low`, nothing `critical`). The internal
diagnostic shapes do not change; this is a reporter.

The doctor measures three new dimensions and can lower the grade for them: reachability (the
share of the snapshot's document entities in the retrieval projection, 15 points), connectivity
(areas with a covering or mentioning document and documents with an edge into code, 15 points)
and the retrieval benchmark hit@3 over the golden suite at `retrieval.benchmark.suite` (10
points, `not-analyzed` and zero when no suite exists). The existing dimensions are rebalanced to
the remaining sixty. An A requires reachability at 100%, connectivity at 80% or more and a measured
hit@3 of 80% or more; on this repository the grade falls from 100/100 (A) to 91/100 (B), because
20 of 39 areas have no document about them and 55 of 100 documents do not point at code. The
doctor's `ok` and exit code are unchanged.
