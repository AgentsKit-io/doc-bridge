---
title: Knowledge Retrieval and Enrichment
description: Make the deterministic knowledge graph the single source for human and agent retrieval, then add a validated Registry enrichment overlay measured by a local retrieval benchmark.
---

# Knowledge Retrieval and Enrichment

**Tracking issue:** [AgentsKit-io/doc-bridge#169](https://github.com/AgentsKit-io/doc-bridge/issues/169)

## Problem Statement

Doc Bridge exists to solve two problems.

**Problem 1 — humans, documentation and agents do not share one model of the repository.** Humans write Markdown, agents need structure, and both need to know which document is authoritative for which part of the code and whether it is still true. Today that bridge runs in one direction only, from frontmatter to a handoff, and only for the records a human typed into `doc-bridge.config.json`.

**Problem 2 — agents cannot get the right information cheaply or confidently.** An agent that asks for an exported symbol gets nothing. An agent that asks a natural-language question gets the wrong ownership record. The payload it does receive carries no evidence, no confidence and no explanation, so the agent cannot tell a strong answer from a weak one and falls back to reading the repository.

The mechanical cause is a split that contradicts a boundary the project already committed to. Doc Bridge builds two unrelated models of the same repository:

| Model | Built by | Consumed by | Content on this repository |
| --- | --- | --- | --- |
| `DocBridgeIndexV1` | `ak-docs index` (`src/index-builder`) | `search`, `query`, `ask`, `retrieve`, MCP `handoff.resolve`, `doc.search`, `doc.get`, `retriever.query`, RAG ingest, and the `@agentskit/harness` context provider | 11 agent sidecars totalling 3 KB, 11 hand-written ownership records |
| `DiscoverySnapshotV1` | `ak-docs scan`, `reconcile`, `check`, `map` (`src/discovery`, `src/reconciliation`) | `audit`, `rules`, `map --html`, `suggest`, MCP `docbridge.*` | 369 entities, 1 170 relations, 92 documents |

Retrieval never reads the snapshot. `docs/PRD-doc-bridge-knowledge-engine.md` states under "Resolved Product Boundaries" that the index is a projection of the snapshot; the code does not implement that boundary. Every consequence below follows from it.

### Observed evidence

All commands run from the repository root at version 1.8.0 after `pnpm install && pnpm build`.

**1. The graph does not feed retrieval.**

```bash
node bin/ak-docs.js index
node -e 'const i=require("./.doc-bridge/index.json"); console.log(i.knowledge.length, i.lookup.packages.length)'
# 11 11
node bin/ak-docs.js check --json >/dev/null && node -e '
const fs=require("fs"); const d=".doc-bridge/workflow/artifacts";
for (const f of fs.readdirSync(d)) if (f.startsWith("collect-")) {
  const s=JSON.parse(fs.readFileSync(d+"/"+f,"utf8")).value; console.log(s.entities.length, s.relations.length) }'
# 369 1170
```

`searchIndex` in `src/query/search.ts` iterates `index.knowledge`, `lookup.ownership`, `lookup.intents` and `lookup.changes`. None is derived from the snapshot. `buildDocBridgeIndex` calls `scanAgentCorpus` and `scanHumanDocs` and never calls `discoverRepository`.

**2. Human documentation is unsearchable.** `scanHumanDocs` returns an id-to-URL map used only by `resolveHumanDoc` to fill `handoff.humanDoc`. The 80 files the snapshot classifies as `human` never enter `index.knowledge`, so `doc.search`, `retriever.query`, RAG ingest and the harness context provider cannot see them. The doctor still reports `Corpus indexed: 10/10 agent docs` and `Score: 100/100 (A)`, because its denominator is the agent corpus alone.

**3. Lexical scoring has no stopwords, no inverse document frequency, no symbols and no paths.**

```bash
node bin/ak-docs.js search "and" --text                  # 11 matches, every ownership row score=9
node bin/ak-docs.js search "reconcile" --text             # 0 matches
node bin/ak-docs.js search "reconcileKnowledge" --text    # 0 matches
node bin/ak-docs.js search "how does reconciliation compare declared and observed relations" --agent
# bestMatch: doc-bridge-conformance
node bin/ak-docs.js retrieve "where are workflow transitions persisted"
# one chunk: doc-bridge-conformance
```

`scoreHay` awards `token.length * weight + token.length` for any token present in the haystack, so a stopword present in every purpose sentence contributes a constant score to every record, and a long rare identifier is worth the same as a short common word. Exported symbols already recorded in module `metadata.exports` and file paths are never indexed.

**4. Single-package repositories get an empty reconciliation.**

```bash
node bin/ak-docs.js reconcile --json | node -e 'let s="";process.stdin.on("data",c=>s+=c).on("end",()=>{console.log(JSON.parse(s).diagnostics.length)})'
# 0
node bin/ak-docs.js audit documentation --text
# Packages covered: 0/0
```

With `reconciliation.scope: "package"` and one package, every internal relation aggregates into a self-loop, which `reconcileKnowledge` skips, and the audit excludes the root package. Most real repositories are single-package. The ownership configuration already names the missing unit, for example `path: "src/mcp"`, but the graph has no entity for it.

**5. No per-entity content hash.**

```bash
node -e 'const fs=require("fs");const d=".doc-bridge/workflow/artifacts";
for(const f of fs.readdirSync(d)){if(!f.startsWith("collect-"))continue;
const s=JSON.parse(fs.readFileSync(d+"/"+f,"utf8")).value;
console.log(s.entities.filter(e=>e.evidence.some(x=>x.contentHash)).length,"/",s.entities.length)}'
# 0 / 369
```

`EvidenceSchema.contentHash` exists but discovery never fills it. Any cache or overlay can therefore be keyed only on "the whole repository changed", which is true between any two commits. The harness context provider already reads an optional per-entry `contentHash` from `index.knowledge[]` and falls back to the whole-index hash because Doc Bridge supplies none.

**6. Markdown is parsed for frontmatter only.** `src/discovery/documentation.ts` is a hand-written YAML-subset parser for the `docbridge` block and `src/lib/markdown.ts` is a regex frontmatter reader. Headings, links, inline code and tables in the body are discarded, although the information is there:

```bash
grep -rlE '\]\([^)]*\.md' docs --include=*.md | wc -l          # 23 documents link to other documents
grep -rlE '`src/[A-Za-z0-9_./-]+' docs --include=*.md | wc -l   # 14 documents cite source paths
```

Document-to-document and document-to-code edges are free, evidence-backed by file and line, and language-agnostic. Today the only way to link a document to code is the `docbridge` block or a path convention, which is why 1 of 92 documents counts as documented.

**7. The agent contract cannot carry enrichment.** `AgentProposalV1` is `{ relatedDiagnosticIds, rationale, confidence, evidence, intendedChanges: string[], checks }`. It can say "review this finding"; it cannot express a classification, an alias, a summary or a relation. Nothing stores accepted proposals, nothing consumes them, the deterministic cache is an in-process `Map`, and `suggest` sends the entire redacted snapshot, 740 KB on this repository, in one call.

**8. Ecosystem contracts are reimplemented or unused.**

| Doc Bridge today | AgentsKit already provides |
| --- | --- |
| `DocBridgeRetrievedChunk`, a private shape | `Retriever` and `RetrievedDocument` in `@agentskit/core`; `createHybridRetriever`, `createRerankedRetriever`, `bm25Score` in `@agentskit/rag` |
| `contextBytes / 4` token estimate | `approximateCounter` and `compileBudget` with `drop-oldest`, `sliding-window` and `summarize` strategies in `@agentskit/core` |
| file-based `fix approve` | `createApprovalGate` and `ApprovalStore` in `@agentskit/core/hitl` |
| `KnowledgeDiagnostic`, `RuleFinding` and `DocumentationAuditFinding`, three shapes for one concept | `Finding` with `SEVERITY_ORDER` in `@agentskit/core/finding` |
| exact and `endsWith` entity resolution in `resolveEntity` | `fuzzyMatchList`, Jaro-Winkler, in `@agentskit/core/fuzzy-match` |
| no graph export | `GraphMemory` with `upsertNode`, `upsertEdge` and `traverse` in `@agentskit/memory` |
| ad-hoc study task suite | `EvalSuiteDoc`, `EvalCase` and `matchesExpectation` in `@agentskit/core/eval-format`; `runEval`, `replay`, `snapshot`, `diff` and `ci` in `@agentskit/eval` |

The controlled study recorded zero semantic successes in both arms. The split described here is the mechanical reason: the arm that was supposed to carry repository knowledge carried 3 KB of sidecars.

## Solution

Make the deterministic snapshot the single source for every retrieval surface, borrow proven primitives instead of maintaining hand-written ones, adopt the ecosystem contracts the rest of AgentsKit consumes, and only then add a Registry enrichment overlay whose influence is typed, evidence-bound, validated and bounded.

```
Repository
   |
   v
Deterministic analyzers: js-ts, markdown, workspace, configuration
   |  entities + relations + evidence(contentHash) + coverage
   v
DiscoverySnapshotV1 ----------------+
   |                                |
   v                                v
Graph (graphology)            Enrichment stage (optional, explicit)
 reconciliation, rules,         curator and reviewer produce typed proposals
 PageRank, proximity, cycles    deterministic validators produce the overlay
   |                                |
   v                                |
RetrievalIndexV1 <------------------+   project(snapshot, overlay.accepted, config)
   |
   v
Ranking -> budget -> CLI, MCP, Retriever, RAG, Markdown renderings, HTML
```

The enrichment stage never sits on the path of `check`, `index`, `search` or `render`. The deterministic layer is always complete on its own.

Four invariants in addition to those already fixed by the knowledge-engine PRD:

1. The retrieval index has no scanner of its own. It is a pure function of the snapshot, the accepted overlay and the effective configuration.
2. Overlay entries bind to the `contentHash` of the entity they describe, not to the snapshot hash, so one changed file expires one entry rather than the whole overlay.
3. Agent signals are additive and bounded. They may reorder near-ties; they may never outrank an exact deterministic match and never remove or rewrite a deterministic fact.
4. Every ranked result carries an explanation and a confidence level computed without an agent, and no query-time code path calls an agent.

## Product Goals

1. Every document is reachable from the code it describes, and every code area from the documents that describe it.
2. A human writing plain Markdown produces machine-verifiable links to code without learning a schema.
3. The same canonical artifact renders as Markdown for humans and as JSON for agents, with no second source of truth.
4. Agent-produced knowledge reaches humans as reviewable Markdown and never as a silent graph edit.
5. The first retrieval call answers the question, measured as hit@1 and hit@3 on a committed golden query set.
6. Every answer states why it was selected and how confident the engine is in it.
7. Every agent payload fits a declared token budget and reports what was dropped to fit.
8. The same correct answer costs fewer tokens than reading the repository, measured as tokens to first evidence.
9. The complete deterministic path works with no network, no API key and no model.

## User Stories

### Humans, documentation and agents

1. As a documentation author, I want links and code references in ordinary Markdown prose to become verifiable graph edges, so that I do not have to learn a declaration schema to be useful.
2. As a documentation author, I want my frontmatter `audience` and `type` to win over a path heuristic, so that an unconventional layout does not misclassify my document.
3. As a developer, I want one page per code area listing its purpose, documents, related areas, checks and open findings, so that onboarding does not start with a repository walk.
4. As a reviewer, I want a digest of which entities and documents changed since the last index, so that I know which documentation a pull request should have touched.
5. As a maintainer, I want generated Markdown regions marked as generated, so that manual edits inside them are reported instead of being silently overwritten.
6. As a maintainer, I want project-specific templates for every generated Markdown artifact, so that the house style survives the tool.
7. As a reviewer, I want pending agent proposals rendered as a Markdown review page with evidence links, so that I can judge them without reading JSON.
8. As a maintainer, I want documentation and code to disagree loudly at the level of a code area, so that drift is visible in a single-package repository too.

### Agent retrieval

9. As an agent, I want to search an exported symbol and receive the module that exports it, so that a precise question gets a precise answer.
10. As an agent, I want to search a file or directory path and receive that entity, so that I can start from what the user named.
11. As an agent, I want a natural-language question to rank documents and areas by relevance rather than by string presence, so that the first result is usable.
12. As an agent, I want stopwords to contribute nothing, so that a common word cannot flatten the ranking.
13. As an agent, I want non-English documentation ranked by the same rules, so that a Portuguese repository is not second class.
14. As an agent, I want every result to carry its evidence, provenance and confidence, so that I can decide whether to trust it or read the source.
15. As an agent, I want an explanation of the score, so that a wrong ranking is reportable as a bug rather than as bad luck.
16. As an agent, I want one call that returns an entity with its neighbours, its documents, its handoff, its open findings and its evidence, so that I do not need four round trips before editing.
17. As an agent, I want to declare a token budget and receive a payload that fits it, with a list of what was dropped, so that context limits are my decision and not a surprise.
18. As an agent, I want a handoff for a module or a document, not only for a package, so that any starting point routes me correctly.
19. As an agent, I want the checks in a handoff to say where they came from, so that I can tell a configured check from an inferred one.
20. As an agent built on AgentsKit, I want Doc Bridge results as `RetrievedDocument` values, so that the hybrid retriever, the reranker and the runtime consume them without an adapter.
21. As an agent built on AgentsKit, I want to walk the repository graph through `GraphMemory`, so that repository structure uses the same API as my own memory.
22. As an orchestrator using `@agentskit/harness`, I want the Doc Bridge index to contain every document with a per-entry content hash, so that contract context improves without a harness release.

### Deterministic analysis

23. As a developer, I want a real Markdown parser, so that headings, links, inline code and tables become evidence with line positions.
24. As a developer, I want the `docbridge` block validated as YAML against a schema, so that a malformed declaration reports a precise error instead of being partially parsed.
25. As a developer, I want code areas as first-class entities derived from directories and ownership paths, so that reconciliation has a unit between a package and a file.
26. As a developer, I want an ownership path that matches no observed directory reported as a finding, so that configuration drift is visible.
27. As a developer, I want canonicality computed from the documentation link graph, so that the entry point of a documentation set outranks a leaf page.
28. As a developer, I want centrality risk computed from the import graph, so that the signal reflects architecture rather than the count of open findings.
29. As a developer, I want import cycles reported as a diagnostic with evidence, so that a structural problem is not invisible.
30. As a developer, I want every file-backed entity to carry a content hash, so that caches and overlays can invalidate one entity at a time.
31. As a developer, I want an unchanged file to be reused from the previous snapshot, so that scanning a large repository stays affordable.
32. As a developer, I want an ambiguous reference to resolve only when exactly one candidate is close enough, and to stay unresolved otherwise, so that convenience never invents a fact.

### Enrichment

33. As a maintainer, I want agent output as typed proposals with a per-kind schema, so that each kind can be validated and policed separately.
34. As a maintainer, I want a proposal identifier derived from its content, so that re-running enrichment does not duplicate work.
35. As a maintainer, I want low-risk kinds such as a summary or an alias accepted by policy, and structural kinds such as a relation or a canonical marker held for human approval, so that review effort goes where it matters.
36. As a maintainer, I want a proposal without evidence rejected at the boundary, so that an unsupported claim cannot enter the overlay.
37. As a maintainer, I want approvals recorded through the ecosystem approval gate, so that the CLI, MCP and a future console share one record.
38. As a maintainer, I want an accepted entry to expire when the entity it describes changes, so that stale enrichment cannot outlive its evidence.
39. As a maintainer, I want a proposal rejected when its author would also be its approver, so that no agent can approve its own output.
40. As an operator, I want agents to receive a bounded context pack per entity rather than the whole snapshot, so that cost is proportional to what changed.
41. As an operator, I want a persistent cache keyed on the context pack, so that an unchanged repository costs nothing to enrich.
42. As an operator, I want a curator role for documents and a reviewer role for structure, with an independent adjudicator for conflicts, so that responsibilities and failures are separable.
43. As an operator, I want the enrichment stage to be explicit, so that a deterministic check never incurs model cost or network access.
44. As an operator, I want an unavailable or failing agent to leave every deterministic result unchanged, so that assistance is never a dependency.

### Measurement and safety

45. As a maintainer, I want a committed golden query set in the ecosystem evaluation format, so that retrieval quality is a number and not an opinion.
46. As a maintainer, I want continuous integration to fail on a retrieval regression against a stored baseline, so that a ranking change cannot quietly make search worse.
47. As a maintainer, I want the benchmark to run in milliseconds without a model, so that it gates every pull request.
48. As a maintainer, I want the health score to fall while documentation is unreachable, so that the score cannot report success the product does not deliver.
49. As a maintainer, I want overlay quality measured as accepted, rejected and invented proposals per kind, so that an agent that degrades the graph is caught.
50. As a maintainer, I want the benchmark run with and without the overlay, so that enrichment has to prove it helps.
51. As a product owner, I want tokens to first evidence measured per scenario, so that the efficiency claim is falsifiable.
52. As a product owner, I want the assisted study arm to run only after the deterministic arm answers the benchmark, so that model spend follows a working baseline.

## Implementation Decisions

### Build or borrow

A library enters the runtime dependency list only when it is deterministic, has no native dependencies, is MIT or Apache-2 licensed, and replaces code Doc Bridge would otherwise maintain. Everything model-related stays behind the existing optional-peer boundary. Versions below were verified against the npm registry.

**Markdown to JSON: remark.** `remark-parse` 11, `remark-frontmatter` 5, `remark-gfm` 4, `mdast-util-to-string` 4, `unist-util-visit` 5 and `yaml` 2, all MIT, pure JavaScript and ESM, which the package already is. This replaces the regex frontmatter reader in `src/lib/markdown.ts`, the hand-written block parser in `src/discovery/documentation.ts`, `extractSearchBody`, `firstHeading` and `firstParagraph`. It provides headings with levels, links with resolved targets, inline code, tables, task lists and a line and column position on every node for evidence. The `docbridge` block becomes real YAML validated by a Zod schema; existing `DOCBRIDGE_*` diagnostic codes are preserved as mappings from Zod issues so current tests keep their contract.

**JSON to Markdown: knap.** `knap` 0.5 from Obsidian, MIT, one dependency, with a CLI (`knap render template.md --data data.json`) and a library API (`createEngine({ filters }).renderOrThrow(template, { variables })`). The property that matters is that templates parse to an abstract syntax tree and are interpreted without `eval` or arbitrary JavaScript, and the application controls every variable. This replaces string concatenation in `src/index-builder/llms-txt.ts`, `src/memory/pipeline.ts`, `src/memory/github-pr.ts`, `bootstrap agent-docs` and the text modes of `doctor`, `audit` and `ask`. It enables one artifact with two renderings: the retrieval projection becomes `llms.txt`, area pages, ownership sidecars, a change digest and the overlay review page. Every generated region carries a `<!-- doc-bridge:generated hash=... -->` marker so the Markdown analyzer skips its own output when collecting mentions and the audit can report manual edits inside generated regions under the existing `generated-freshness` category.

**Graph: graphology.** `graphology` 0.26 (MIT, one dependency) with `graphology-metrics` 2.4 for degree, betweenness, closeness, eigenvector, PageRank and HITS, `graphology-shortest-path` 2.1, `graphology-dag` for topological order and cycle detection, and optionally `graphology-communities-louvain` 2.0, which accepts a seeded random number generator. This replaces the ad-hoc `packageLookup` and aggregation helpers in `src/reconciliation/reconcile.ts` and the "count of undocumented findings" centrality heuristic in `src/rules/engine.ts`. Canonicality comes from PageRank over `links-to` and `covers`; proximity comes from bounded shortest paths; `centrality-risk` comes from betweenness on the import graph; import cycles become a diagnostic. Louvain communities are emitted only as an area suggestion for a human or the curator to confirm, never as authority. The graph is an in-memory working structure built from the snapshot in `src/graph/build.ts`; the `DiscoverySnapshotV1` envelope does not change and graphology's own format is never serialised. Node iteration is sorted before every metric call so artifact hashes stay stable.

**Lexical ranking: minisearch.** `minisearch` 7.2, MIT, zero dependencies, Node and browser. It provides a modern term-frequency ranking with tunable saturation and length normalisation, per-field boosting, a custom tokenizer and term processor for stopwords and code identifiers, prefix and fuzzy matching, per-result term and field match information for explanations, and `toJSON`/`loadJSON` so the index is a committed artifact. It replaces `scoreHay`, `identityBoost` and the hand-rolled tie-breaking in `src/query/search.ts`. Graph-derived boosts, audience fit, overlay signals and the explanation are computed by Doc Bridge on top of it. Alternatives considered and rejected: `@orama/orama` is Apache-2 with hybrid vector search and per-language stemmers but is heavier and vector search belongs behind the optional peer boundary; `flexsearch` is fast with opaque scoring; `wink-bm25-text-search` pulls an English language model. If maintainers prefer no new runtime dependency, a small in-repository implementation with the same tokenizer is acceptable: the requirement is inverse document frequency, stopwords and field weights, not a specific package.

**Token counting.** Exact tokenizers are heavy and provider-specific: `js-tiktoken` 1.0 and `gpt-tokenizer` 4.0 unpack to 22 and 27 MB respectively because they ship byte-pair ranks, and they count OpenAI tokens only. The default stays a heuristic, but the ecosystem one, `approximateCounter` from `@agentskit/core`, reported as `tokenMethod: 'approximate'`. Exact counting becomes an optional peer selected by configuration and used only by the benchmark and the study, never by `search`.

### AgentsKit contracts to adopt

| Contract | Where it plugs in |
| --- | --- |
| `Retriever`, `RetrievedDocument` | `createDocBridgeRetriever` returns `RetrievedDocument[]` with `metadata: { kind, path, evidence, explain, confidence }`, so `createHybridRetriever`, `createRerankedRetriever`, `formatRetrievedDocuments` and the runtime consume Doc Bridge unchanged |
| `compileBudget`, `approximateCounter` | `knowledge.lookup` and `handoff.resolve` accept `budgetTokens`; sections drop in a declared order until the payload fits; the response reports `tokens.total`, `fits` and what was dropped |
| `createApprovalGate`, `ApprovalStore` | overlay approvals, with a file-backed store under `.doc-bridge/approvals/`, shared by the CLI, MCP and the rendered review page |
| `Finding`, `SEVERITY_ORDER` | `ak-docs check --json --format finding` and MCP `docbridge.diagnostics { format: 'finding' }` emit the canonical shape so Code Review, AKOS and dashboards need no Doc Bridge specific parser |
| `fuzzyMatchList` | entity resolution in the Markdown analyzer and the query layer: one candidate at or above 0.92 resolves with `confidence: 'fuzzy'` and evidence, two candidates stay unresolved |
| `GraphMemory` | `createDocBridgeGraphMemory(snapshot, overlay)` exposes the projected graph through `getNode`, `findEdges` and `traverse` |
| `bm25Score`, `createHybridRetriever` | the optional RAG path becomes hybrid over the same projection entries, and a vector store is never required |
| `EvalSuiteDoc`, `matchesExpectation`, `runEval`, `@agentskit/eval/ci` | the golden query set is an evaluation suite, the benchmark is an evaluation run over a deterministic agent function, and the regression verdict comes from the ecosystem CI helper |
| `createDocBridgeContextProvider` in `@agentskit/harness` | keeps reading `index.knowledge[]`; the projection fills `contentHash`, `tags` and `body` per entry so harness context improves with no harness release, and a later harness change can switch to `knowledge.search` |

### Deterministic layer

**Markdown analyzer.** A new `markdown` analyzer in `src/discovery/markdown.ts`, versioned in `analyzerVersions` alongside `js-ts`. Document entities gain `title`, bounded `headings` for levels one to three, `summary`, `wordCount`, a frontmatter subset (`type`, `audience`, `owner`, `lifecycle`, `tier`), `generatedRegions` and an evidence `contentHash`. Relations are observed, with file and line evidence from node positions:

| Kind | From and to | Detection |
| --- | --- | --- |
| `links-to` | document to document | a relative link node resolving to a scanned document |
| `mentions` | document to module, package or area | inline code or link text equal to a scanned path or package name; a directory resolves to its area |
| `mentions-symbol` | document to module | an inline code token equal to an exported name of exactly one module; an ambiguous token produces no edge and one coverage note |
| `covers` | document to entity | unchanged: the `docbridge` block, now YAML validated by Zod, or the existing path convention |

Generated regions are excluded from `mentions`. Relations per document are capped, 64 by default, with `evidenceTruncated` metadata mirroring the existing aggregation behaviour. An unresolved reference is offered to `fuzzyMatchList` before becoming an `unresolved-reference` entity.

**Areas.** A new entity kind `area:<dir>` with `contains` relations from package to area to module. The default is the first directory level under each package's source roots, plus any path named by `routing.options.ownership`, configurable through `analysis.areas.depth` and `analysis.areas.roots`. Each ownership record attaches to its area through `metadata.ownershipId`; a record matching no observed directory produces `OWNERSHIP_PATH_UNOBSERVED` with status `stale-or-unverified`. `reconciliation.scope` gains `area`, which replaces package self-loops with area-to-area relations so a single-package repository produces actionable `RELATION_UNDOCUMENTED` findings, and the audit's package filter extends to areas when a repository has exactly one package. When directories are flat, seeded Louvain communities over the import graph are emitted as `coverage` entries with `analyzer: graph` and `scope: area-suggestion` for a human or the curator to promote into configuration.

**Hashes and incremental scan.** Every module, document and package entity receives `evidence[0].contentHash`, the hash of its file; `external` entities receive none. `discoverRepository` accepts an optional previous snapshot and reuses entities and their outgoing relations whose file hash is unchanged, so the TypeScript parser and remark run only for changed files, and coverage records `reusedEntities`. Snapshot `contentHash` and `sourceRevision` semantics do not change.

**Retrieval projection.** `RetrievalIndexV1` in `src/schemas/retrieval-index.ts`, built by `src/retrieval/project.ts` from the snapshot, the accepted overlay and the configuration:

```ts
type RetrievalEntry = {
  id: string
  kind: 'document' | 'module' | 'area' | 'package' | 'intent' | 'change'
  path: string
  title: string
  summary?: string
  audience?: 'agent' | 'human' | 'human-and-agent'
  fields: { title: string; headings: string; path: string; symbols: string; body: string; aliases: string }
  graph: {
    pagerank: number
    inboundLinks: number
    coveredBy: string[]
    mentionedBy: string[]
    areaId?: string
    packageId?: string
  }
  contentHash: string
  provenance: 'observed' | 'declared' | 'proposed'
  confidence: 'observed' | 'declared' | 'fuzzy' | 'proposed'
}
```

The artifact also carries the serialised lexical index, the stopword list version, `overlayHash` and `graphMetricsVersion`. `DocBridgeIndexV1` is still written for compatibility, and its `knowledge[]` now contains every projected entry with `contentHash` and `tags`, which is what the harness reads. Body text is bounded by the existing text budget and stored once, so RAG ingest reads the same entries. The projection's content hash derives from the snapshot hash, the overlay hash and the configuration hash, so `IndexStaleError` keeps working.

**Ranking.** `src/retrieval/rank.ts` replaces the internals of `searchIndex` while keeping its public signature, plus an `explain` option:

```
score(entry, query) =
    lexical score over fields (title 4, headings 3, symbols 3, path 2, aliases 2, body 1)
  + exactId * 200 + exactPath * 150 + exactSymbol * 150
  + graphProximity        // shortest path of at most 2 from a top-ten lexical hit
  + canonicality          // log-scaled PageRank over links-to and covers
  + audienceFit           // the --agent prior
  + acceptedAgentSignals  // bounded, see the overlay section
```

The tokenizer keeps code identifiers whole and additionally emits their parts, so `reconcileKnowledge` matches both itself and `reconcile`. Stopword lists for English and Portuguese ship versioned inside the index so results stay reproducible. Field weights are configuration under `retrieval.weights` with tested defaults; no other algorithm internals are exposed. `--explain` on the CLI and `explain: true` over MCP return the matched terms and fields plus each graph component. `confidence` on a result is the minimum of the entry's provenance and the provenance of the relation that surfaced it. The existing intent heuristics survive as a prior on `kind` rather than as a hard filter.

**Handoffs.** `handoffForPackage` becomes `handoffForEntity(id)` in `src/query/handoff.ts`, valid for package, area, module and document identifiers. `editRoots` is the area or package path, and for a module its area. `checks` resolve from an ownership override, then package scripts, then `defaultChecksForTarget`, with `metadata.checksSource` naming the origin. `startHere` is the highest-ranked document by `covers`, then `mentions`, then `links-to` proximity, then canonicality, and `readBeforeEditing` adds the next two plus `AGENTS.md`. `related` lists the strongest importing and imported areas with evidence, and `explain` names the relations that produced each field. `AgentHandoffV1` stays byte-compatible; `related`, `explain` and `evidence` are optional additions.

**MCP.** Two new tools, with the existing ones kept as thin aliases. `knowledge.search { query, kinds?, limit?, explain?, budgetTokens? }` returns ranked entries. `knowledge.lookup { id | path, depth?, budgetTokens? }` returns the entity, its neighbours by relation kind, the documents that cover or mention it, its handoff, its open diagnostics and its evidence: the single call an agent makes before editing. When `budgetTokens` is present, both trim through `compileBudget` in the declared order of evidence excerpts, then `related`, then neighbours, then summaries, and report `tokens.total`, `fits` and the dropped sections.

**Doctor.** Three measured dimensions are added and can lower the grade: reachability, the share of document entities present in the projection; connectivity, the share of areas with at least one covering or mentioning document and of documents with at least one outgoing code edge; and the retrieval benchmark hit@3 when a golden set exists, otherwise reported as `not-analyzed`. An A grade requires all three. On this repository the grade falls until the human documentation is indexed, which is the honest state.

**Human renderings.** `ak-docs render <template> [--data <artifact>] [--output <path>]`, with bundled templates for `llms.txt`, one page per area, ownership sidecars, a change digest listing entities and documents whose hash moved since the last index, and the overlay review page. Templates are overridable per project under `render.templates`. Rendering is deterministic and never calls an agent.

### Enrichment overlay

**Typed proposals.** `EnrichmentProposalV1` in `src/schemas/enrichment.ts` is a discriminated union. The common envelope is `proposalId`, the hash of kind, entity, target content hash, agent identity and prompt version, which makes re-runs idempotent; `entity`, which must exist in the snapshot; `targetContentHash`, the entity's hash at proposal time; `confidence`; a bounded `reason`; `evidence`, at least one item and every item present in the snapshot or report; `origin` with agent identity, version, prompt version, model and provider; `baseSnapshotHash`; and a per-kind `payload`.

| Kind | Payload | Deterministic validator | Policy |
| --- | --- | --- | --- |
| `classify-document` | type, audience, lifecycle, criticality | enumerated values; the entity is a document | accept by policy |
| `summarize` | summary up to 400 characters, language | length; redaction scan; differs from the current summary | accept by policy |
| `add-alias` | alias | at most 64 characters; no collision with an identifier or alias, where a fuzzy score at or above 0.95 counts as a collision | accept by policy |
| `add-intent` | phrase, language | at most 120 characters; language tag present | accept by policy |
| `mark-canonical` | scope entity | the scope exists; at most one canonical document per scope after the merge, otherwise a conflict | human approval |
| `propose-relation` | from, to, kind, detection | both endpoints exist; the kind is allowed; the relation is not already observed; the evidence lies inside one endpoint | human approval |
| `flag-contradiction` | against, claim, observed | both entities exist; evidence in both | human approval |
| `flag-redundancy` | with | both documents exist; they are not already exact duplicates | human approval |
| `flag-gap` | area, missing | the area exists; the gap is not already covered | accepted as a finding, never as a fact |
| `rank-hint` | relevance, strong or weak | the entity exists | accept by policy, bounded weight |
| `suggest-area` | directories, name | every directory exists; no overlap with a configured area | human approval, then configuration, never an entity |

Any other kind fails schema validation and is recorded as rejected with reason `invalid-kind`.

**Overlay artifact and stage.** `EnrichmentOverlayV1` carries the artifact metadata plus `accepted` entries with `acceptedAt` and `acceptedBy` of either `policy` or a person, `pending` entries awaiting approval, `rejected` entries with a reason, and `stats` by kind with agent runs, cache hits and input and output bytes. A new workflow stage `enrich` sits between `reconcile` and `evaluate` and runs only from `ak-docs enrich` or `check --enrich`. A missing, failed or stale overlay never changes `check` results. Staleness is per entry: at projection time an accepted entry whose `targetContentHash` no longer matches its entity is treated as expired and excluded from ranking, and a read never rewrites the overlay file. Human approvals go through `createApprovalGate` over a file-backed store under `.doc-bridge/approvals/`, shared by `ak-docs fix approve`, MCP `docbridge.proposals` and the rendered review page, and bind to both `proposalId` and `targetContentHash`. Accepted relations enter the projection with `provenance: proposed` and render as dashed edges in the HTML report. No overlay entry deletes or alters observed data.

**Context packs, batching and cache.** Agents never receive the whole snapshot. `src/enrich/context-pack.ts` builds one pack per target entity holding the entity, its depth-one neighbours from the graph up to 32, the open diagnostics that touch it, and bounded redacted evidence excerpts, in deterministic order with deterministic truncation, under a 64 KB default budget enforced by `compileBudget` and configurable as `intelligence.registry.maxPackBytes`. Packs are grouped by area into batches. The adapter protocol becomes `doc-bridge.registry-agent.v2` with a `task` of `curate`, `review` or `adjudicate` and a `packs` array, returning a `proposals` array. The cache key is the hash of task, agent identity and version, prompt version and pack hash, where the pack hash covers the target and neighbour content hashes, persisted under `.doc-bridge/enrich/cache/`, so an unchanged repository makes no agent calls and a one-document change re-runs only the packs whose hash moved.

**Roles.** The curator handles documents: classification, summaries, aliases, intents, canonical markers, redundancy and gaps. The graph reviewer handles structure: proposed relations, contradictions, gaps, rank hints and area suggestions. The adjudicator is invoked only for canonical conflicts and for contradictions the other two dispute, and must have a different agent identity; the validator rejects an adjudication whose origin matches any proposal it judges. One adapter serves three tasks, roles are configuration under `intelligence.registry.roles`, and the default remains the existing corpus scanner as curator only.

**What the agent must not do.** Path and symbol mentions, document links, canonicality, package export to module relations, directory areas, freshness and cycle detection are all cheaper and more reliable deterministically and belong to the analyzers. The agent's remaining work is genuinely semantic: summaries, natural-language aliases and intents, audience and type when paths are uninformative, contradictions between prose and observed structure, and naming a suggested area.

### Measurement

**Retrieval benchmark.** The golden query set is an `EvalSuiteDoc`:

```json
{ "version": 1, "cases": [
  { "id": "mcp-tool", "input": "where do I add a new MCP tool",
    "expected": { "anyOf": ["area:src/mcp", "document:docs/mcp.md"] },
    "metadata": { "agent": true, "lang": "en" } },
  { "id": "workflow-pt", "input": "onde ficam as transicoes do workflow",
    "expected": { "anyOf": ["module:src/workflow/engine.ts"] },
    "metadata": { "lang": "pt" } },
  { "id": "symbol", "input": "reconcileKnowledge",
    "expected": { "anyOf": ["module:src/reconciliation/reconcile.ts"] } }
]}
```

`ak-docs bench retrieval <suite> [--index <path>] [--json]` runs the suite through `runEval` with a deterministic agent function over the projection and reports hit@1, hit@3, mean reciprocal rank, mean context bytes and approximate tokens for the top three results, and the zero-result rate. `@agentskit/eval/ci` compares against a committed baseline and fails on a hit@3 regression; the baseline is replaced only through the audited path the study already uses. A suite of at least 40 cases in both languages is committed for this repository, plus one per fixture. This is the number the doctor consumes and the first gate for any ranking change.

**Overlay quality.** `ak-docs enrich --json` and the overlay `stats` report proposals per kind as proposed, accepted, rejected and pending with a rejection-reason histogram; invented relations, meaning proposals rejected for non-existent endpoints, which must trend to zero; stability, as identical overlay hashes across two deterministic runs and the share of identical proposal identifiers across two live-model runs; cost, as agent runs, input and output bytes, cache hit rate and wall time; and the retrieval delta, the benchmark run with and without the overlay on the same projection, where the overlay must not lower hit@3.

**Controlled study arm.** Once the benchmark shows the deterministic arm answering, the `registry-assisted` scenario already reserved in `docs/study/task-suite-v1.json` is added to the existing runner. The adjudication that produced zero semantic successes in both arms is corrected first: every task receives machine-checkable expectations, `expectedEntities` and `expectedDocuments`, verified by the benchmark command, and the model adjudicator is reserved for rubric items that cannot be checked mechanically. Tokens to first evidence becomes a primary metric because it is the direct measure of the second problem.

### Guardrails

1. Enrichment never removes deterministic evidence: the projection asserts that every observed entity and relation is present.
2. No evidence, no entry: at least one evidence item, and every reference must exist in the snapshot or report.
3. An unavailable agent never blocks: `check`, `index`, `search`, `query`, `render` and MCP all work with no overlay or an expired one.
4. Provenance on everything: origin, prompt version, target content hash, base snapshot hash and status.
5. Reproducible acceptance: re-running the validators over a stored overlay reproduces the same accepted, pending and rejected partition.
6. No self-approval: the proposer identity differs from the approver, and `acceptedBy: 'policy'` is legal only for accept-by-policy kinds.
7. Bounded influence: accepted agent signals contribute at most 15 percent of the identity boost, and a test asserts that an exact identifier match outranks any overlay-boosted entry.
8. No agent at query time: `search`, `query`, `render` and the MCP handlers import nothing from `src/agents`, enforced by a check in the style of the existing import guard script.
9. Privacy: context packs pass the existing redaction helper, full snippets remain opt-in, and nothing leaves the process unless `intelligence.registry` is explicitly enabled.
10. Templates cannot execute code: rendering uses the template engine only, with no `eval` and no user-supplied functions.

### Delivery workstreams

Each workstream is a sub-issue of this PRD. Order is KR-01 through KR-06, then KR-07, then KR-08 through KR-10, then KR-11. Every workstream keeps the existing test suite green and adds its own tests.

| ID | Workstream | Main files | Proof |
| --- | --- | --- | --- |
| KR-01 | Lexical ranking and full corpus in the index: stopwords, inverse document frequency, field weights, code-identifier tokenizer, and every document, area and module projected into `knowledge[]` with `contentHash` and `tags` | `src/query/text.ts`, `src/query/search.ts`, `src/index-builder/build-index.ts` | `search and` returns nothing; benchmark hit@3 recorded; the harness context provider finds human documents |
| KR-02 | Markdown analyzer on remark: links, mentions, symbols, headings, hashes, and the `docbridge` block as YAML validated by Zod | `src/discovery/markdown.ts` (new), `src/discovery/documentation.ts`, `src/lib/markdown.ts` | a fixture with three documents and four modules yields the expected relation identifiers; existing `DOCBRIDGE_*` codes preserved |
| KR-03 | Areas, area scope and ownership attachment | `src/discovery/repository.ts`, `src/reconciliation/reconcile.ts`, `src/config/schema.ts`, `src/audit/documentation.ts` | this repository yields at least one undocumented area relation with evidence; an unobserved ownership path is reported |
| KR-04 | Graph layer on graphology: PageRank canonicality, bounded proximity, betweenness centrality risk, cycle diagnostics, seeded community suggestions | `src/graph/*` (new), `src/rules/engine.ts` | metrics are stable across runs; centrality risk no longer derives from finding counts |
| KR-05 | Per-entity content hashes and incremental scan | `src/discovery/repository.ts`, `src/index-builder/content-hash.ts` | an unchanged tree reuses every entity; a one-file change re-parses one file |
| KR-06 | Retrieval projection, explainable ranking, graph-derived handoffs and the `RetrievedDocument` retriever | `src/schemas/retrieval-index.ts` (new), `src/retrieval/*` (new), `src/query/*`, `src/retriever/*` | compatibility tests for the index and handoff schemas; explanation snapshots; the ecosystem hybrid retriever consumes the output |
| KR-07 | Retrieval benchmark as an evaluation suite with a continuous integration gate | `src/bench/*` (new), `tests/fixtures/retrieval-suite-*.json`, `.github/workflows/ci.yml` | a committed baseline; the job fails on an injected ranking regression |
| KR-08 | MCP `knowledge.search` and `knowledge.lookup` with token budgets, canonical `Finding` output, and the measured doctor | `src/mcp/server.ts`, `src/doctor/run-doctor.ts`, `src/cli/program.ts` | MCP and CLI parity; a payload fits a declared budget and reports what was dropped; the grade falls while documentation is unreachable |
| KR-09 | Markdown renderings on knap: `llms.txt`, area pages, ownership sidecars, change digest, overlay review page | `src/render/*` (new), `templates/*` | golden-file tests; the digest lists exactly the entities whose hash moved |
| KR-10 | Enrichment overlay: proposal schema, validators, the `enrich` stage, context packs, persistent cache, roles, adjudication and approvals through the ecosystem gate | `src/schemas/enrichment.ts` (new), `src/enrich/*` (new), `src/agents/registry-adapter.ts`, `src/workflow/engine.ts`, `src/report/html.ts` | deterministic fake-agent fixtures per kind; expiry, self-approval rejection and zero-call cache behaviour |
| KR-11 | Overlay statistics, the assisted study arm and tokens to first evidence | `src/study/*` | the benchmark delta with and without the overlay is reported |

## Testing Decisions

Tests verify observable contracts and outputs rather than internal helper structure, and preserve the existing conventions: Vitest for TypeScript modules and Node contract tests for packaged CLI, plugin and artifact behaviour.

- Tokenizer and ranking: stopwords in both languages contribute nothing; a code identifier matches whole and split; an exact identifier, path and symbol each outrank a body-text match; ties break deterministically; the explanation names every component that contributed.
- Markdown analyzer: fixtures cover a link to a document, a path mention, a symbol mention, an ambiguous symbol that produces no edge, a generated region that is skipped, a malformed `docbridge` block that maps to its existing diagnostic code, and a document with more mentions than the cap.
- Areas: a single-package repository produces area entities and at least one undocumented area relation; an ownership path with no matching directory produces its finding; a flat layout produces area suggestions but no area entities.
- Graph: canonicality, proximity, betweenness and cycle detection are computed from fixed fixtures with expected values; a seeded community run is reproducible; sorting makes metrics independent of insertion order.
- Hashes and incremental scan: two runs over an unchanged tree produce identical snapshots and reuse every entity; changing one file re-parses exactly that file; the reported coverage names the reuse.
- Projection: the projection is a pure function, asserted by building it twice and comparing hashes; every observed entity appears; `DocBridgeIndexV1` and `AgentHandoffV1` remain schema-compatible and their existing tests pass unchanged; staleness detection still triggers on a configuration change.
- Budgets: a payload with a small budget fits, reports the dropped sections in the declared order, and never drops evidence required by the guardrails before lower-priority sections.
- Retriever: the returned values satisfy the ecosystem `RetrievedDocument` shape and are accepted by the hybrid retriever and the text formatter without an adapter.
- Overlay: each proposal kind has a valid fixture and at least one rejection fixture; a proposal referencing an unknown entity, an unknown diagnostic or outside evidence is rejected; an entry expires when its target hash changes while its siblings survive; a self-approval attempt is rejected; validators re-run over a stored overlay reproduce the same partition.
- Enrichment cost: an unchanged tree makes zero agent calls; a one-document change re-runs only the affected packs; a pack never exceeds its byte budget; redaction is asserted on pack contents.
- Isolation: a failing, timing-out or absent agent leaves `check`, `index`, `search`, `query` and `render` byte-identical; an import guard test fails if a query-path module imports the agent layer.
- Renderings: every bundled template has a golden file; a project override replaces the bundled template; generated markers are present and stable; a manual edit inside a generated region is reported by the audit.
- Benchmark: the suite runs without a model; an injected ranking regression fails the gate; the baseline cannot be replaced by a normal run.
- Dogfood: the whole pipeline runs on this repository and on one synthetic chaotic fixture without modifying tracked source, and the documented acceptance commands are executed as tests rather than described.

## Acceptance Criteria

1. `ak-docs search reconcileKnowledge` returns `module:src/reconciliation/reconcile.ts` as the first result.
2. `ak-docs search "workflow transitions persisted"` returns the runbook or `module:src/workflow/engine.ts` within the top three, with an explanation naming the matched terms and graph components.
3. `ak-docs search and` returns no matches.
4. Every document entity in the snapshot is present in the retrieval projection, and the doctor reports reachability of 100 percent for this repository.
5. `ak-docs reconcile` at area scope produces at least one `RELATION_UNDOCUMENTED` finding with file and line evidence on this repository.
6. Every module, document and package entity carries a content hash, and a second run over an unchanged tree reuses all of them.
7. Building the retrieval projection twice from the same snapshot, overlay and configuration produces identical content hashes.
8. `DocBridgeIndexV1`, `AgentHandoffV1`, the existing MCP tool names and the existing `DOCBRIDGE_*` diagnostic codes remain compatible, and the current test suite passes unchanged.
9. `knowledge.lookup` with a declared token budget returns a payload that fits it and reports `tokens.total`, `fits` and the dropped sections.
10. The Doc Bridge retriever returns values accepted by `createHybridRetriever` and `formatRetrievedDocuments` without an adapter.
11. `ak-docs check --format finding` emits the canonical ecosystem finding shape.
12. `ak-docs render` produces `llms.txt`, one page per area, ownership sidecars, a change digest and the overlay review page, all deterministic and marked as generated.
13. `ak-docs bench retrieval` runs without a model, reports hit@1, hit@3, mean reciprocal rank and context cost, and fails against a committed baseline when a ranking regression is injected.
14. The doctor grade reflects reachability, connectivity and benchmark hit@3, and an A grade is unreachable while documentation is unreachable.
15. Every enrichment proposal kind has a deterministic validator, and a proposal without evidence, with an unknown entity or with outside evidence is rejected at the boundary.
16. An accepted overlay entry expires when its target content hash changes, without affecting unrelated entries.
17. A proposal whose author is also its approver is rejected, and every approval is recorded through the ecosystem approval gate against a proposal hash.
18. An exact identifier match outranks any overlay-boosted entry, asserted by test.
19. With the Registry disabled, absent or failing, `check`, `index`, `search`, `query`, `render` and MCP produce identical results to a run with no overlay.
20. `ak-docs enrich` over an unchanged repository makes zero agent calls, and a one-document change re-runs only the affected context packs.
21. The retrieval benchmark run with the overlay does not score lower than the run without it.
22. No module on the query, index or render path imports the agent layer, enforced by a check in continuous integration.

## Out of Scope

- A vector store or embeddings as a default requirement; the optional RAG path becomes hybrid over the same projection entries and stays an optional peer.
- Calling an agent from `search`, `query`, `render` or any other query-time path.
- Language analyzers beyond JavaScript, TypeScript and Markdown in this PRD.
- Splitting the package into multiple npm packages.
- Package-level configuration overrides, which remain reserved by the knowledge-engine PRD.
- Replacing `DiscoverySnapshotV1`, `DocBridgeIndexV1` or `AgentHandoffV1` with an incompatible version.
- Automatic application of any semantic change without human approval.
- A hosted control plane, a database-backed store or telemetry leaving the process.
- Exact provider tokenizers as a runtime dependency.
- Claiming a token or correctness improvement from the benchmark alone; the study remains the vehicle for a causal claim.

## Further Notes

The invariant the earlier sketch got right is that deterministic facts must never be silently replaced by probabilistic output. The part it missed is that the graph an agent would enrich is not the graph an agent reads, so enrichment applied first would improve nothing measurable. That ordering is the substance of this PRD: connect the graph to retrieval, prove the connection with a benchmark that costs milliseconds, and only then spend model budget on the semantic work that remains.

Most of what the sketch assigned to an agent is deterministically inferable. Path and symbol mentions, document links, canonical entry points, package export relations, directory areas, freshness and import cycles all come from a real Markdown parser and a graph library. Moving them out of the agent's scope makes the remaining agent work smaller, cheaper and easier to validate, and it makes the failure modes of assistance obvious rather than diffuse.

The two problems are also one problem seen from two sides. A document that is reachable from the code it describes is exactly the document an agent can find cheaply, and an artifact that renders as both Markdown and JSON is exactly the artifact that stops humans and agents from maintaining separate truths. The measurable form of that claim is the retrieval benchmark plus tokens to first evidence; everything else in this document exists to make those two numbers move honestly.
