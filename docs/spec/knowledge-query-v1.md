---
title: Knowledge query v1
description: Exact deterministic why queries with bounded evidence and coverage.
---

# Knowledge query v1

`ak-docs why <path|symbol|concept> [--json]` reads the fresh local index;
text is the default. `knowledgeWhy` exposes the same deterministic query API.
No provider, network, history subprocess or filesystem read runs in the query.
Enable `index.knowledgeEntities.enabled: true`, then run `ak-docs index`.
The default semantic hash supports this opt-in; legacy hashing does not.
Absent entities return successful actionable enablement guidance, not an
unknown-target error. An enabled index with no match returns empty observations
and extraction coverage; absence is not proof that no rationale exists.

## Matching and evidence

Targets match exact case-sensitive entity IDs, names, aliases, indexed paths
and exported symbols. Linked affected paths/facts and defined symbols connect
concepts to decisions and changes. No fuzzy owner selection or inferred
causality is performed. Decisions retain observed status and supersession links;
concepts retain aliases; changes retain bounded indexed changelog/commit evidence.
Results retain all entity evidence and links. Indexed documents covering or
mentioning a resolved target carry their indexed ID, path, content hash and
citation context naming the resolved indexed paths. Module-level projection
citations remain module-level evidence for symbol queries; they do not prove a
specific symbol mention or claim line-level evidence.
Entity document regions retain exact lines and region hashes.

## Response

`KnowledgeWhyResponseV1Schema` validates the public response:
`type: knowledge-why`, `schemaVersion: 1`, `source: index:<hash>`, `target`,
`enabled`, optional `guidance`, `entities`, `documents`, `coverage`, `truncated`.
Entities use KnowledgeEntityV1; coverage describes supported extraction and
history windows. Arrays sort by ID and default to 20 results each, maximum 100.
Limits set `truncated`; extraction coverage remains visible.
Optional `budgetTokens` uses the existing budget policy, adding `budget` and
retaining entity/document observations and their evidence as the required core.
A budget below this evidence floor reports `fits: false`; use `limit` to reduce
result counts without orphaning evidence.

## MCP and service

Read-only tools `knowledge.decision`, `knowledge.concept`, and
`knowledge.whyChanged` accept `{target, limit?, budgetTokens?, format?}`.
`format` is `json` (default) or `text`; each tool filters the same query by kind.
Invalid/unknown arguments fail at the typed trust boundary.
Service tools require injected index reads. Stored queries use captured entities;
service queries omit commit entities and mark history `not-analyzed`, even if a
caller supplied an index with local history. No local history fallback exists.
Service configuration disables entity extraction; absent sections explain how
to provide an enabled stored index. `ak-docs --profile service why <target>`
returns the same enablement diagnostic under that ceiling.

## Optional chat

The existing provider-configured `ak-docs ask <question> --chat` includes up to
eight name/alias occurrences as entity data and requests entity-ID citations.
Entity bounds limit context; this does not guarantee model correctness.
The deterministic why query remains independent of chat and providers.

## Validation

`pnpm exec vitest run tests/knowledge-query.test.ts --maxWorkers=2` exercises
CLI/MCP parity, aliases, path/symbol evidence, status/supersession, bounded
results/budgets, disabled entities and service history denial on real fixtures.
