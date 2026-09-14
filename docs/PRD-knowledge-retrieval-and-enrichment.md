---
title: Knowledge retrieval and enrichment plan
description: Evidence-based plan to make Doc Bridge solve two problems — human ↔ documentation ↔ agent communication, and cheaper, more confident agent retrieval — with a deterministic core, borrowed libraries where they earn their place, and a validated Registry enrichment overlay.
status: proposed
date: 2026-09-14
version: 2
---

# Doc Bridge — knowledge retrieval and enrichment plan

This document takes the earlier "agent as enrichment layer" sketch and grounds it in what the code does today, in the libraries that already solve parts of the problem, and in the AgentsKit contracts the rest of the ecosystem consumes. It keeps the sketch's invariant (the agent is never the source of truth) and fixes its blind spot: the deterministic graph the agent would enrich is not the graph agents and humans query. Enriching it first would improve nothing visible.

Every claim in section 2 is reproducible from a clean checkout of `1.8.0` with the commands shown.

## 0. The two problems

Doc Bridge exists to solve two problems. Every section below is measured against them.

**Problem 1 — humans ↔ documentation ↔ agents.** Humans write Markdown; agents need structure; both need to know which document is authoritative for which part of the code and whether it is still true. Today the bridge exists in one direction only (frontmatter → handoff) and only for the 11 records a human typed into `doc-bridge.config.json`.

| Success criterion | Measured by |
| --- | --- |
| Every document is reachable from the code it describes and every code area from its documents | connectivity metrics in the doctor (§4.8) |
| The same artifact renders as Markdown for humans and JSON for agents, without divergence | `ak-docs render` from the projection (§3.3), golden-file tests |
| A human can write plain Markdown and still get machine-verifiable links to code | Markdown analyzer relations (§4.1) without frontmatter |
| Agent-produced knowledge reaches humans as reviewable Markdown, never as silent graph edits | overlay → Knap-rendered review pages, HITL approval (§5) |

**Problem 2 — agents get the right information faster, with confidence, for fewer tokens.** Today an agent that asks about `reconcileKnowledge` gets nothing, an agent that asks a natural-language question gets the wrong ownership record, and the payload it does get carries no evidence, no confidence and no explanation.

| Success criterion | Measured by |
| --- | --- |
| The first call answers the question | hit@1 / hit@3 on a golden query set, in CI (§6.1) |
| Every answer says why it was chosen and how sure it is | `explain` and `confidence` on every result (§4.5) |
| Payloads fit a declared budget | `compileBudget` from `@agentskit/core`; `contextBytes` telemetry per call (§4.7) |
| Fewer tokens to the same correct answer | tokens-to-first-evidence in the study (§6.3) |
| Works with zero network and zero model | deterministic path always available (§7) |

## 1. Summary

Doc Bridge has two disconnected models of a repository:

| Model | Built by | Consumed by | Content on this repository |
| --- | --- | --- | --- |
| `DocBridgeIndexV1` | `ak-docs index` (`src/index-builder`) | `search`, `query`, `ask`, `retrieve`, MCP `handoff.resolve`, `doc.search`, `doc.get`, `retriever.query`, RAG ingest, **`@agentskit/harness` context provider** | 11 agent sidecars (3 KB total), 11 hand-written ownership records |
| `DiscoverySnapshotV1` | `ak-docs scan|reconcile|check|map` (`src/discovery`, `src/reconciliation`) | `audit`, `rules`, `map --html`, `suggest`, MCP `docbridge.*` | 369 entities, 1 170 relations, 92 documents |

Retrieval never reads the snapshot. The plan has four parts, in this order:

1. **Borrow the right primitives** (§3): Markdown parsing, template rendering, graph metrics, lexical ranking and AgentsKit contracts, chosen for determinism, size and licence.
2. **Deterministic layer** (§4): make the snapshot the single source for retrieval; extract document→code references from Markdown; add `area`; hash every entity; project the graph into a retrieval index; rank with an explainable scorer; budget every payload.
3. **Enrichment overlay** (§5): typed, evidence-bound Registry proposals, deterministic validators, a versioned overlay that retrieval consumes with bounded weight, approvals through the ecosystem's HITL gate.
4. **Measure** (§6): a local retrieval benchmark in CI before any agent spend, then the `registry-assisted` study arm.

## 2. Diagnosis with evidence

All commands run from the repository root after `pnpm install && pnpm build`.

### 2.1 The graph does not feed retrieval

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

### 2.2 Human documentation is unsearchable

`scanHumanDocs` returns a `HumanDocMap` (id → URL) used only by `resolveHumanDoc` to fill `handoff.humanDoc`. The 80 files classified `human` never enter `index.knowledge`, so `doc.search`, `retriever.query`, RAG ingest and the harness context provider cannot see them. The doctor still reports:

```
Corpus indexed:  10/10 agent docs
Score: 100/100 (A)
```

### 2.3 Lexical scoring has no stopwords, no IDF, no symbols, no paths

```bash
node bin/ak-docs.js search "and" --text            # 11 matches, every ownership row score=9
node bin/ak-docs.js search "reconcile" --text      # 0 matches
node bin/ak-docs.js search "reconcileKnowledge" --text   # 0 matches
node bin/ak-docs.js search "how does reconciliation compare declared and observed relations" --agent
# bestMatch: doc-bridge-conformance
node bin/ak-docs.js retrieve "where are workflow transitions persisted"
# one chunk: doc-bridge-conformance
```

`scoreHay` awards `token.length * weight + token.length` for any token present in the haystack. "and" is present in every purpose sentence and contributes 9 points to every ownership record. Exported symbols (already in `metadata.exports`) and file paths are never indexed.

### 2.4 Single-package repositories get an empty reconciliation

```bash
node bin/ak-docs.js reconcile --json | node -e 'let s="";process.stdin.on("data",c=>s+=c).on("end",()=>{const r=JSON.parse(s);console.log(r.diagnostics.length)})'
# 0
node bin/ak-docs.js audit documentation --text
# Packages covered: 0/0
```

With `reconciliation.scope: "package"` and one package, every internal relation aggregates to a self-loop, which `reconcileKnowledge` skips. The audit excludes the root package. Most real repositories are single-package; the ownership configuration already encodes the missing unit (`path: "src/mcp"`) but the graph has no entity for it.

### 2.5 No per-entity content hash

```bash
node -e 'const fs=require("fs");const d=".doc-bridge/workflow/artifacts";for(const f of fs.readdirSync(d)){if(!f.startsWith("collect-"))continue;const s=JSON.parse(fs.readFileSync(d+"/"+f,"utf8")).value;console.log(s.entities.filter(e=>e.evidence.some(x=>x.contentHash)).length,"/",s.entities.length)}'
# 0 / 369
```

`EvidenceSchema.contentHash` exists but is never filled. The harness context provider already reads an optional per-entry `contentHash` from `index.knowledge[]` and falls back to the whole-index hash; Doc Bridge never supplies one.

### 2.6 Markdown is parsed for frontmatter only

```bash
grep -rlE '\]\([^)]*\.md' docs --include=*.md | wc -l      # 23 documents link to other documents
grep -rlE '`src/[A-Za-z0-9_./-]+' docs --include=*.md | wc -l  # 14 documents cite source paths
```

`src/discovery/documentation.ts` is a 400-line hand-written YAML-subset parser for the `docbridge` block; `src/lib/markdown.ts` is a regex frontmatter reader. Headings, links, code spans and tables in the body are discarded. 1 of 92 documents counts as "documented".

### 2.7 The agent contract cannot carry enrichment

`AgentProposalV1` is `{ relatedDiagnosticIds, rationale, confidence, evidence, intendedChanges: string[], checks }`. It cannot express a classification, an alias, a summary or a relation. Nothing stores accepted proposals, nothing consumes them, the deterministic cache is an in-process `Map`, and `suggest` sends the entire redacted snapshot (740 KB here) in one call.

### 2.8 Ecosystem contracts are reimplemented or ignored

| Doc Bridge today | AgentsKit already provides |
| --- | --- |
| `DocBridgeRetrievedChunk` (own shape) in `src/retriever` | `Retriever` / `RetrievedDocument` in `@agentskit/core`; `createHybridRetriever`, `createRerankedRetriever`, `bm25Score` in `@agentskit/rag` |
| `contextBytes / 4` token estimate | `approximateCounter`, `compileBudget` with `drop-oldest | sliding-window | summarize` in `@agentskit/core` |
| `fix approve` file-based approval | `createApprovalGate` / `ApprovalStore` in `@agentskit/core/hitl` |
| `KnowledgeDiagnostic`, `RuleFinding`, `DocumentationAuditFinding` (three shapes) | `Finding` with `SEVERITY_ORDER` in `@agentskit/core/finding` |
| `resolveEntity` exact / `endsWith` matching | `fuzzyMatchList` (Jaro-Winkler) in `@agentskit/core/fuzzy-match` |
| no graph export | `GraphMemory` (`upsertNode`, `upsertEdge`, `traverse`) in `@agentskit/memory` |
| ad-hoc study task suite | `EvalSuiteDoc` / `EvalCase` / `matchesExpectation` in `@agentskit/core/eval-format`; `runEval`, `replay`, `snapshot`, `diff`, `ci` in `@agentskit/eval` |

## 3. Build or borrow

Rules: a library enters the core dependency list only if it is deterministic, has no native dependencies, is MIT or Apache-2, and replaces code Doc Bridge would otherwise maintain. Everything model-related stays behind the existing optional-peer boundary.

### 3.1 Markdown → JSON: `remark` (unified / mdast)

| | |
| --- | --- |
| Packages | `remark-parse` 11, `remark-frontmatter` 5, `remark-gfm` 4, `mdast-util-to-string` 4, `unist-util-visit` 5, `yaml` 2 |
| Licence, deps | MIT; pure JS, ESM (Doc Bridge is already ESM) |
| Replaces | `src/lib/markdown.ts` regex frontmatter, the 400-line `docbridge` block parser in `src/discovery/documentation.ts`, `extractSearchBody`, `firstHeading`, `firstParagraph` |
| Gains | headings with levels, links with targets, inline code spans, tables, GFM task lists, and **line/column positions on every node** for evidence; a real YAML parser (`yaml`, already a transitive dependency via `@agentskit/harness`) for frontmatter and the `docbridge` block |
| Determinism | parser is pure; positions are stable for identical input |

The `docbridge` block schema moves to Zod (already a dependency) validating the parsed YAML object. The bespoke parser's diagnostics (`DOCBRIDGE_FIELD_UNKNOWN`, `DOCBRIDGE_DECLARATION_CONFLICT`, …) are preserved as Zod issue mappings so existing tests keep their codes.

### 3.2 JSON → Markdown: `knap`

| | |
| --- | --- |
| Package | `knap` 0.5 (Obsidian), MIT, one dependency (`dayjs`); CLI `npx knap render template.md --data data.json`; API `createEngine({ filters }).renderOrThrow(template, { variables })` |
| Property that matters | templates parse to an AST and are interpreted **without `eval` or arbitrary JavaScript**; the application controls every variable |
| Replaces | string-concatenation renderers in `src/index-builder/llms-txt.ts`, `src/memory/pipeline.ts` (promotion drafts), `src/memory/github-pr.ts` (PR bodies), `bootstrap agent-docs`, and the text mode of `doctor`, `audit`, `ask` |
| Enables | one artifact, two renderings: `RetrievalIndexV1` → `llms.txt`, area pages, ownership sidecars, "what changed since last index" digest, overlay review pages; users override templates per project (`doc-bridge.config.json` → `render.templates`) |

Every generated Markdown region carries `<!-- doc-bridge:generated hash=… -->` markers so the Markdown analyzer (§4.1) can recognise its own output, skip it for `mentions`, and the audit can flag manual edits inside generated regions (the `generated-freshness` category already exists).

### 3.3 Graph: `graphology`

| | |
| --- | --- |
| Packages | `graphology` 0.26 (MIT, one dependency), `graphology-metrics` 2.4 (degree, betweenness, closeness, eigenvector, PageRank, HITS), `graphology-shortest-path` 2.1, `graphology-dag` (topological sort, cycle detection), optional `graphology-communities-louvain` 2.0 with a seeded `rng` |
| Replaces | the ad-hoc `packageLookup`, `aggregatedRelations` and centrality counting in `src/reconciliation/reconcile.ts` and `src/rules/engine.ts` |
| Gains | `canonicality` from PageRank over `links-to` + `covers` (instead of raw inbound-link counts); `graphProximity` from bounded shortest paths; `centrality-risk` from betweenness on the `imports` graph instead of "count of undocumented findings"; import cycles as a diagnostic; Louvain communities as an **agent-facing suggestion** for areas when directories are uninformative, never as authority |
| Determinism | all metrics are deterministic for a given graph; Louvain is seeded; node iteration order is sorted before every metric call so hashes stay stable |

The `DiscoverySnapshotV1` envelope does not change. Graphology is an in-memory working structure built from the snapshot inside `src/graph/build.ts`; nothing serialises graphology's own format.

### 3.4 Lexical ranking: `minisearch`

| | |
| --- | --- |
| Package | `minisearch` 7.2, MIT, zero dependencies, Node and browser |
| Provides | BM25+ scoring with tunable `k`, `b`, `d`; per-field `boost`; custom `tokenize` and `processTerm` (stopwords, code-identifier preservation, optional stemming); prefix and fuzzy matching; per-result `terms` and `match` (which term hit which field); `toJSON` / `loadJSON` so the index is a committed artifact |
| Replaces | `scoreHay`, `identityBoost` and the hand-rolled tie-breaking in `src/query/search.ts` |
| Not replaced | graph-derived boosts, audience fit, overlay signals and the explain output, which Doc Bridge computes on top (§4.5) |

Considered and not chosen: `@orama/orama` (Apache-2, hybrid vector search, per-language stemmers including Portuguese; heavier, and vector search stays an optional peer concern), `flexsearch` (fast, opaque scoring), `wink-bm25-text-search` (pulls an English NLP model). If maintainers prefer zero new runtime dependencies, a 200-line BM25 with the same tokenizer is acceptable; the requirement is IDF, stopwords and field weights, not the library.

### 3.5 Token counting

Exact tokenizers are heavy: `js-tiktoken` 1.0 and `gpt-tokenizer` 4.0 unpack to 22–27 MB because they ship BPE ranks, and they count OpenAI tokens only. Default stays a heuristic, but the ecosystem one: `approximateCounter` from `@agentskit/core`, reported as `tokenMethod: 'approximate'`. Exact counting is an optional peer (`intelligence.tokenizer: 'js-tiktoken' | 'anthropic-count-tokens'`) used by the benchmark and the study, never by `search`.

### 3.6 AgentsKit contracts to adopt

| Contract | Where it plugs in |
| --- | --- |
| `Retriever` / `RetrievedDocument` (`@agentskit/core`) | `createDocBridgeRetriever` returns `RetrievedDocument[]` with `metadata: { kind, path, evidence, explain, confidence }`, so `createHybridRetriever`, `createRerankedRetriever`, `formatRetrievedDocuments` and `@agentskit/runtime` consume it unchanged |
| `compileBudget`, `approximateCounter` | `knowledge.lookup` and `handoff.resolve` accept `budgetTokens`; sections are dropped in a declared order (evidence excerpts → related → neighbours → summary) until the payload fits; the result carries `tokens.total` and `fits` |
| `createApprovalGate` / `ApprovalStore` (`@agentskit/core/hitl`) | overlay approvals (§5.2); the file-backed store lives under `.doc-bridge/approvals/`; the same gate serves CLI, MCP and a future AKOS UI |
| `Finding` (`@agentskit/core/finding`) | `ak-docs check --json --format finding` and MCP `docbridge.diagnostics { format: 'finding' }` emit the canonical shape so Code Review, AKOS and dashboards consume Doc Bridge output without a custom parser |
| `fuzzyMatchList` (`@agentskit/core/fuzzy-match`) | `resolveEntity` in the Markdown analyzer and the query layer: an unresolved reference within threshold 0.92 of exactly one entity resolves with `confidence: 'fuzzy'` and evidence; two candidates stay unresolved |
| `GraphMemory` (`@agentskit/memory`) | `createDocBridgeGraphMemory(snapshot, overlay)` exposes the projected graph through `getNode`, `findEdges`, `traverse`, so agents built on AgentsKit walk the repository graph with the same API they use for their own memory |
| `bm25Score`, `createHybridRetriever` (`@agentskit/rag`) | the optional RAG path becomes hybrid over the same `RetrievalIndexV1` entries; the vector store is never required |
| `EvalSuiteDoc`, `matchesExpectation` (`@agentskit/core/eval-format`), `runEval`, `diff`, `ci` (`@agentskit/eval`) | the retrieval golden set is an `EvalSuiteDoc`; `ak-docs bench retrieval` is `runEval` with a deterministic agent function over the index; `@agentskit/eval/ci` produces the regression verdict |
| Harness context provider (`createDocBridgeContextProvider`) | keeps reading `index.knowledge[]`; the projection fills `contentHash`, `tags` (kind, audience, area) and `body` per entry so the harness's substring match improves without a harness release; a follow-up in the harness can switch to `knowledge.search` |

## 4. Deterministic layer

```
Repository
   │
   ▼
Analyzers: js-ts · markdown (remark) · workspace · config
   │  entities + relations + evidence(contentHash) + coverage
   ▼
DiscoverySnapshotV1 ─────────────┐
   │                             │
   ▼                             ▼
Graph (graphology)         Enrichment stage (optional, explicit)
 reconciliation, rules,      curator + reviewer → typed proposals
 PageRank, proximity         validators → EnrichmentOverlayV1
   │                             │
   ▼                             │
RetrievalIndexV1 ◄───────────────┘   project(snapshot, overlay.accepted, config)
   │        (minisearch payload + graph counts + hashes)
   ▼
Ranking → budget (compileBudget) → CLI · MCP · Retriever · RAG · Knap renderings · HTML
```

Invariants in addition to the knowledge-engine PRD:

1. The retrieval index has no scanner of its own; it is a pure function of `(snapshot, overlay, config)`.
2. Overlay entries bind to the `contentHash` of the entity they describe, not to the snapshot hash.
3. Agent signals are additive and bounded: they reorder near-ties, never outrank an exact deterministic match, never remove a fact.
4. Every ranked result carries `explain` and `confidence` computed without an agent.
5. Nothing calls an agent at query time.

### 4.1 Markdown analyzer (remark)

`src/discovery/markdown.ts`, versioned in `analyzerVersions`. For every `.md`/`.mdx`:

Entity metadata on `document`: `title`, `headings[]` (levels 1–3, bounded), `summary`, `wordCount`, frontmatter subset (`type`, `audience`, `owner`, `lifecycle`, `tier`), `generatedRegions[]` (from the markers in §3.2), evidence `contentHash`.

Relations (`provenance: observed`, evidence = file + line from mdast positions):

| Kind | From → To | Detection |
| --- | --- | --- |
| `links-to` | document → document | relative link node resolving to a scanned document |
| `mentions` | document → module / package / area | inline-code or link text equal to a scanned path or package name; directories resolve to areas |
| `mentions-symbol` | document → module | inline-code token equal to an exported name of exactly one module; ambiguous → no edge, one coverage note |
| `covers` | document → entity | unchanged: `docbridge` block (now YAML + Zod) or path convention |

Generated regions are skipped for `mentions`. Per-document relation cap 64 with `evidenceTruncated`. Frontmatter `audience` beats the path regex. Unresolved references try `fuzzyMatchList` before becoming `unresolved-reference` entities.

### 4.2 Areas

Entity kind `area:<dir>`, `contains` edges package → area → module. Default: first directory level under each package's source roots plus any ownership `path`; `analysis.areas.depth` / `roots` configurable. Ownership records attach to their area (`metadata.ownershipId`); a record matching no area yields `OWNERSHIP_PATH_UNOBSERVED`. `reconciliation.scope` gains `area`. When directories are flat, Louvain communities over `imports` are emitted as `coverage` suggestions (`analyzer: graph`, `scope: area-suggestion`) that a human or the curator agent can turn into configuration; they are never areas by themselves.

### 4.3 Per-entity hashes and incremental scan

Every module, document and package entity gets `evidence[0].contentHash`. `discoverRepository` accepts the previous snapshot and reuses unchanged entities and their outgoing relations; `ts.createSourceFile` and remark run only for changed files. Snapshot-level `contentHash` and `sourceRevision` semantics are unchanged.

### 4.4 Retrieval projection

`RetrievalIndexV1` (`src/schemas/retrieval-index.ts`), built by `src/retrieval/project.ts`:

```ts
type RetrievalEntry = {
  id: string
  kind: 'document' | 'module' | 'area' | 'package' | 'intent' | 'change'
  path: string; title: string; summary?: string
  audience?: 'agent' | 'human' | 'human-and-agent'
  fields: { title: string; headings: string; path: string; symbols: string; body: string; aliases: string }
  graph: { pagerank: number; inboundLinks: number; coveredBy: string[]; mentionedBy: string[]; areaId?: string; packageId?: string }
  contentHash: string
  provenance: 'observed' | 'declared' | 'proposed'
  confidence: 'observed' | 'declared' | 'fuzzy' | 'proposed'
}
```

plus the serialised minisearch index (`toJSON`), the stopword list version, `overlayHash` and `graphMetricsVersion`. `DocBridgeIndexV1` is still written for compatibility, and its `knowledge[]` now contains **every** entry (documents, areas, modules, packages) with `contentHash` and `tags`, which is what the harness reads. `search`, `query` and MCP read `RetrievalIndexV1`. Its hash derives from `(snapshotHash, overlayHash, configHash)` so `IndexStaleError` keeps working.

### 4.5 Explainable ranking

```
score(entry, query) =
    minisearch BM25+ over fields (title 4 · headings 3 · symbols 3 · path 2 · aliases 2 · body 1)
  + exactId·200 + exactPath·150 + exactSymbol·150                  // identity
  + graphProximity      // shortest path ≤ 2 from a top-10 lexical hit, via graphology
  + canonicality        // log-scaled PageRank over links-to + covers
  + audienceFit         // --agent prior
  + acceptedAgentSignals   // §5, capped at 15 % of the identity boost
```

- Tokenizer keeps code identifiers whole (`reconcileKnowledge`, `src/mcp/server.ts`) and also emits their split parts (`reconcile`, `knowledge`, `mcp`, `server`); versioned English and Portuguese stopword lists.
- `--explain` (CLI) and `explain: true` (MCP) return minisearch's `terms` and `match` plus each graph component, so "why is this first" has a deterministic answer.
- `confidence` on every result is the minimum over the entry's provenance and the relation that brought it in (`observed` > `declared` > `fuzzy` > `proposed`).

### 4.6 Graph-derived handoffs

`handoffForEntity(id)` in `src/query/handoff.ts` for package, area, module and document ids: `editRoots` from the area or package; `checks` from ownership override → package scripts → defaults with `checksSource`; `startHere` by `covers` > `mentions` > `links-to` proximity then canonicality; `related` from strongest `imports` edges; `explain` naming the relations used. `AgentHandoffV1` stays byte-compatible; new fields are optional.

### 4.7 Budgeted agent payloads

`knowledge.lookup { id | path, depth?, budgetTokens? }` returns entity, neighbours by relation kind, covering and mentioning documents, handoff, open diagnostics and evidence. When `budgetTokens` is set, sections are trimmed through `compileBudget` in a declared order (evidence excerpts → related → neighbours → summary) and the response reports `tokens.total`, `fits` and what was dropped. `formatRetrievedDocuments` renders the same payload as text for clients that want prose. `knowledge.search` wraps ranking with the same budget. Old MCP tools remain as aliases.

### 4.8 Doctor honesty

Three measured dimensions: reachability (documents present in the retrieval index), connectivity (areas with ≥ 1 covering or mentioning document; documents with ≥ 1 code edge) and the retrieval benchmark hit@3 when a golden set exists, otherwise `not-analyzed`. An "A" requires all three.

### 4.9 Human renderings (Knap)

`ak-docs render <template> [--data <artifact>] [--output <path>]` with bundled templates: `llms.txt`, `area.md` (one page per area: purpose, documents, related areas, checks, open findings), `ownership-sidecar.md`, `digest.md` (entities and documents whose hash changed since the last index, for a PR description or changelog), `overlay-review.md` (pending proposals with evidence links). Templates are overridable per project. Rendering is deterministic; the digest is the concrete answer to "what did this change touch and which docs need review".

### 4.10 Phase acceptance on this repository

- `search reconcileKnowledge` → `module:src/reconciliation/reconcile.ts` first.
- `search "workflow transitions persisted"` → runbook or `src/workflow/engine.ts` in the top 3 with an explanation.
- `search and` → zero matches.
- `reconcile` at area scope → at least one `RELATION_UNDOCUMENTED` with evidence.
- `index` idempotent on an unchanged tree; re-parses one file on a one-file change.
- `ak-harness` context provider returns human documents for a query that names one.
- All 365 existing tests pass; index, handoff and MCP tool names remain compatible.

## 5. Enrichment overlay

### 5.1 Typed proposals

`EnrichmentProposalV1` (`src/schemas/enrichment.ts`), a discriminated union with a common envelope: `proposalId` (sha256 of kind, entity, target hash, agent id, prompt version → idempotent), `entity`, `targetContentHash`, `confidence`, `reason`, `evidence` (≥ 1, every item must exist in the snapshot or report), `origin` (agent id and version, prompt version, model, provider), `baseSnapshotHash`, `payload`.

| Kind | Payload | Deterministic validator | Policy |
| --- | --- | --- | --- |
| `classify-document` | type, audience, lifecycle, criticality | enum values; entity is a document | auto-accept |
| `summarize` | summary ≤ 400 chars, language | length; `redactValue` scan; differs from current | auto-accept |
| `add-alias` | alias | ≤ 64 chars; no collision with ids or aliases (`fuzzyMatchList` ≥ 0.95 counts as collision) | auto-accept |
| `add-intent` | phrase, language | ≤ 120 chars; language tag | auto-accept |
| `mark-canonical` | scope entity | scope exists; one canonical per scope, else `conflict` | human approval |
| `propose-relation` | from, to, kind, detection | endpoints exist; kind allowed; not already observed; evidence inside an endpoint | human approval |
| `flag-contradiction` | against, claim, observed | both entities exist; evidence in both | human approval |
| `flag-redundancy` | with | both documents exist; not an exact duplicate | human approval |
| `flag-gap` | area, missing | area exists; gap not already covered | finding only |
| `rank-hint` | relevance strong / weak | entity exists | bounded weight |
| `suggest-area` | directories, name | every directory exists; no overlap with configured areas | human approval → configuration, never an entity |

### 5.2 Overlay artifact, stage and approvals

`EnrichmentOverlayV1 { baseSnapshotHash, accepted[], pending[], rejected[{ proposal, reason }], stats }`, produced by the new workflow stage `enrich` between `reconcile` and `evaluate`, run only by `ak-docs enrich` or `check --enrich`. A missing or failed overlay never changes `check`. Entry-level staleness: an accepted entry whose `targetContentHash` no longer matches is treated as expired at projection time. Human approvals go through `createApprovalGate` from `@agentskit/core/hitl` with a file-backed `ApprovalStore` under `.doc-bridge/approvals/`; `ak-docs fix approve`, MCP `docbridge.proposals` and the Knap-rendered `overlay-review.md` all read and write the same store. Accepted relations carry `provenance: proposed` and render dashed in the HTML report.

### 5.3 Context packs, batching, cache

Agents never receive the whole snapshot. One pack per target entity: the entity, depth-1 neighbours (≤ 32, from graphology), open diagnostics touching it, bounded redacted evidence excerpts; deterministic ordering; 64 KB default budget enforced with `compileBudget`. Packs batch by area. Protocol `doc-bridge.registry-agent.v2` adds `task: curate | review | adjudicate` and `packs[]`, returns `proposals[]`. Cache key = hash of task, agent id and version, prompt version, pack hash; persisted under `.doc-bridge/enrich/cache/`. Unchanged tree → zero agent calls.

### 5.4 Roles

Curator (documents), graph reviewer (structure), adjudicator (only for canonical conflicts and disputed contradictions; must be a different agent id, enforced by the validator). Same adapter, three tasks, roles as configuration. Default stays `ecosystem-doc-bridge-corpus-scanner` as curator.

### 5.5 What the agent should not do

Path and symbol mentions, document links, canonicality, package `exports` → module edges, directory areas, freshness and cycle detection are cheaper and more reliable deterministically (§3.1, §3.3, §4.1, §4.2). The agent's remaining work is genuinely semantic: summaries, natural-language aliases and intents, audience and type when paths are uninformative, contradictions between prose and observed structure, and naming a suggested area.

## 6. Measurement

### 6.1 Retrieval benchmark, local, in CI

The golden set is an `EvalSuiteDoc` (`@agentskit/core/eval-format`):

```json
{ "version": 1, "cases": [
  { "id": "mcp-tool", "input": "where do I add a new MCP tool", "expected": { "anyOf": ["area:src/mcp", "document:docs/mcp.md"] }, "metadata": { "agent": true, "lang": "en" } },
  { "id": "workflow-pt", "input": "onde ficam as transições do workflow", "expected": { "anyOf": ["module:src/workflow/engine.ts"] }, "metadata": { "lang": "pt" } },
  { "id": "symbol", "input": "reconcileKnowledge", "expected": { "anyOf": ["module:src/reconciliation/reconcile.ts"] } }
]}
```

`ak-docs bench retrieval <suite> [--index <path>] [--json]` runs `runEval` from `@agentskit/eval` with a deterministic agent function over the index and reports hit@1, hit@3, MRR, mean `contextBytes` and approximate tokens of the top 3, and zero-result rate. `@agentskit/eval/ci` compares against a committed baseline and fails the job on hit@3 regression. A checked-in suite for this repository (≥ 40 cases, both languages) and one per fixture. This is the number the doctor consumes and the first gate for any ranking change.

### 6.2 Overlay quality

Emitted by `ak-docs enrich --json`: proposals per kind (proposed / accepted / rejected / pending, rejection reasons), invented relations (must trend to zero), stability (identical overlay hashes on two deterministic runs; share of identical `proposalId`s with a live model), cost (runs, bytes, cache hit rate, wall time), and retrieval delta (benchmark with and without the overlay; the overlay must not lower hit@3).

### 6.3 Controlled study arm

After 6.1 shows the deterministic arm answering the benchmark, add `registry-assisted` (already reserved in `task-suite-v1.json`) to the existing runner. Give every task machine-checkable expectations (`expectedEntities`, `expectedDocuments`) checked by the bench command; reserve the model adjudicator for rubric items that cannot be checked mechanically. Add tokens-to-first-evidence as a primary metric, since it is the direct measure of Problem 2.

## 7. Guardrails

1. Enrichment never removes deterministic evidence: the projection asserts `observed ⊆ projected`.
2. No evidence, no entry: every reference must exist in the snapshot or report.
3. Agent unavailable never blocks: `check`, `index`, `search`, `query`, `render` and MCP work with no overlay or an expired one.
4. Provenance on everything: origin, prompt version, target hash, base snapshot hash, status.
5. Reproducible acceptance: re-running validators on the overlay reproduces the same partition.
6. No self-approval: proposer id differs from approver; `acceptedBy: 'policy'` only for auto-accept kinds.
7. Bounded influence: agent signals ≤ 15 % of the identity boost; a test asserts an exact id match outranks any boosted entry.
8. No agent at query time: `search`, `query`, `render` and MCP handlers import nothing from `src/agents`; a lint script enforces it.
9. Privacy: packs pass `redactValue`; full snippets opt-in; nothing leaves the process unless `intelligence.registry` is enabled.
10. Templates cannot execute code: Knap only; no `eval`, no user functions in templates.

## 8. Delivery

| Step | Scope | Main files | Proof |
| --- | --- | --- | --- |
| 1a | minisearch + tokenizer + stopwords; every document, area and module into `knowledge[]` with `contentHash` and `tags` | `src/query/text.ts`, `src/query/search.ts`, `src/index-builder/build-index.ts` | bench hit@3 on this repo; `search and` → 0; harness provider finds human docs |
| 1b | remark-based Markdown analyzer: links, mentions, symbols, hashes; YAML + Zod `docbridge` block | `src/discovery/markdown.ts` (new), `src/discovery/documentation.ts`, `src/lib/markdown.ts` | fixture with 3 docs / 4 modules; existing `DOCBRIDGE_*` codes preserved |
| 1c | areas, area scope, ownership attachment; graphology working graph; PageRank, proximity, cycles | `src/graph/*` (new), `src/discovery/repository.ts`, `src/reconciliation/reconcile.ts`, `src/rules/engine.ts` | ≥ 1 undocumented area relation on this repo; centrality from betweenness |
| 1d | `RetrievalIndexV1`, explain ranking, graph handoffs, `RetrievedDocument` retriever | `src/retrieval/*` (new), `src/query/*`, `src/retriever/*` | compat tests; `--explain` snapshots; `createHybridRetriever` over the retriever |
| 1e | MCP `knowledge.search` / `knowledge.lookup` with `compileBudget`; `Finding` output; doctor v2 | `src/mcp/server.ts`, `src/doctor/run-doctor.ts`, `src/cli/program.ts` | MCP/CLI parity; payload fits declared budget; grade drops on unreachable docs |
| 1f | Knap renderings: `llms.txt`, area pages, sidecars, digest, overlay review | `src/render/*` (new), `templates/*.md` | golden-file tests; digest lists changed entities |
| 3a | `bench retrieval` as `EvalSuiteDoc` + `@agentskit/eval` CI verdict | `src/bench/*` (new), `tests/fixtures/retrieval-suite-*.json`, CI workflow | baseline committed |
| 2a | `EnrichmentProposalV1`, validators, overlay artifact, `enrich` stage, HITL approval store | `src/schemas/enrichment.ts`, `src/enrich/*` (new), `src/workflow/engine.ts` | fake-agent fixtures per kind; expiry test; approval via gate |
| 2b | context packs, batching, persistent cache, protocol v2 | `src/enrich/context-pack.ts`, `src/agents/registry-adapter.ts` | zero calls on unchanged tree |
| 2c | roles, adjudicator, dashed edges, `GraphMemory` export | `src/agents/*`, `src/report/html.ts`, `src/graph/memory.ts` | self-approval rejected; `traverse` over the projected graph |
| 3b | overlay stats; `registry-assisted` arm; tokens-to-first-evidence | `src/study/*` | benchmark delta reported |

Order: 1a → 1b → 1c → 1d → 1e → 1f → 3a → 2a → 2b → 2c → 3b. Each step keeps the existing tests green and adds its own.

Not in this plan: a vector store by default (the optional `@agentskit/rag` path becomes hybrid over the same entries), calling agents from `search` or `render`, splitting the package, package-level configuration overrides, language analyzers beyond JS/TS and Markdown, or a hosted control plane.

## 9. Relation to the earlier sketch

| Earlier sketch | This plan |
| --- | --- |
| Agent enriches the canonical graph that retrieval views read | Same invariant, but first makes retrieval read the graph (§2.1, §4.4); otherwise enrichment is invisible |
| Curator, graph reviewer, separate adjudicator | Kept (§5.4), self-approval rule enforced by the validator |
| Free-form proposal object | Discriminated union with per-kind validators and policies (§5.1); idempotent ids; approvals through the ecosystem HITL gate |
| Use `contentHash` as cache, invalidate the affected subgraph | Needs per-entity hashes that do not exist (§2.5, §4.3); cache keyed on context-pack hash (§5.3) |
| `retrievalScore` as a sum of named terms | BM25+ from minisearch, PageRank and proximity from graphology, bounded agent term, `--explain` (§4.5) |
| Agent proposes relations the scanner cannot infer | Most are inferable; moved to remark, graphology and areas (§4.1–4.2, §5.5) |
| Evaluate three modes with the same task suite | Retrieval benchmark as an `EvalSuiteDoc` in CI first (§6.1); fix adjudication before the third arm (§6.3) |
| Guardrails list | Kept and made testable (§7), plus "no agent at query time", "bounded influence" and "templates cannot execute code" |
| No library or ecosystem decisions | Build-or-borrow table (§3) with licence, size and what each replaces; eight AgentsKit contracts adopted (§3.6) |
| Human side implicit | Knap renderings (§4.9) make every artifact readable and reviewable by humans; the digest answers "which docs does this change touch" |
