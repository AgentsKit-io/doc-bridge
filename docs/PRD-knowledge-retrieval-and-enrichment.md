---
title: Knowledge retrieval and enrichment plan
description: Evidence-based plan to connect the deterministic knowledge graph to retrieval, then add a validated Registry enrichment overlay.
status: proposed
date: 2026-09-14
---

# Doc Bridge — knowledge retrieval and enrichment plan

This document replaces the earlier "agent as enrichment layer" sketch with a plan grounded in what the code does today. It keeps the sketch's correct invariant (the agent is never the source of truth) and fixes its blind spot: the deterministic graph that the agent would enrich is not the graph that agents and humans query. Enriching it first would improve nothing visible.

Every claim in section 1 is reproducible from a clean checkout of `1.8.0` with the commands shown.

## 0. Summary

Doc Bridge has two disconnected models of a repository:

| Model | Built by | Consumed by | Content on this repository |
| --- | --- | --- | --- |
| `DocBridgeIndexV1` | `ak-docs index` (`src/index-builder`) | `search`, `query`, `ask`, `retrieve`, MCP `handoff.resolve`, `doc.search`, `doc.get`, `retriever.query`, RAG ingest | 11 agent sidecars (3 KB total), 11 hand-written ownership records |
| `DiscoverySnapshotV1` | `ak-docs scan|reconcile|check|map` (`src/discovery`, `src/reconciliation`) | `audit`, `rules`, `map --html`, `suggest`, MCP `docbridge.*` | 369 entities, 1 170 relations, 92 documents |

Retrieval never reads the snapshot. The 80 human documents under `docs/` are discovered as entities but are unsearchable. The snapshot knows `module:src/reconciliation/reconcile.ts` exports `reconcileKnowledge`, but `ak-docs search reconcileKnowledge` returns nothing. The controlled study recorded zero semantic successes in both arms; this is the mechanical reason.

The plan therefore has three phases, in this order:

1. **Deterministic first.** Make the snapshot the single source for retrieval: extract document→code references from Markdown, add an `area` level for single-package repositories, hash every entity, project the graph into the retrieval index, and rank with an explainable scorer.
2. **Enrichment overlay.** Add typed, evidence-bound Registry proposals, deterministic validators, and a versioned `EnrichmentOverlayV1` that retrieval consumes with bounded weight.
3. **Measure.** Ship a local retrieval benchmark that runs in CI before spending money on the agent study, then add the `registry-assisted` arm to the existing study infrastructure.

Phase 1 is where the practical value is. Phase 2 is only worth doing after Phase 1 because it multiplies whatever the retrieval layer can already surface.

## 1. Diagnosis with evidence

All commands run from the repository root after `pnpm install && pnpm build`.

### 1.1 The graph does not feed retrieval

```bash
node bin/ak-docs.js index
node -e 'const i=require("./.doc-bridge/index.json"); console.log(i.knowledge.length, i.lookup.packages.length)'
# 11 11
node bin/ak-docs.js check --json >/dev/null && node -e '
const fs=require("fs"); const d=".doc-bridge/workflow/artifacts";
for (const f of fs.readdirSync(d)) if (f.startsWith("collect-")) { const s=JSON.parse(fs.readFileSync(d+"/"+f,"utf8")).value; console.log(s.entities.length, s.relations.length) }'
# 369 1170
```

`searchIndex` in `src/query/search.ts` iterates `index.knowledge`, `lookup.ownership`, `lookup.intents`, `lookup.changes`. None of these is derived from the snapshot. `buildDocBridgeIndex` in `src/index-builder/build-index.ts` calls `scanAgentCorpus` and `scanHumanDocs`, never `discoverRepository`. The PRD (`docs/PRD-doc-bridge-knowledge-engine.md`, "Resolved Product Boundaries") says the index is a projection of the snapshot; the code does not implement that boundary.

### 1.2 Human documentation is unsearchable

`scanHumanDocs` returns a `HumanDocMap` (id → URL). It is used only by `resolveHumanDoc` to fill `handoff.humanDoc`. The 80 files classified `human` in the snapshot never enter `index.knowledge`, so `doc.search`, `retriever.query` and RAG ingest cannot see them. The doctor still reports:

```
Corpus indexed:  10/10 agent docs
Score: 100/100 (A)
```

The denominator is the agent corpus, so the score cannot express that most documentation is unreachable.

### 1.3 Lexical scoring has no stopwords, no IDF, no symbols, no paths

```bash
node bin/ak-docs.js search "and" --text            # 11 matches, every ownership row score=9
node bin/ak-docs.js search "reconcile" --text      # 0 matches
node bin/ak-docs.js search "reconcileKnowledge" --text   # 0 matches
node bin/ak-docs.js search "how does reconciliation compare declared and observed relations" --agent
# bestMatch: doc-bridge-conformance
node bin/ak-docs.js retrieve "where are workflow transitions persisted"
# one chunk: doc-bridge-conformance
```

`scoreHay` awards `token.length * weight + token.length` for any token present in the haystack. "and" is present in every purpose sentence, so it contributes 9 points to every ownership record; long rare tokens and short common tokens are treated alike. Exported symbols (`metadata.exports` on module entities) and file paths are never indexed, so identifiers agents actually type return nothing.

### 1.4 Single-package repositories get an empty reconciliation

```bash
node bin/ak-docs.js reconcile --json | node -e 'let s="";process.stdin.on("data",c=>s+=c).on("end",()=>{const r=JSON.parse(s);console.log(r.diagnostics.length)})'
# 0
node bin/ak-docs.js audit documentation --text
# Packages covered: 0/0
```

With `reconciliation.scope: "package"` and one package, every internal relation aggregates to a self-loop, which `reconcileKnowledge` skips (`relation.from !== relation.to`). The audit excludes the root package (`entity.path !== '.'`), so coverage is 0/0. Most real repositories are single-package; for them the engine has no unit between "the whole package" and "one file", although the ownership configuration already encodes that unit (`path: "src/mcp"`, `path: "src/query"`).

### 1.5 No per-entity content hash

```bash
node -e 'const fs=require("fs");const d=".doc-bridge/workflow/artifacts";for(const f of fs.readdirSync(d)){if(!f.startsWith("collect-"))continue;const s=JSON.parse(fs.readFileSync(d+"/"+f,"utf8")).value;console.log(s.entities.filter(e=>e.evidence.some(x=>x.contentHash)).length,"/",s.entities.length)}'
# 0 / 369
```

`EvidenceSchema.contentHash` exists but `discoverRepository` never fills it. Only the snapshot-level `contentHash` and `sourceRevision` exist, so any cache or overlay can be keyed only on "the whole repository changed", which is always true between commits. The Codex sketch's "use `contentHash` as cache, invalidate only the affected subgraph" has no substrate.

### 1.6 Markdown is parsed for frontmatter only

The snapshot's `document` entities carry one metadata field, `classification`, derived from a path regex. Headings, links, code paths and identifiers in the body are discarded. Yet:

```bash
grep -rlE '\]\([^)]*\.md' docs --include=*.md | wc -l      # 23 documents link to other documents
grep -rlE '`src/[A-Za-z0-9_./-]+' docs --include=*.md | wc -l  # 14 documents cite source paths
```

Document→document and document→code edges are free, evidence-backed (file + line) and language-agnostic. Today the only way to link a document to code is the `docbridge:` frontmatter block or a path convention, which is why 1 of 92 documents is "documented".

### 1.7 The agent contract cannot carry enrichment

`AgentProposalV1` (`src/schemas/knowledge.ts`) is `{ relatedDiagnosticIds, rationale, confidence, evidence, intendedChanges: string[], checks }`. It can say "review this finding"; it cannot say "this document is canonical for area X", "alias `mcp server` → `area:src/mcp`", or "relation A→B, confidence 0.9". `validateGrounding` checks only that diagnostic ids and evidence keys exist. Nothing stores accepted proposals, nothing consumes them, and the deterministic cache is an in-process `Map`. `suggest` sends the entire redacted snapshot (740 KB here) in one call.

### 1.8 The MCP surface mirrors the split

`handoff.resolve`, `doc.search`, `doc.get`, `retriever.query` read the index; `docbridge.snapshot|report|diagnostics|relations|run` read workflow artifacts. There is no tool that answers "tell me about `src/mcp`" with entity, neighbours, documents, handoff, diagnostics and evidence in one bounded response.

## 2. Target architecture

```
Repository
   │
   ▼
Deterministic analyzers  (js-ts, markdown, workspace, config)
   │  entities + relations + evidence(contentHash) + coverage
   ▼
DiscoverySnapshotV1  ──────────────┐
   │                               │
   ▼                               ▼
Reconciliation / rules       Enrichment stage (optional, explicit)
   │                            curator + reviewer proposals
   │                            deterministic validators
   │                            EnrichmentOverlayV1 (accepted / rejected)
   ▼                               │
RetrievalIndexV1  ◄────────────────┘   projection = snapshot + overlay(accepted)
   │
   ▼
Ranking (explainable, deterministic)
   │
   ▼
CLI · MCP · retriever · RAG · HTML   (reporters over the same artifacts)
```

Invariants, in addition to the ones already in the knowledge-engine PRD:

- The retrieval index is a pure function of `(snapshot, overlay, config)`. It has no scanner of its own.
- Overlay entries bind to the `contentHash` of the entity they describe, not to the snapshot hash. An entry expires when its entity changes; the rest survive.
- Agent signals are additive and bounded. An accepted signal can reorder near-ties; it can never outrank an exact deterministic match, and it can never remove or rewrite deterministic facts.
- Every ranked result can be explained term by term without calling an agent.
- Nothing calls an agent at query time. Ever.

## 3. Phase 1 — deterministic layer

### 3.1 Markdown analyzer

New analyzer `markdown` (versioned alongside `js-ts` in `analyzerVersions`) in `src/discovery/markdown.ts`, producing for every `.md`/`.mdx`:

Entity metadata on `document`:

- `title` (frontmatter `title` or first `#` heading), `headings[]` (levels 1–3, bounded), `summary` (first paragraph, existing `firstParagraph`), `wordCount`, `frontmatter` subset (`type`, `audience`, `owner`, `lifecycle`, `tier`), `language` (best-effort from existing tokenizer signals; `unknown` allowed).
- Evidence `contentHash` = sha256 of the file.

Relations (all `provenance: observed`, evidence = file + line):

| Kind | From → To | Detection |
| --- | --- | --- |
| `links-to` | document → document | relative Markdown link resolving to a scanned document |
| `mentions` | document → module / package / area | backtick or link text matching a scanned path (`src/mcp/server.ts`, `packages/auth`) or a package name |
| `mentions-symbol` | document → module | backtick token equal to an exported name of exactly one module (ambiguous tokens are dropped, not guessed) |
| `covers` | document → entity | unchanged: frontmatter `docbridge` block or path convention |

Rules for `mentions`: exact path match after normalisation; directory paths resolve to `area` entities (3.2); ambiguous matches produce no relation and one bounded `coverage` entry with reason. A document with 40 path mentions is capped (default 64 relations, configurable) with `evidenceTruncated` metadata, mirroring `aggregatedRelations`.

`documentClassification` moves from a hard-coded regex to the analyzer and gains frontmatter precedence, so `audience: agent` in frontmatter beats the path.

### 3.2 Areas

New entity kind `area` (`area:<dir>`), `contains` relations `package → area → module`, produced by the repository analyzer:

- Default: the first directory level under each package's source roots (`src/*`, `lib/*`, `app/*`, plus any `routing.options.ownership[*].path`). Configurable via `analysis.areas.depth` and `analysis.areas.roots`.
- Every ownership record whose `path` equals an area path is attached to that area (`metadata.ownershipId`). Records that match no area produce a diagnostic `OWNERSHIP_PATH_UNOBSERVED` (status `stale-or-unverified`) instead of silently passing.
- `reconciliation.scope` gains `area`. Package-scope self-loops are replaced by area-to-area relations, so a single-package repository produces `RELATION_UNDOCUMENTED` findings at a scope a human can act on. The audit's `packageEntities` filter is extended to areas when there is exactly one package.

Areas are the unit that handoffs, ownership, and enrichment operate on. They are observed facts (directories exist) and cheap.

### 3.3 Per-entity hashes and incremental scan

- Every `module`, `document` and `package` entity gets `evidence[0].contentHash` (file hash). `external` entities get none.
- `discoverRepository` accepts an optional previous snapshot; files whose hash is unchanged reuse the previous entity and its outgoing relations instead of re-parsing (`ts.createSourceFile` is the dominant cost). Coverage notes `reusedEntities`.
- `sourceRevision` semantics do not change; the snapshot `contentHash` is still computed over the full artifact.

### 3.4 Retrieval projection

`RetrievalIndexV1` (`src/schemas/retrieval-index.ts`) built by `src/retrieval/project.ts` from `(snapshot, overlay?, config)`:

```ts
type RetrievalEntry = {
  id: string                 // entity id
  kind: 'document' | 'module' | 'area' | 'package' | 'intent' | 'change'
  path: string
  title: string
  summary?: string
  audience?: 'agent' | 'human' | 'human-and-agent'
  fields: {                  // tokenised at build time
    title: string[]; headings: string[]; path: string[]; symbols: string[]; body: string[]; aliases: string[]
  }
  graph: { inboundLinks: number; coveredBy: string[]; mentionedBy: string[]; areaId?: string; packageId?: string }
  contentHash: string
  provenance: 'observed' | 'declared' | 'proposed'
}
```

plus `idf: Record<token, number>`, `stopwords` version, and `overlayHash`. `DocBridgeIndexV1` remains generated for compatibility; `ak-docs index` writes both, and `search`/`query`/MCP read `RetrievalIndexV1` when present. `contentHash` of the retrieval index derives from `(snapshotHash, overlayHash, configHash)`, so `IndexStaleError` keeps working.

Body tokens for human documents are bounded (existing `extractSearchBody`, 6 000 chars) and stored once; RAG ingest reads the same entries.

### 3.5 Explainable ranking

`src/retrieval/rank.ts` replaces `searchIndex` internals (public signature unchanged, plus `explain?: boolean`):

```
score(entry, query) =
    Σ_fields  w_field · BM25(field tokens, query tokens, idf)      // lexical
  + exactId · 200 + exactPath · 150 + exactSymbol · 150             // identity
  + graphProximity                                                   // entries covering/mentioning a top lexical hit
  + canonicality(inboundLinks, coveredBy.length)                     // bounded log scale
  + audienceFit(query.agent, entry.audience)
  + acceptedAgentSignals                                             // Phase 2, capped at 15 % of the identity boost
```

- Stopword lists: English and Portuguese to start (the repository already targets non-English documentation; `tokenizeSearchText` keeps CJK behaviour). Lists are versioned in the index so results are reproducible.
- Field weights are configuration (`retrieval.weights`), with tested defaults. No algorithm internals beyond weights are exposed.
- `--explain` (CLI) and `explain: true` (MCP) return per-term and per-component contributions for each match, so "why did this document rank first" has a deterministic answer.
- Intent detection (`preferOwnership`, `CHANGE_INTENT`) survives as the `audienceFit`/`kind` prior; it stops being a hard filter.

### 3.6 Graph-derived handoffs

`handoffForPackage` becomes `handoffForEntity(id)` in `src/query/handoff.ts`, valid for package, area, module and document ids:

- `editRoots`: the area or package path; for a module, its area.
- `checks`: ownership override → package `scripts` (`test`, `lint`, `typecheck`) → `defaultChecksForTarget`, with `metadata.checksSource` saying which.
- `startHere`: highest-ranked document by `covers` > `mentions` > `links-to` proximity, then canonicality; `readBeforeEditing`: the next two plus `AGENTS.md`.
- `related`: top imported and importing areas (bounded), each with evidence.
- `explain`: which relations produced `startHere` and `editRoots`.

`AgentHandoffV1` stays byte-compatible; new fields are optional additions (`related`, `explain`, `evidence`).

### 3.7 MCP

Two new tools, old ones kept as thin aliases:

- `knowledge.search { query, kinds?, limit?, explain? }` → ranked entries.
- `knowledge.lookup { id | path, depth? }` → entity, neighbours by relation kind (bounded), covering/mentioning documents, handoff, open diagnostics, evidence. This is the single call an agent makes before editing.

Response size stays bounded by the existing `report-threshold` style limits; `telemetry.contextBytes` is reported as today.

### 3.8 Doctor honesty

`run-doctor.ts` adds three measured dimensions and lowers the grade when they are poor:

- **Reachability**: share of `document` entities present in the retrieval index (target 100 %).
- **Connectivity**: share of areas with at least one `covers`/`mentions` document; share of documents with at least one outgoing code edge.
- **Retrieval benchmark**: hit@3 on the project's golden query set when one exists (Phase 3), otherwise `not-analyzed` and shown as such.

An "A" requires all three. The current score becomes impossible for this repository until 80 human documents are indexed, which is the honest state.

### 3.9 Phase 1 acceptance

On this repository:

- `ak-docs search reconcileKnowledge` returns `module:src/reconciliation/reconcile.ts` first.
- `ak-docs search "workflow transitions persisted"` returns `docs/knowledge-engine-runbook.md` or `module:src/workflow/engine.ts` in the top 3 with an explanation.
- `ak-docs search and` returns zero matches.
- `ak-docs reconcile` at area scope produces at least one `RELATION_UNDOCUMENTED` finding with evidence.
- `ak-docs index` on an unchanged tree is idempotent; on a one-file change it re-parses one module.
- All 365 existing tests pass; `DocBridgeIndexV1`, `AgentHandoffV1` and MCP tool names remain compatible.

## 4. Phase 2 — enrichment overlay

This phase implements the earlier sketch, with the contract details it lacked.

### 4.1 Typed proposals

`EnrichmentProposalV1` (`src/schemas/enrichment.ts`) is a discriminated union. Common envelope:

```ts
{
  type: 'enrichment-proposal', schemaVersion: 1,
  proposalId: string,              // sha256(kind, entity, targetContentHash, agentId, promptVersion) → idempotent
  kind: EnrichmentKind,
  entity: string,                  // must exist in snapshot
  targetContentHash: string,       // entity evidence hash at proposal time
  confidence: number,              // 0..1
  reason: string,                  // ≤ 1 000 chars
  evidence: Evidence[],            // ≥ 1, every item must exist in snapshot/report evidence
  origin: { agentId, agentVersion, promptVersion, model?, provider? },
  baseSnapshotHash: string,
  payload: … per kind
}
```

Kinds and payloads:

| Kind | Payload | Validator (deterministic) | Default policy |
| --- | --- | --- | --- |
| `classify-document` | `{ type, audience, lifecycle, criticality }` | enum values; entity is a document | auto-accept |
| `summarize` | `{ summary ≤ 400 chars, language }` | length; no secrets (`redactValue` scan); not identical to existing summary | auto-accept |
| `add-alias` | `{ alias }` | ≤ 64 chars; not an existing id/alias; no collision across proposals | auto-accept |
| `add-intent` | `{ phrase, language }` | ≤ 120 chars; language tag | auto-accept |
| `mark-canonical` | `{ scope: entityId }` | scope exists; at most one canonical document per scope after merge, else `conflict` | human approval |
| `propose-relation` | `{ from, to, kind, detection }` | endpoints exist; kind in allowed set; not already observed; evidence points into `from` or `to` | human approval |
| `flag-contradiction` | `{ against: entityId, claim, observed }` | both entities exist; evidence in both | human approval |
| `flag-redundancy` | `{ with: entityId }` | both documents exist; not exact duplicates (already deterministic) | human approval |
| `flag-gap` | `{ area, missing: 'document' \| 'owner' \| 'checks' }` | area exists; gap not already covered | auto-accept as finding, never as fact |
| `rank-hint` | `{ relevance: 'strong' \| 'weak' }` | entity exists | auto-accept, bounded weight |

Anything else fails schema validation and is recorded as `rejected: invalid-kind`.

### 4.2 Overlay artifact and stage

`EnrichmentOverlayV1`:

```ts
{
  type: 'enrichment-overlay', schemaVersion: 1, contentHash, contentHashAlgo,
  baseSnapshotHash, project, sourceRevision, sourceRevisionKind, configurationHash,
  accepted: (EnrichmentProposalV1 & { acceptedAt, acceptedBy: 'policy' | string })[],
  pending:  EnrichmentProposalV1[],                     // awaiting human approval
  rejected: { proposal: EnrichmentProposalV1; reason: string }[],
  stats: { byKind: Record<kind, { proposed, accepted, rejected, pending }>, agentRuns, cacheHits, inputBytes, outputBytes }
}
```

- New workflow stage `enrich` between `reconcile` and `evaluate`, run only by `ak-docs enrich` or by `check --enrich`. Deterministic `check` never runs it; a missing or failed overlay never changes `check` results.
- Entry-level staleness: on every projection, an accepted entry whose `targetContentHash` no longer matches its entity's hash is moved to `expired` in the derived view and excluded from ranking. The overlay file itself is not rewritten by a read.
- Approvals reuse the existing fix-proposal approval path (`ak-docs fix approve`, MCP `docbridge.proposals`) with `kind: enrichment`. Approval binds to `proposalId` and `targetContentHash`.
- Overlay entries never delete or alter deterministic entities or relations. `propose-relation` accepted entries are added with `provenance: proposed` and rendered as dashed in the HTML report.

### 4.3 Context packs, batching, cache

Agents never receive the whole snapshot. `src/enrich/context-pack.ts` builds one bounded pack per target entity:

- target entity + its `contains`/`covers`/`mentions`/`imports` neighbours (depth 1, ≤ 32) + open diagnostics touching it + evidence excerpts (bounded lines, opt-in full snippets, redacted).
- Deterministic ordering (entity id), deterministic truncation, byte budget default 64 KB (`intelligence.registry.maxPackBytes`).
- Packs are grouped by area into batches; the CLI protocol becomes `doc-bridge.registry-agent.v2` with `task: 'curate' | 'review' | 'adjudicate'` and `packs: ContextPack[]`, returning `proposals: EnrichmentProposalV1[]`.
- Cache key = `sha256(task, agentId, agentVersion, promptVersion, pack.contentHash)` where `pack.contentHash` covers the target hash and neighbour hashes. Cache persisted under `.doc-bridge/enrich/cache/`, so `ak-docs enrich` on an unchanged tree makes zero agent calls; a one-document change re-runs packs whose hash changed (the document and its immediate neighbours).

### 4.4 Roles

- **Curator** (documents): `classify-document`, `summarize`, `add-alias`, `add-intent`, `mark-canonical`, `flag-redundancy`, `flag-gap`.
- **Graph reviewer** (structure): `propose-relation`, `flag-contradiction`, `flag-gap`, `rank-hint`.
- **Adjudicator**: invoked only for `mark-canonical` conflicts and for `flag-contradiction` when the reviewer and curator disagree. Must be a different `agentId` from the proposer; the validator rejects an adjudication whose origin matches any proposal it adjudicates.

Same adapter, three tasks; roles are configuration (`intelligence.registry.roles.curator`, `.reviewer`, `.adjudicator`), all optional. Default remains `ecosystem-doc-bridge-corpus-scanner` as curator only.

### 4.5 What the agent should not do

Pushed back into Phase 1 because they are cheaper and more reliable deterministically: path and symbol mentions, document links, canonical detection by inbound links, package export → module relations (the sketch's own example is a static `package.json` `exports` read), directory areas, freshness. The agent's remaining work is genuinely semantic: summaries, natural-language aliases and intents, audience and type when paths are uninformative, and contradictions between prose and observed structure.

## 5. Phase 3 — measurement

### 5.1 Retrieval benchmark (local, deterministic, in CI)

`ak-docs bench retrieval <golden.json> [--index <path>] [--json]`:

```json
{ "queries": [
  { "q": "where do I add a new MCP tool", "expect": ["area:src/mcp", "document:docs/mcp.md"], "agent": true, "lang": "en" },
  { "q": "onde ficam as transições do workflow", "expect": ["module:src/workflow/engine.ts"], "lang": "pt" },
  { "q": "reconcileKnowledge", "expect": ["module:src/reconciliation/reconcile.ts"] }
]}
```

Metrics: hit@1, hit@3, MRR, mean `contextBytes` of the top-3 payload, zero-result rate. A checked-in golden set for this repository (≥ 40 queries, both languages) and one per fixture. CI fails on hit@3 regression below a stored baseline; the baseline is replaced only through the same audited path used by the study.

This is the metric the doctor consumes (3.8) and the first gate for any ranking change. It costs milliseconds and needs no agent.

### 5.2 Overlay quality

Emitted by `ak-docs enrich --json` and persisted in `stats`:

- proposals per kind: proposed / accepted / rejected / pending, with rejection reasons histogram;
- invented relations: `propose-relation` rejected for non-existent endpoints (must trend to zero);
- stability: two runs on the same tree with `deterministic: true` produce identical overlay hashes; with a live model, the share of identical `proposalId`s between runs;
- cost: agent runs, input/output bytes, cache hit rate, wall time;
- retrieval delta: benchmark run with and without the overlay on the same index; the overlay must not lower hit@3.

### 5.3 Controlled study arm

Only after 5.1 shows the deterministic arm answering the benchmark, add `registry-assisted` (already reserved in `task-suite-v1.json` `scenarioIds`) to the existing runner. Fix the adjudication that produced zero successes in both arms: every task gets machine-checkable expectations where possible (`expectedEntities`, `expectedDocuments`) checked by `ak-docs bench`, with the LLM adjudicator reserved for rubric items that cannot be checked mechanically.

## 6. Guardrails

Carried over and made enforceable:

1. Enrichment never removes deterministic evidence: overlay entries are additive; the projection asserts `observed ⊆ projected`.
2. No evidence, no entry: `evidence.length ≥ 1` and every reference must exist in the snapshot or report (existing `validateGrounding`, extended per kind).
3. Agent unavailable never blocks: `check`, `index`, `search`, `query`, MCP work with no overlay or with an expired one.
4. Provenance on everything: `origin`, `promptVersion`, `targetContentHash`, `baseSnapshotHash`, `status`.
5. Reproducible acceptance: `accepted` entries are content-addressed; re-running validators on the overlay must reproduce the same partition.
6. No self-approval: proposer `agentId` ≠ approver; `acceptedBy: 'policy'` is only legal for auto-accept kinds.
7. Bounded influence: `acceptedAgentSignals` ≤ 15 % of the identity boost; a test asserts an exact id match outranks any overlay-boosted entry.
8. No agent at query time: `search`, `query`, MCP handlers import nothing from `src/agents`; a lint script (like `check:no-legacy-chat-imports`) enforces it.
9. Privacy: packs pass `redactValue`; full snippets opt-in; nothing leaves the process unless `intelligence.registry` is explicitly enabled.

## 7. Delivery

| Step | Scope | Main files | Proof |
| --- | --- | --- | --- |
| 1a | Stopwords + IDF + field weights, human docs into `knowledge`, symbol/path tokens from snapshot | `src/query/text.ts`, `src/query/search.ts`, `src/index-builder/build-index.ts` | benchmark hit@3 on this repo; `search and` → 0 |
| 1b | Markdown analyzer: links, mentions, symbols, hashes | `src/discovery/markdown.ts` (new), `src/discovery/repository.ts` | fixture with 3 docs / 4 modules; expected relation ids |
| 1c | Areas + area scope + ownership attachment | `src/discovery/repository.ts`, `src/reconciliation/reconcile.ts`, `src/config/schema.ts` | this repo yields ≥ 1 undocumented area relation |
| 1d | `RetrievalIndexV1` projection + explain ranking + graph handoffs | `src/retrieval/*` (new), `src/query/*` | compat tests for `DocBridgeIndexV1`/`AgentHandoffV1`; `--explain` snapshot tests |
| 1e | MCP `knowledge.search` / `knowledge.lookup`; doctor v2 | `src/mcp/server.ts`, `src/doctor/run-doctor.ts` | MCP parity test vs CLI; doctor grade drops on unreachable docs |
| 3a | `bench retrieval` + golden sets + CI gate | `src/bench/*` (new), `tests/fixtures/golden-*.json`, `.github/workflows/ci.yml` | baseline file committed |
| 2a | `EnrichmentProposalV1`, validators, overlay artifact, `enrich` stage | `src/schemas/enrichment.ts`, `src/enrich/*` (new), `src/workflow/engine.ts` | deterministic fake agent fixtures per kind; expiry test |
| 2b | Context packs, batching, persistent cache, protocol v2 | `src/enrich/context-pack.ts`, `src/agents/registry-adapter.ts` | zero calls on unchanged tree; one pack on one-doc change |
| 2c | Roles, adjudicator, approval path, HTML dashed edges | `src/agents/*`, `src/fixes/proposals.ts`, `src/report/html.ts` | self-approval rejected; conflict routed to adjudicator |
| 3b | Overlay stats, `registry-assisted` study arm | `src/study/*` | benchmark delta reported |

Order is 1a → 1b → 1c → 1d → 1e → 3a → 2a → 2b → 2c → 3b. Steps 1a–1c are independent enough to ship as separate pull requests within a week; each keeps the 365 existing tests green and adds its own.

Explicitly not in this plan: a vector store by default (the optional `@agentskit/rag` path keeps consuming the same entries), calling agents from `search`, splitting the package, package-level configuration overrides, or any language analyzer beyond JS/TS and Markdown.

## 8. Relation to the earlier sketch

| Earlier sketch | This plan |
| --- | --- |
| Agent enriches the canonical graph that retrieval views read | Same invariant, but first makes retrieval actually read the graph (§1.1, §3.4); otherwise enrichment is invisible |
| Curator + graph reviewer + separate adjudicator | Kept (§4.4), with the self-approval rule enforced by the validator |
| Free-form proposal `{ entity, proposal, relation, confidence, evidence, reason }` | Discriminated union with per-kind validators and policies (§4.1); idempotent `proposalId` |
| "Use `contentHash` as cache, invalidate the affected subgraph" | Requires per-entity hashes, which do not exist today (§1.5, §3.3); cache keyed on context-pack hash (§4.3) |
| `retrievalScore = intentMatch + ownershipMatch + …` | Defined components with BM25 lexical core, versioned stopwords, bounded agent term, and `--explain` output (§3.5) |
| Agent proposes relations "the scanner cannot infer" | Most of those are inferable; moved to the Markdown analyzer and areas (§3.1, §3.2, §4.5) |
| Evaluate three modes with the same task suite | Add a millisecond-scale retrieval benchmark in CI first (§5.1); fix the adjudication that scored zero in both arms before adding the third arm (§5.3) |
| Guardrails list | Kept and made testable (§6), plus "no agent at query time" and "bounded influence" |
| Start with a versioned overlay and two Registry agents | Start with the deterministic layer; the overlay is step 2a, after the benchmark exists |
