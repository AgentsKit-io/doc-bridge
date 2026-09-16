---
title: Enrichment overlay v1
description: Typed agent proposals, the deterministic validators that decide them, the overlay that stores the decisions, and how little of it the deterministic layer is allowed to feel.
---

# Enrichment overlay v1

A Registry agent may enrich the knowledge graph. It may never become an authority over it.

`AgentProposalV1` could say "review this finding". It could not say that a document is canonical
for an area, that an alias should resolve to an entity, or that a relation exists with a given
confidence — and nothing stored what it said, nothing consumed it, the deterministic cache was an
in-process `Map`, and `ak-docs suggest` sent the whole redacted snapshot, 740 KB on this
repository, in one call. This document is the replacement: proposals typed per claim, decided by
validators that have no judgement to exercise, stored in an overlay bound to the content hash of
what each entry describes, and projected into retrieval with an influence that is bounded by
construction.

## Typed proposals

`EnrichmentProposalV1` in `src/schemas/enrichment.ts` is a discriminated union on `kind`. The
envelope is the same for every kind:

| Field | Meaning |
| --- | --- |
| `proposalId` | The hash of kind, entity, target content hash, agent identity, prompt version — and, for kinds one entity can carry several of, the payload field that tells them apart (`alias`, `phrase`, the relation's `to` and `kind`, `against`, `with`, `area` and `missing`, `directories`). A re-run over unchanged inputs produces the same id; a summary is a slot, an alias is a set. |
| `entity` | Must exist in the snapshot the proposal was made against. |
| `targetContentHash` | The entity's content hash at proposal time: the file hash for a file-backed entity, a hash of the entity as recorded for an area. The entry expires when it moves. |
| `confidence`, `reason` | 0..1, and up to 1 000 characters. |
| `evidence` | At least one item, and every item present — by source, path and lines — in the snapshot or the report. |
| `relatedDiagnosticIds` | Optional; every id must exist in the report. |
| `origin` | `agentId`, `agentVersion`, `promptVersion`, and optionally `model` and `provider`. |
| `baseSnapshotHash` | The snapshot it was made against. |
| `payload` | Per kind, below. |

| Kind | Payload | Deterministic validator | Policy |
| --- | --- | --- | --- |
| `classify-document` | `type`, `audience`, `lifecycle`, `criticality` | enumerated values; the entity is a document | accept by policy |
| `summarize` | `summary` ≤ 400 chars, `language` | length; redaction scan; differs from the current summary | accept by policy |
| `add-alias` | `alias` ≤ 64 chars | no collision with an id, name, title, filename stem or alias — exact, or Jaro-Winkler ≥ 0.95 | accept by policy |
| `add-intent` | `phrase` ≤ 120 chars, `language` | length; language tag present | accept by policy |
| `mark-canonical` | `scope` | the scope exists; the entity is a document; at most one canonical document per scope after the merge — a second one is a `canonical-conflict` | human approval |
| `propose-relation` | `from`, `to`, `kind`, `detection` | both endpoints exist; the kind is one of `covers`, `mentions`, `links-to`, `depends-on`, `related-to`, `documents`; not already observed; every evidence item lies inside one endpoint | human approval |
| `flag-contradiction` | `against`, `claim`, `observed` | both entities exist; evidence inside both | human approval |
| `flag-redundancy` | `with` | both are documents; not already exact duplicates | human approval |
| `flag-gap` | `area`, `missing` | the area exists; not already flagged with the same text | accepted as a finding, never as a fact |
| `rank-hint` | `relevance`: `strong` or `weak` | the entity exists | accept by policy, bounded weight |
| `suggest-area` | `directories`, `name` | every directory exists; no overlap with an existing area | human approval, then configuration, never an entity |

Any other kind is recorded as rejected with reason `invalid-kind`. The full reason list is
`ENRICHMENT_REJECTION_REASONS`; every rejection carries one of them, so a run's rejections are a
histogram and not a log.

Envelope checks run before the kind's own rule, in a fixed order: `invalid-kind`, `no-evidence`,
`schema`, `base-snapshot-mismatch`, `unknown-entity`, `stale-target`, `unknown-diagnostic`,
`evidence-outside-artifacts`, `proposal-id-mismatch`. A proposal that fails the envelope never
reaches a kind validator.

## The overlay

`EnrichmentOverlayV1` lives at `.doc-bridge/enrich/overlay.json`:

```json
{
  "type": "enrichment-overlay",
  "schemaVersion": 1,
  "contentHash": "…",
  "baseSnapshotHash": "…",
  "accepted": [{ "proposal": { "…": "…" }, "acceptedAt": "2026-09-14T00:00:00.000Z", "acceptedBy": "policy" }],
  "pending": [{ "proposal": { "…": "…" }, "approvalId": "…", "note": "canonical-conflict" }],
  "rejected": [{ "proposalId": "…", "kind": "propose-relation", "entity": "…", "reason": "unknown-endpoint", "detail": "…" }],
  "stats": { "byKind": { "summarize": { "proposed": 4, "accepted": 4, "pending": 0, "rejected": 0 } }, "rejectionReasons": {}, "agentRuns": 1, "cacheHits": 0, "packs": 4, "inputBytes": 0, "outputBytes": 0, "expired": 0 }
}
```

`acceptedBy` is `policy` for accept-by-policy kinds and a person's name otherwise; the schema
refuses `policy` on a human-approval kind and refuses an `acceptedBy` equal to the proposal's
`origin.agentId`. `contentHash` is over the decisions — every accepted, pending and rejected entry
and the hashes they bind to — and not over `acceptedAt` or `stats`, because two runs over one
unchanged repository must produce one overlay hash and a timestamp is not a fact about the
repository.

Reading never writes. `readEnrichmentOverlay` returns nothing for a missing, unreadable, malformed
or hash-mismatched file, and a reader that got nothing behaves as if there were no overlay.

**Staleness is per entry.** At projection time an accepted entry whose `targetContentHash` no
longer matches its entity — or whose other endpoint no longer exists — is expired in the result
and excluded from ranking; its siblings for unchanged entities survive. The file is untouched by a
read; the next `ak-docs enrich` moves the expired entries to `rejected` with reason `expired`.

**Reproducible acceptance.** `revalidateEnrichmentOverlay` re-runs the validators over the stored
proposals and returns the partition they produce; a test asserts it equals the stored one. An
overlay whose partition does not reproduce was edited by hand or outlived its validators, and
either way it is no longer evidence of a decision.

## The stage

`enrich` is a workflow stage between `reconcile` and `evaluate`, run only by `ak-docs enrich` or
`ak-docs check --enrich`. A plain `check` leaves its step pending and `evaluate` reads a null
previous output. A missing, failed, timed-out or stale enrichment never changes a `check` result:
`check --enrich` reports `enrichment.status: failed` with the error and carries on.

```
$ ak-docs enrich --text
Roles: curator=ecosystem-doc-bridge-corpus-scanner
Packs: 92 (agent calls 3, cache hits 89, re-run 3)
Accepted: 180  Pending: 4  Rejected: 7  Expired: 3
  summarize: accepted 89, pending 0, rejected 1
  …
Overlay: 7c1e… (overlay.json)
```

The stage:

1. builds one context pack per target entity for each configured role and batches them by area;
2. answers each pack from the cache or from the agent, caching what the agent said per pack —
   including nothing, so silence is not asked for twice;
3. validates everything through the partition against the snapshot, the report and the overlay
   already on disk; policy kinds are accepted, human kinds are requested from the approval gate;
4. adjudicates what two roles could not settle, if a third identity is configured;
5. merges with the stored overlay — decisions people made survive while their target does — and
   writes it.

The step's workflow input names the overlay it attaches (`{ reportHash, overlayHash }`), because
an approval changes the overlay without changing the report, and the engine refuses a step whose
input did not move but whose output did.

## Context packs and the cache

Agents never receive the snapshot. `buildContextPacks` in `src/enrich/context-pack.ts` builds
one pack per target entity:

| Section | Content | Bound |
| --- | --- | --- |
| `target` | id, kind, name, path, content hash, aliases, its own evidence items, bounded metadata | — |
| `neighbours` | the other end of every relation touching the target, with kind, path, content hash, the relation and its direction; sorted by kind then id | 32 |
| `diagnostics` | open diagnostics naming the target or citing its file | 16 |
| `evidence` | the target's own file, redacted, read only if it still hashes to what the snapshot recorded | 12 KB |
| `budget` | `maxBytes`, `bytes`, `dropped` | 64 KB default, `intelligence.registry.maxPackBytes` |

Over budget, sections are dropped in a declared order — excerpt bytes (halved until it fits, then
dropped), then diagnostics from the end, then neighbours from the end — and the target is never
dropped. This mirrors `compileBudget` from `@agentskit/core` with a byte counter and the
`drop-oldest` strategy over sections ordered least-important-first; a test cross-checks the two,
and the mirror is what runs, because a pack must be the same pack whether or not an optional peer
is installed. Every string in a pack passes `redactSecrets`, asserted by test.

`packHash` covers the target's and every neighbour's content hash and nothing else. The cache key
is the hash of task, agent identity and version, prompt version and pack hash; entries live under
`.doc-bridge/enrich/cache/<key>.json`. An unchanged repository therefore makes zero agent calls,
and a one-document change re-runs only the packs whose hash moved — the changed document's, and
any pack it was a neighbour of.

## Protocol v2

The adapter (`src/agents/registry-adapter.ts`) keeps `run` for `AgentProposalV1` over protocol
`doc-bridge.registry-agent.v1` — `ak-docs suggest` still works — and gains `enrich(task, packs)`
over `doc-bridge.registry-agent.v2`:

```json
{ "protocol": "doc-bridge.registry-agent.v2", "task": "curate", "role": "curator", "promptVersion": "1", "packs": [ … ], "capabilities": ["pack.read", "proposal.write"], "network": false, "shell": false, "deterministic": true }
```

The answer is one JSON object `{ "proposals": [ … ] }`. `task` is `curate`, `review` or
`adjudicate`; for `adjudicate` the packs are followed by one `adjudication-request` item listing
the disputed proposals, and `proposals` carries `EnrichmentAdjudicationV1` values. The adapter
checks transport and budget and returns the raw array; grounding is the validators' job, and
keeping it there is what makes a stored overlay reproducible from its proposals. The same CLI or
local runner module serves both protocols and tells them apart by `protocol`.

## Roles

| Role | Task | Targets | Kinds it is for |
| --- | --- | --- | --- |
| curator | `curate` | documents | classification, summaries, aliases, intents, canonical markers, redundancy, gaps |
| reviewer | `review` | documents, areas | relations, contradictions, gaps, rank hints, area suggestions |
| adjudicator | `adjudicate` | the disputed entities | canonical conflicts and disputed contradictions only |

Roles are configuration under `intelligence.registry.roles`; the default is the configured agent
as curator only. The adjudicator must be a different agent identity from both others —
`resolveEnrichmentRoles` refuses the configuration otherwise — and the validator rejects any
adjudication whose origin matches a proposal it judges as `self-adjudication`. An adjudication
judges; it never approves: the losers are rejected as `adjudicated`, the winner stays pending for
the person the kind's policy requires, and a settled dispute is not reopened by the cache
replaying the proposals that caused it.

## Approvals

Human approval goes through `createApprovalGate` from `@agentskit/core/hitl` over a file-backed
`ApprovalStore` under `.doc-bridge/approvals/`, one JSON record per approval. The gate contract is
mirrored in-repo (`src/enrich/approvals.ts`) for the same reason every ecosystem contract is —
`@agentskit/core` is an optional peer — and the real gate is used through `importPeer` when it is
installed; a test writes through both over one store and reads the same records.

An approval id is the hash of `proposalId` and `targetContentHash`, so an approval given for one
version of a document cannot be replayed against the next. `ak-docs enrich approve <proposalId>
--by <name>`, MCP `docbridge.proposals { action: "enrich-approve" }` and a rendered review page
call the same `decideEnrichment`: the gate decides first, the overlay moves second, and if the
gate refuses — already decided, unknown — the overlay is untouched. An approver equal to the
proposal's author is refused; `policy` is not a person. `ak-docs fix approve` records its
approval through the same gate under `doc-bridge.fix`, bound to the fix proposal id and its
content hash.

## Projection and bounded influence

`projectEnrichmentOverlay(overlay, snapshot)` turns the live accepted set into what
`projectRetrievalIndex` reads:

| Accepted kind | Effect in the projection |
| --- | --- |
| `add-alias` | one more alias on the entry |
| `summarize` | the entry's summary, only when the entity has none of its own |
| `add-intent` | an `intent` entry with `provenance: proposed` |
| `mark-canonical` | the `canonical` tag, and 0.8 of the signal |
| `rank-hint` | 1 (strong) or 0.5 (weak) of the signal |
| `propose-relation` | one more edge with `confidence: proposed`; a `covers` edge counts toward `coveredBy` and canonicality |
| `flag-*`, `suggest-area` | nothing: findings and suggestions are for a reviewer, not for ranking |

The signal is a per-entry share in 0..1, carried on the entry as `agentSignal`, and the ranker
multiplies it by `ACCEPTED_SIGNALS_WEIGHT` = 15% of the exact-id boost (30 of 200). It applies to
lexical hits only, like every other tie-breaker. An accepted signal can therefore reorder near-ties
and can never lift an entry past one the query named exactly — asserted by test. Without an
overlay, `ACCEPTED_SIGNALS_WEIGHT × 0` is what it always was, and the projection is byte-identical.

The projection's `overlayHash` is the hash of the live accepted set — `EMPTY_OVERLAY_HASH` when
nothing is live — so it is part of the projection's identity and `IndexStaleError` sees a changed
overlay. `withAcceptedRelations` merges live proposed relations into a snapshot for the graph, the
HTML report and the memory view, and `assertObservedSurvive` checks that every observed entity and
relation is present and unchanged afterwards; the report draws a proposed edge dashed.

The index builder consults the overlay only while `intelligence.registry.enabled` is true:
switching the Registry off restores the deterministic baseline exactly.

## What never happens

- No overlay entry deletes or alters observed data. The projection asserts that every observed
  entity and relation survives enrichment.
- No agent is called from `check`, `index`, `search`, `query`, `render` or MCP. The enrich stage
  runs only on request, and nothing reachable from the query path imports `src/agents`.
- No agent approves anything — its own output, another agent's, or an adjudication's winner.
- No read writes. A corrupt overlay is no overlay.
