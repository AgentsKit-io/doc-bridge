---
'@agentskit/doc-bridge': minor
---

Let a Registry agent enrich the knowledge graph without ever becoming an authority over it.

`EnrichmentProposalV1` is a discriminated union of eleven typed claims — classify a document,
summarize it, add an alias or an intent, mark it canonical for a scope, propose a relation, flag a
contradiction, a redundancy or a gap, hint at relevance, suggest an area — each with its own
deterministic validator and its own policy: low-risk kinds are accepted by policy, structural kinds
wait for a person, a gap is accepted as a finding and never as a fact, and an unknown kind is
rejected as `invalid-kind`. A proposal with no evidence, an unknown entity, an unknown diagnostic or
evidence outside the supplied artifacts is rejected at the boundary. `proposalId` is derived from
content, so re-running enrichment over an unchanged repository produces no duplicate entries.

`EnrichmentOverlayV1` at `.doc-bridge/enrich/overlay.json` stores what became of every proposal:
`accepted` with `acceptedAt` and `acceptedBy` (`policy` or a person, never the author), `pending`
with its approval id, `rejected` with a reason, and `stats` by kind. Each entry binds to the content
hash of the entity it describes: one changed file expires one entry at projection time, its siblings
survive, and a read never rewrites the file. Re-running the validators over a stored overlay
reproduces its partition.

A new workflow stage `enrich` sits between `reconcile` and `evaluate` and runs only from
`ak-docs enrich` or `check --enrich`. Agents receive context packs — one entity, its depth-one
neighbours, the open diagnostics that touch it and a redacted excerpt, under a 64 KB budget
(`intelligence.registry.maxPackBytes`) — over protocol `doc-bridge.registry-agent.v2`, batched by
area. Answers are cached under `.doc-bridge/enrich/cache/` keyed on task, agent identity and
version, prompt version and pack hash, so an unchanged repository makes zero agent calls and a
one-document change re-runs only the affected packs. Roles are configuration under
`intelligence.registry.roles` — curator for documents, reviewer for structure, adjudicator for
canonical conflicts and disputed contradictions, which must be a different identity and may never
judge its own proposals — and the default remains the existing corpus scanner as curator only.

Human approvals go through `createApprovalGate` from `@agentskit/core/hitl` over a file-backed
store under `.doc-bridge/approvals/`, shared by `ak-docs enrich approve|reject`, `ak-docs fix
approve` and MCP `docbridge.proposals` (`enrich-list`, `enrich-approve`, `enrich-reject`), bound to
both the proposal id and the target content hash. An approver equal to the author is refused.

Accepted entries enter the retrieval projection: aliases, summaries where a document has none,
intents and relations with `provenance: proposed` (drawn dashed in the HTML report), canonical
markers and rank hints as a per-entry signal worth at most 15 percent of the exact-id boost, so an
exact identifier match always outranks an overlay-boosted entry. With the Registry disabled, absent,
timing out or answering garbage, `check`, `index`, `search`, `query` and MCP are byte-identical to a
run with no overlay, and every observed entity and relation survives enrichment unchanged.
