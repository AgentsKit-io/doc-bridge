# Changelog

## 1.11.2

### Patch Changes

- 221b4a6: Retire a deprecated ecosystem contract and generated documentation references.

## 1.11.1

### Patch Changes

- faf29f5: Stop reporting a path an ignore rule rescues as unreproducible.
  
  `git check-ignore --verbose` emits a record for every path that *matched* a rule, including the path
  a `!` negation rescues — and such a path is precisely one Git does not ignore. The reproducibility
  check read the record without reading the pattern, so `dist/*` plus `!dist/keep.js` reported
  `dist/keep.js` as a reason the index could not be rebuilt from a clean checkout. The opposite of
  what the rule says, stated confidently.
  
  The window is narrow: `check-ignore` stops reporting a path once it is committed, and a path rescued
  by a negation is usually committed, which is the point of rescuing it. It shows up while such a path
  is still untracked — a file added but not yet committed.
  
  Found by turning the new `index-reproducible` gate on in this repository, which had to add
  `!.doc-bridge/index.json` to its own `.gitignore` to commit the index the gate verifies.

## 1.11.0

### Minor Changes

- 25f16f3: Say when a committed index could not have come from a clean checkout.
  
  A scan walks what is on disk and has no reason to consult `.gitignore`, so a generated module or
  document silently joins the corpus on a machine that has built and silently leaves it on one that
  has not. That is harmless while the index is rebuilt on every run. It is a defect the moment the
  index is committed so a gate can verify it — which is the setup `index-freshness` exists for: two
  checkouts of the same commit then produce different artifacts, the gate reports staleness that
  nothing caused, and regenerating cannot fix it because the next machine disagrees in the other
  direction.
  
  Dogfooding found this the expensive way. On a 25-package monorepo the freshness gate passed locally
  and failed in CI, twice, because `pnpm lint` had generated one `.ts` file into the corpus before the
  index was written; CI lints a narrower scope and never had the file. Diagnosing it took reading two
  CI logs and diffing file inventories. Git already knew the answer.
  
  `ak-docs index` now names those paths as it writes, and `ak-docs doctor` raises an
  `index-not-reproducible` warning, each with the ignore rule that matched — for example
  `apps/docs-next/lib/ask-context.ts (apps/docs-next/.gitignore:13:lib/ask-context.ts)` — so the fix
  is one lookup away: add the path to `safety.exclude`.
  
  Both are unconditional and neither changes an exit code or the doctor's score. Enforcement is the
  new `index-reproducible` gate, which is in no preset and has to be requested with
  `gates.include: ['index-reproducible']`, because turning it on for every consumer would fail gates
  that pass for good reasons.
  
  The check reports success rather than failure when the index is not committed or the project is not
  a Git checkout, since there is nothing to reproduce in either case, and it does not flag a file that
  is both tracked and matched by an ignore rule — being committed is the point.

## 1.10.1

### Patch Changes

- 0926c57: Keep a committed index fresh across commits.
  
  The retrieval projection sealed its content hash over the discovery snapshot's hash, and a
  snapshot's hash covers its `sourceRevision` — the commit SHA when the working tree is clean, a
  digest of the scanned files when it is not. That is right for an artifact whose job is to say what
  one revision looked like, and wrong as a projection input: the projection is a function of what the
  snapshot observed, not of where it observed it.
  
  The consequence only appears in a repository that commits `.doc-bridge/index.json`, which is the
  recommended setup: committing the index changes the revision that the next run hashes, so the
  artifact was stale the moment it landed — landing it is a commit. `ak-docs gate run` reported
  `index-freshness` failing on an index that nothing had invalidated, and no regenerate could fix it,
  because the fix was itself a commit. Dogfooding on a 25-package monorepo, the gate could not be
  made to pass twice in a row.
  
  The seal is now over what the snapshot observed: the entities, the relations and the analyzer
  identity that produced them, alongside the overlay and configuration hashes it already covered. The
  artifact still carries `snapshotHash`, now documented as provenance rather than a seal input, so a
  reader can still say which snapshot a projection came from. `RETRIEVAL_PROJECTION_VERSION` goes to
  2, so no reader compares a hash across the change, and every index's content hash changes once on
  the next `ak-docs index`.

## 1.10.0

### Minor Changes

- 97851d0: Let a repository say which directories are not areas.
  
  An area is the unit of architecture between a package and a file, derived as the first directory
  level under a package's source roots. In a monorepo where every package keeps `tests/` and
  `fixtures/` beside `src/`, that derives one area per directory — and the doctor's connectivity
  dimension then asks for a document about a folder of test data. Dogfooding on a 26-package
  monorepo, 43 of its 81 undocumented areas were `tests/` or `fixtures/`: the metric was mostly
  measuring directories no documentation should describe.
  
  `analysis.areas.exclude` takes glob patterns for directories that hold code without being a unit
  of architecture. A matching candidate is not derived, and its modules fall to the most specific
  area that still encloses them — or to none, which is the honest answer for a folder of fixtures.
  An ownership record naming an excluded path still makes it an area: a person saying a directory is
  a unit outranks a pattern saying it is not.
  
  On that monorepo, excluding `**/tests`, `**/fixtures`, `**/__tests__` and `**/__fixtures__` took
  areas from 103 to 53 and the documented share from 21% to 34%, before a single document was
  written.

## 1.9.0

### Minor Changes

- 9a775a5: Add code areas — the unit of architecture between a package and a file — so reconciliation says
  something useful about a single-package repository.
  
  With `reconciliation.scope: "package"` and one package, every internal relation aggregated into a
  self-loop the comparison skips: a thousand observed relations, zero diagnostics, and a health
  score of 100 out of 100 that meant nothing. Most repositories are a single package. The ownership
  configuration already named the missing unit (`path: "src/mcp"`); the graph had no entity for it.
  
  `area:<dir>` entities are now derived from the first directory level under each package's source
  roots, plus any path an ownership record names, with `contains` relations from the package, to
  nested areas, and to each module. Each module belongs to exactly one area — the most specific —
  so containment stays a tree and an aggregation has one answer per module. `analysis.areas.depth`
  and `analysis.areas.roots` change what is derived without a code change.
  
  `reconciliation.scope: "area"` compares at that level. On this repository it turns 0 diagnostics
  into 177 `RELATION_UNDOCUMENTED` findings, each with file and line evidence.
  
  An area that an ownership record names carries `metadata.ownershipId`, which makes two things
  work that could not before. An ownership path no observed module or document lives under is now
  reported as `OWNERSHIP_PATH_UNOBSERVED` with status `stale-or-unverified` — a renamed directory
  was previously invisible, because the handoff still resolved. And an agent document declaring
  `id` plus `editRoot` now resolves to the area it owns: that pair has always filled the ownership
  map, but discovery never read it, so every such declaration became an unresolved reference.
  
  The documentation audit measures coverage against areas when a repository has exactly one package.
  It reported `Packages covered: 0/0` on this repository; it now reports `Areas covered: 9/36`, with
  `metrics.coverageUnit` naming the unit and `AREA_DOCUMENTATION_MISSING` for an uncovered area.
  
  A document naming a directory in inline code now produces a `mentions` relation to that area,
  completing the part of the Markdown analyzer that was waiting for areas to exist.
  
  `pipelineVersion` becomes `1.3.0` and the `repository` analyzer `1.2.0`. `DiscoverySnapshotV1`'s
  schema version is unchanged: the new kind travels through the existing generic envelope.
- 9a775a5: Let a Registry agent enrich the knowledge graph without ever becoming an authority over it.
  
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
- 9a775a5: Compute graph signals with a graph library instead of ad-hoc counting, and expose the repository
  graph through the ecosystem memory contract.
  
  `centrality-risk` in the rules engine derived from the number of undocumented-relation findings
  attached to an entity — documentation debt wearing the name of an architectural signal. A module
  every import path runs through scored zero if it happened to be documented. It is now betweenness
  over the import graph, and without a graph the rule reports nothing rather than reporting the wrong
  thing under a name people act on. On this repository it flags `src/cli/program.ts` first, which is
  the correct answer and one the old heuristic never gave.
  
  `src/graph/build.ts` adds, on graphology:
  
  - **canonicality** from PageRank over `links-to` and `covers`, so a documentation entry point
    outranks a leaf page;
  - **centrality** from normalized betweenness over `imports` and `re-exports`;
  - **proximity** from bounded shortest paths, excluding `contains`, which is hierarchy and would put
    every module in an area two hops from every other one;
  - **import cycles** with every edge that forms them as evidence, reported as a new `IMPORT_CYCLE`
    diagnostic — this repository has exactly one, between two `src/doctor` modules;
  - **area suggestions** from seeded Louvain communities, emitted only as `coverage` with
    `analyzer: graph` and `scope: area-suggestion:<path>`, status `not-analyzed`. A clustering
    algorithm does not get to name the architecture.
  
  `createDocBridgeGraphMemory(snapshot, overlay)` in `src/graph/memory.ts` projects the graph behind
  `GraphMemory` from `@agentskit/memory`, so an agent built on AgentsKit walks repository structure
  with the same `getNode`, `findEdges` and `neighbors` calls it uses for its own memory. Writes land
  in a working layer above the projection and deletes mask rather than erase: the snapshot is an
  observation, and nothing a caller writes should be mistaken for something the repository said.
  
  The graph is never serialised and `DiscoverySnapshotV1` is unchanged. Insertion is sorted and every
  score rounded, so metrics are identical across runs and after the input order is shuffled.
  `pipelineVersion` becomes `1.4.0` with a `graph` analyzer version.
- 9a775a5: Give every file-backed entity its own content hash, and reuse unchanged entities between scans.
  
  `EvidenceSchema.contentHash` had existed since the first schema and `discoverRepository` never
  filled it: on this repository 0 of 369 entities carried one. Every cache and every overlay could
  therefore be keyed only on "the whole repository changed", which is true between any two commits.
  Now every `module`, `document` and `package` entity carries the hash of its file in its first
  evidence item, and `external` entities carry none — a name in a manifest is not a file.
  
  `discoverRepository({ previous })` accepts a snapshot from a previous scan and skips the TypeScript
  and Markdown parses for files whose hash is unchanged. Reuse is only taken where it cannot change
  the answer:
  
  - an entity's own fields depend on its own bytes, so a hash match is enough for the entity;
  - a relation depends on what else exists, so relation reuse also requires that the universe the
    references resolve against is identical — module paths, packages and compiler options for a
    module, and additionally document paths, area paths and which module declares each exported
    symbol for a document. Both fingerprints are derived from the previous snapshot rather than
    stored in it;
  - the whole snapshot is refused unless it declares, and matches, this `pipelineVersion`, these
    `analyzerVersions` and this `configurationHash`. An analyzer that learns to read more produces
    different entities from identical bytes.
  
  A replayed edge whose internal target is gone is dropped rather than carried — a renamed file must
  not leave a graph asserting something the repository no longer contains — while an external or
  unresolved endpoint is re-added, because it is in the snapshot only because the reused entity
  referenced it.
  
  Two `js-ts` facts only ever lived in a local variable, which made the aggregate `dynamic-imports`
  and `runtime-wiring` entries unreproducible from the per-file ones — and a reused scan replays the
  per-file ones. A literal `require` now sets the resolved-dynamic-import flag it always recorded
  evidence for, and every observed runtime-wiring call leaves a per-file entry: `complete` when its
  target is statically known, `not-analyzed` when it is not, where before a resolved call left no
  record at all. Both make the aggregate derivable from what the snapshot actually carries.
  
  One `coverage` entry with `scope: reused-entities` reports what a run reused and what it re-parsed,
  so a fast run is explainable rather than suspicious. It is the only part of a snapshot that
  describes the run rather than the repository: the entities, the relations and every other coverage
  entry are byte-identical to a cold scan's. The CLI still scans cold, so its artifacts are unchanged
  apart from the new entry. `pipelineVersion` becomes `1.5.0`, the `repository` analyzer `1.3.0` and `js-ts` `1.3.5`.
- 9a775a5: Read documentation with a real Markdown parser, and turn its prose into evidence-backed graph
  edges.
  
  Documentation used to be read with regular expressions: frontmatter by one, the `docbridge` block
  by a hand-written YAML subset, and the prose not at all. Headings, links and inline code were
  discarded — so on this repository, where 23 documents link to other documents and 14 cite source
  paths, none of it produced a single edge.
  
  A new `markdown` analyzer parses documents with remark (CommonMark plus GFM) and emits `observed`
  relations with the file and line each claim was made on: `links-to` between documents,
  `mentions` from a document to a module or package, and `mentions-symbol` from an inline code token
  to the module that exports it. On this repository that is 154 `links-to`, 93 `mentions` and 50
  `mentions-symbol` where there were none, and 55 of 104 documents now have an outgoing edge.
  
  A symbol resolves to the module that declares it rather than a barrel that re-exports it, and a
  name declared by two modules resolves to neither — the reference and its lines are reported as a
  coverage note, because sending an agent to one of two possible definitions is worse than sending
  it nowhere. Unresolved path-shaped references are matched with Jaro-Winkler and accepted only at
  0.92 or above with a single candidate, recorded as `confidence: 'fuzzy'`. Mentions inside a
  `<!-- doc-bridge:generated -->` region are ignored, so Doc Bridge never reads its own output back
  in as evidence. A document referencing more than 64 entities records `evidenceTruncated`.
  
  Document entities now carry `title`, headings to depth three with their lines, a bounded
  `summary`, `wordCount`, the frontmatter subset (`type`, `audience`, `owner`, `lifecycle`, `tier`),
  any generated regions, and the file's content hash on its evidence. A document declaring
  `audience` overrides the path heuristic that classifies it.
  
  The `docbridge` block is now real YAML validated by a schema, so quoted lists, flow mappings,
  anchors and multi-line strings work as they do everywhere else, and a schema violation names the
  field. Every `DOCBRIDGE_*` diagnostic code is preserved, and a block YAML cannot read at all falls
  back to the previous line-oriented scanner, which reports per line.
  
  `pipelineVersion` becomes `1.2.0` and `analyzerVersions` gains `markdown`. The
  `DiscoverySnapshotV1` envelope is unchanged.
  
  Entity identity is consolidated into one module: `entityId` and `relationId` in
  `src/discovery/identity.ts`, shared by the discovery analyzers and the retrieval projection, which
  had grown a second copy. `projectedEntityId` (added in the unreleased corpus projection and never
  published) is gone in favour of `entityId`.
- 9a775a5: Render the canonical artifacts as Markdown people can read, from templates rather than string
  concatenation, and close the loop between what Doc Bridge writes and what it reads.
  
  `ak-docs render <template> [--data <artifact>] [--output <path>]` ships five templates: `llms.txt`,
  replacing the concatenation in the index builder byte for byte; `area`, one page per code area
  with its purpose, modules, documents, related areas, checks and open findings; `ownership`, one
  sidecar per ownership record; `change-digest`, the entities and documents whose content hash
  moved since the last scan and the documents that should have moved with them; and
  `overlay-review`, the pending agent proposals with their evidence links, with an explicit empty
  state when no overlay exists. A project replaces any of them under `render.templates` without a
  code change; `--print-template` prints the bundled source to start from.
  
  Templates are `knap` 0.5 templates: parsed to an AST, interpreted without `eval`, and fed only
  the variables Doc Bridge computes. The index pipeline is synchronous and knap's renderer is not,
  so the AST is walked by a synchronous evaluator of Doc Bridge's own; a test renders every bundled
  template through knap's engine as well and holds the two to identical bytes. Every bundled
  template has a golden file, and rendering never calls an agent or reads the Registry.
  
  Every generated Markdown region carries `<!-- doc-bridge:generated hash=… -->`. The Markdown
  analyzer already skips mentions inside one; the documentation audit now recomputes the hash and
  reports a region a person edited by hand as `GENERATED_REGION_EDITED` under
  `generated-freshness`, so a regeneration never silently discards the edit. `llms.txt` carries no
  marker and its bytes are unchanged for its existing consumers.
- 9a775a5: Answer an agent's question in one bounded MCP call, report findings in the shape the ecosystem
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
- 9a775a5: Measure enrichment: what a run cost, what it invented, whether it improved retrieval at all — and
  give the controlled study mechanical expectations, a third arm that reports its own readiness, and
  tokens to first evidence.
  
  The overlay reported what it accepted, which is the one number an agent cannot fail: a curator that
  proposes a hundred things and has ninety rejected looked exactly like one that proposes ten good
  ones. Nothing said whether any of it helped retrieval. And the study could not answer the question
  either — its last round recorded zero semantic successes in both arms, because a task whose only
  success criterion is a model's opinion produces no signal, and `registry-assisted` had been reserved
  since the first suite without ever running.
  
  `EnrichmentStats` now carries the whole shape of a run: counts per kind, a rejection histogram over
  the closed reason list, cost as agent runs, input and output bytes, cache hit rate and measured wall
  time, and `inventedReferences` — rejections that named something the repository does not contain,
  counted apart from the rejection total because a curator wrong about a judgement and one making
  things up are different problems. `enrichmentStability` compares a run with the previous one:
  identical overlay hashes for a deterministic agent, and for a live model the share of proposal
  identifiers present in both runs, over the union, so proposing fewer things does not read as more
  stable. `stats` stays outside the overlay's content hash.
  
  `ak-docs bench retrieval <suite> --overlay` and `ak-docs enrich --retrieval-delta` run the golden
  suite twice over one snapshot — once with the accepted overlay projected, once without — and report
  the delta in both text and JSON, with the case ids gained and lost at hit@3. Both project their own
  indexes, so neither needs an index on disk. An overlay may leave retrieval unchanged and it may
  improve it; if it lowers hit@3 the run exits 1 and says so, as a finding about the agent rather than
  a new baseline.
  
  A study task may declare `expectedEntities`, `expectedDocuments` and `retrievalQueries` as opaque
  references, resolved to concrete entities and documents by a local `StudyExpectationsV1` file that
  declares `scope: 'local'`, binds to the suite hash and is never published. `ak-docs study
  expectations` turns the pair into an Open Eval Format suite and checks it with the same benchmark
  that gates this repository's retrieval: an unresolved reference fails, and a task with no
  expectations is reported unchecked rather than counted as a pass. A rubric item may now name the
  mechanical check that decides it, and the model adjudicator receives only the items no checker can
  settle — the settled ones travel beside them as context, not for review.
  
  The assisted arm reports its own readiness. Missing provider, missing scenario or missing agent
  identity make it unavailable, and its executions are then recorded as unavailable observations with
  `errorCode: 'registry-unavailable'` rather than skipped or failed: a scenario absent from a ledger
  is indistinguishable from one that was never planned. A missing `promptVersion` or `agentBudget` does
  not cost the arm its run; it is reported as undeclared. `tokensToFirstEvidence` is a primary metric
  per scenario, and the enrichment agent's own tokens, runs and cost are recorded apart from the
  model's while still landing in the total.
  
  The committed 24-task suite, run plan and ledgers are deliberately unchanged: the suite's hash is
  bound to published artifacts, and the targets an expectations file would resolve belong to study
  repositories that are not in this one.
- 6409c68: Add `ak-docs parity`: a registry of the claims this repository makes in public, the repository facts
  they stand for, and a gate that fails when a public surface states something the repository has
  moved past.
  
  Four figures from the published A/B round appear in `README.md` and again in `docs/study/README.md`.
  They agree today, and nothing made them agree: an edit to one, or a new round replacing the artifact
  both quote, would leave two public surfaces stating a number the repository no longer measures, with
  no mechanism for noticing but a person reading both pages on the same day.
  
  `docs/parity/public-claims-v1.json` is a sealed registry. A claim names what it asserts, who owns
  it, how it appears in prose (`{value}` inside a template, optionally worded differently per
  surface), which surfaces must carry it, and where the canonical value comes from: a field in
  `package.json`, a dotted path into a committed artifact, a sum across an array in one, a count over
  the snapshot, a figure the doctor measured, or the presence of a CLI command. Numbers render the way
  prose states them, and two transforms are signed on purpose — "18.46% fewer" and "39.75 seconds
  lower" carry their direction in a word the checker cannot read, so a measurement that turns positive
  stops resolving instead of matching the same digits for the opposite result.
  
  The four outcomes stay apart because they need different actions: `PARITY_STALE` (a surface states a
  value the repository moved past), `PARITY_MISSING` (a required surface omits the claim),
  `PARITY_CONTRADICTION` (two public surfaces disagree — always blocking, and the one an agent cannot
  resolve for itself) and `PARITY_NOT_ANALYZED` (the value could not be resolved: reported, never
  counted as a pass). Every finding carries the claim's owner, the exact surface and line, both
  values, a bounded redacted excerpt and a remediation. An exception accepts one finding on one
  surface and requires a reason and an approver; it stays visible in the report rather than silencing
  the claim.
  
  `ak-docs parity [--claims <file>] [--json|--text]` exits 1 on a blocking finding, and CI runs it in
  the dogfood step next to the index, the gate, the doctor and the retrieval benchmark. On this
  repository the registry starts with seven claims over three surfaces, and the run that introduced it
  found two real problems: a claim of mine pointed at the wrong field, and the command was not yet in
  the CLI reference.
  
  The report is publication-safe by construction — repository-relative paths, bounded excerpts,
  secrets redacted, no document contents — and a test asserts that against a fixture containing a
  secret-shaped string.
- 9a775a5: Project the repository's documents and modules into the index retrieval reads, and rank them with
  field-weighted BM25.
  
  `index.knowledge` previously held only the curated agent sidecars, while the discovery snapshot
  held hundreds of documents and modules, so a query for an exported symbol or a file path had
  nothing to resolve against — on the retrieval benchmark, none of the twenty exported-symbol
  queries found its module and 47% of all queries returned nothing at all.
  
  Every documentation file and source module is now an entry carrying its own content hash, its
  tags, and (for a module) its exported symbols, projected from the same repository walk as the
  discovery snapshot so the two cannot disagree about what exists. Ranking is field-weighted BM25
  plus boosts for exact identity and multiplicative priors for query shape, over one tokenizer
  shared by indexing and querying: English and Portuguese stopwords, accent folding, plural
  collapsing, identifier and path expansion, and CJK bigrams. Weights and BM25 parameters are
  configurable under `retrieval` and recorded in `index.retrieval`, so a retuned ranking is a
  visibly different artifact.
  
  Measured against the committed benchmark: hit@1 21.7% → 76.7%, hit@3 23.3% → 83.3%, mean
  reciprocal rank 0.228 → 0.812, zero-result rate 46.7% → 5.0%, exported-symbol queries 0% → 100%.
  
  Queries also stop rebuilding the index to check freshness. The index records an `inputs`
  fingerprint of the files and configuration it was built from, so a query re-hashes the inputs
  instead — `loadFreshDocBridgeIndex` on this repository went from over a second to about 170 ms. An
  index written before `inputs` existed is still validated by the previous rebuild-and-compare.
- 9a775a5: Make the retrieval index a projection of the snapshot, explain every ranking, and derive handoffs
  for any entity from the graph.
  
  `buildDocBridgeIndex` used to run a scanner of its own: it walked the repository a second time,
  parsed every module and document again, and produced records that shared nothing with the
  snapshot but a file path — two views of one repository, built by two pipelines, free to disagree.
  The index now carries `projection`, a `RetrievalIndexV1` built by `projectRetrievalIndex` as a pure
  function of the snapshot, the accepted overlay and the configuration. Every entry is a snapshot
  entity (or a route the configuration declares) with the entity's own content hash, provenance and
  confidence, its graph position (PageRank, covered-by, mentioned-by, area, package, edges) and the
  text the lexical ranker indexes. The projection's content hash is over its three input hashes, so
  `IndexStaleError` keeps working; `knowledge[]` is still written and stays in step, without body
  text, which now lives once. The index has no scanner of its own; `projectRepositoryCorpus` is gone
  and `repositoryInputs` remains as the freshness fingerprint.
  
  `searchIndex` keeps its signature and gains `{ explain, agent }`. Ranking (`src/retrieval/rank.ts`)
  is BM25 over `title`, `headings`, `symbols`, `path`, `aliases`, `summary` and `body`, times the
  query-shape prior, plus exact-identity boosts, graph proximity (scaled by the anchor's strength),
  log-scaled canonicality, the `--agent` audience prior, and a zero-weighted hook for accepted agent
  signals. `ak-docs search <term> --explain` names every component's contribution and the matched
  terms per field; explaining never changes the ranking. Every result carries evidence, provenance
  and confidence, where confidence is the entry's own for a direct match and the weaker of the entry
  and the surfacing relation when a relation alone surfaced it. Per-token identity boosts apply only
  to queries of at most two tokens: a sentence does not name a thing by containing one of its tokens.
  On this repository's golden suite hit@3 rises from 83.3% to 88.3%, hit@1 from 76.7% to 78.3% and
  MRR from 0.812 to 0.829.
  
  `handoffForEntity(index, id, config, { root })` replaces `handoffForPackage` and answers for a
  package, an area, a module or a document, by entity id, ownership id, alias or path. `editRoots` is
  the unit itself or a module's area; `startHere` is the ownership agent document, then a document
  that covers the target, then one that mentions it, then one links-to hop away, most canonical
  first; `readBeforeEditing` adds the next two and `AGENTS.md`; `checks` report their origin in
  `metadata.checksSource`, which the index builder now records where the decision is made;
  `related` lists the strongest importing and imported areas with the import that proves each;
  `explain` names the relation behind every field. `AgentHandoffV1` stays byte-compatible:
  `related`, `explain`, `evidence` and `metadata` are optional additions and `target.type` gains
  `area` and `document`. A `covers` declaration now also resolves by an area, module or document
  path.
  
  `createDocBridgeRetriever` returns `RetrievedDocument[]` from `@agentskit/core` with
  `metadata: { kind, path, evidence, explain, confidence }`, so `createHybridRetriever` and
  `formatRetrievedDocuments` consume Doc Bridge with no adapter — exercised against the real
  packages. The original `retrieve('query', { limit })` still works.
  
  The default field weights change with the field set (`id`, `tags` and `description` no longer
  exist as fields; `headings`, `aliases` and `summary` do), `CORPUS_PROJECTION_VERSION` becomes 2 so
  an index built by older code is stale by version, and a projected index is about three times the
  size of the old one on this repository, because it now carries every entry's graph edges.

### Patch Changes

- 93bc2ad: Stop writing an index that Doc Bridge's own reader refuses.
  
  `knowledge[]` and `projection.entries` in `doc-bridge-index-v1` describe the same entries, and
  their bounds disagreed: 10 000 against 50 000. A monorepo that projects 10 909 entries therefore
  got an index `ak-docs index` reported building successfully and every reader rejected — `doctor`,
  `search` and the MCP server all failed with a schema dump naming an array, on a repository whose
  index was sitting on disk.
  
  Both bounds are now one exported constant, `RETRIEVAL_MAX_ENTRIES`, shared by the Zod schema, the
  published JSON Schema and the builder, and a test asserts the two agree rather than asserting the
  number. The builder checks the bound before it writes, so a corpus that genuinely exceeds it is
  reported where the count and the remedy are both known — narrow `corpus.*.include`, or split the
  repository across more than one index — instead of becoming an unreadable file.
- 93bc2ad: Make Markdown reference resolution scale, so a large repository can be indexed at all.
  
  Dogfooding Doc Bridge on a monorepo of 4 100 documents, 9 240 TypeScript files and 102 packages
  found that `ak-docs scan` and `ak-docs index` did not complete — not slowly, but not at all within
  fifteen minutes. The cost was superlinear in corpus size and concentrated in one place: a CPU
  profile of a 401-document corpus put 56.5% of samples in `fuzzyMatchList`, the near-miss resolver
  for path-shaped references.
  
  Two things were wrong. The analyzer rebuilt the candidate universe — every document, module and
  area path — once per document, which on that monorepo is tens of millions of string copies before
  any analysis happens; the universe is now built once per run and passed in as
  `MarkdownResolution.pathIndex`. And every unresolved reference ran a full Jaro-Winkler scan over
  that universe, where almost every candidate cannot reach the 0.92 threshold for reasons that cost
  far less to check than a similarity computation.
  
  `createFuzzyCandidateIndex` precomputes, per candidate, its length and its character counts over a
  fixed alphabet. A query then visits only the lengths that can pass, and within those skips any
  candidate whose shared-character count is too low. Both tests are upper bounds on Jaro's match
  count — `m` cannot exceed the shorter string, and cannot exceed the multiset intersection — so a
  candidate they drop provably could not have matched. The filter is behaviour-preserving including
  the order of tied scores, and a test asserts that a list universe and an index universe return
  identical results over 646 candidates at four thresholds.
  
  Measured on the same corpora: 908 documents went from 151 to 25 seconds, and the monorepo that
  did not finish in fifteen minutes now scans in 100 seconds. `fuzzyMatchList` and
  `resolveFuzzyReference` still accept a plain array, so the public contract and the mirror of
  `@agentskit/core/fuzzy-match` are unchanged.

## 1.8.0

### Minor Changes

- 4ed42e3: Add configurable documentation tiers, criticality metadata checks, and independent quality-dimension assessments to the documentation audit.
- ee756a1: Add a bounded, shell-free generic CLI adapter for AgentsKit Registry proposals.
- ee756a1: Add a configurable documentation audit command with measurable quality, coverage, structure-gap, stale, contradiction, redundancy, and generated-document freshness-boundary findings.
- 4ed42e3: Add deterministic longitudinal study metrics with subgroup comparisons, uncertainty, missing-data handling, quality guardrails, and anonymization-safe cost measurements.
- 4ed42e3: Add versioned, anonymization-safe study protocol and historical evidence registry contracts with CLI validation and summaries.
- 4ed42e3: Add bounded controlled-study run plans, isolated command execution, provenance-safe observations, and idempotent observation ledgers.
- 4ed42e3: Add a versioned controlled-study task suite with deterministic variant assignment and outcome adjudication contracts.
- 4ed42e3: Add content-addressed controlled-study verification bindings for provenance, privacy, budget, recovery, and publication-safe evidence.

### Patch Changes

- 5656632: Adopt the provider-neutral `@agentskit/harness@0.9.0` for fail-closed verification, YOLO intermediate execution, immutable evidence, and explicit UI and tracking gates.
- c1fed28: Refresh supported runtime and documentation dependencies, harden GitHub Actions pins, and keep the README freshness contract synchronized.
- 4ed42e3: Reject Registry-agent proposals that reference unknown diagnostics or evidence outside the supplied artifacts, and document alternate-agent and human-approval boundaries.
- ee756a1: Allow failed or cancelled workflow runs with changed inputs to be invalidated and retried, and bump the discovery pipeline identity when report artifacts change.
- 4ed42e3: Add a generic bounded CLI adapter and resumable `study run` execution for hosted model CLIs and AgentsKit Registry agents without requiring Ollama.

## 1.7.45

### Patch Changes

- 9929eb0: Harden dependency resolution, filesystem and URL handling, reconciliation schema compatibility, generated-code boundaries, CI permissions, and npm publishing without long-lived npm tokens.

## 1.7.44

- Precompute module-to-package ownership during package-scope reconciliation to reduce repeated entity scans on large repositories.

## 1.7.43

- Add deterministic reconciliation rollups by diagnostic code and status for agent and dashboard consumption.

## 1.7.42

- Correct package documentation health classification when aggregated relations are undocumented.
- Add regression coverage so package-level reports cannot mark affected packages as fresh.

## 1.7.41

- Add configurable anonymized HTML report output that preserves topology and metrics without project-specific identity or evidence content.

## 1.7.40

- Clarify that `ak-verify` is portable while verification contracts remain project-local.
- Require a project verification contract before implementation under the global agent policy.

## 1.7.39

- Avoid recompiling the conventional agent-package path matcher for every document during reconciliation.

## 1.7.38

- Count conventional agent documents under `packages/` and `apps/` as package coverage even when they do not declare a `humanDoc` bridge.
- Preserve configurable agent roots and keep human-document linking as a separate concern.

## 1.7.37

- Keep package-frontmatter reconciliation linear in document size and avoid unnecessary package scans for direct entity references.

## 1.7.36

- Link package documentation that follows the existing `apps|packages` path convention when it declares a human documentation route.

## 1.7.35

- Reconcile existing package frontmatter (`type`, `package`, and `humanDoc`) as safe package coverage without requiring duplicate Doc Bridge declarations.

## 1.7.34

- Resolve constant-bound dynamic import and require specifiers while keeping computed and ambiguous bindings explicitly unresolved.

## 1.7.33

- Anchor dense architecture maps to the viewport so wide graph snapshots do not render as an empty centered strip.

## 1.7.32

- Balance dense graph nodes into a readable grid instead of compressing deep hierarchies into a narrow vertical strip.

## 1.7.31

- Preserve readable dense-map sizing across responsive breakpoint overrides.

## 1.7.30

- Keep dense architecture maps readable with prioritized edge rendering, explicit total-versus-visible counts, and horizontal map exploration.

## 1.7.29

- Add enterprise verification profiles with legal state transitions, content-addressed evidence, resumable workflow artifacts, and audited baseline replacement.
- Add explicit JS/TS coverage boundaries, versioned analyzer plugins, benchmark metrics, and bounded AgentsKit Registry proposals.
- Improve documentation/code reconciliation with document classification, package documentation status, and orphan-document findings.

## 1.7.28

- Keep the initial large-report payload limited to package topology while preserving compact evidence indexes for insights and risk lenses.
- Preserve module counts and relation finding health in the overview without loading module/file detail chunks.

## 1.7.27

### Patch Changes

- Exclude test and spec modules from runtime-wiring coverage by default, with an explicit opt-in for test architecture.

## 1.7.26

### Patch Changes

- Report unresolved runtime wiring only when a call contains a potential target, avoiding inline-registration and no-argument false positives.

## 1.7.25

### Patch Changes

- Remove generic `bind` and `listen` calls from default runtime-wiring detection while keeping them configurable.

## 1.7.24

### Patch Changes

- Warm the browser runtime before visual timing so cold Chromium startup does not masquerade as report latency.

## 1.7.23

### Patch Changes

- Clarify runtime-wiring coverage so resolved static targets and unresolved indirect wiring are not conflated.

## 1.7.22

### Patch Changes

- Resolve configurable runtime-wiring calls when their arguments are statically imported, while preserving unresolved calls as explicit coverage gaps.

## 1.7.21

### Patch Changes

- Preserve explicit detection metadata for literal dynamic imports and advance the JS/TS analyzer version.

## 1.7.20

### Patch Changes

- Resolve literal dynamic imports as repository relations and distinguish them from unresolved non-literal loading.

## 1.7.19

### Patch Changes

- Keep the directory report index small by describing only the findings chunk; level and detail chunks remain addressable from the overview metadata.

## 1.7.18

### Patch Changes

- Encode package chunk names as an ordered list to keep the initial report metadata compact.

## 1.7.17

### Patch Changes

- Measure double-click application response from a window-capture listener that cannot be stopped by the report event handler.

## 1.7.16

### Patch Changes

- Derive evidence chunk names from existing package level metadata and compact graph payloads further.

## 1.7.15

### Patch Changes

- Keep module and file navigation within the selected package scope after package-level hydration.

## 1.7.14

### Patch Changes

- Resolve selected package chunks before their parent group chunks during report navigation.

## 1.7.13

### Patch Changes

- Defer report evidence payloads until a graph node is selected, keeping topology navigation compact.

## 1.7.12

### Patch Changes

- Keep application/group report chunks at package level and load module/file data only for the selected package.

## 1.7.11

### Patch Changes

- Split large report level data into on-demand group and package chunks to reduce initial navigation cost.

## 1.7.10

### Patch Changes

- Remove the hidden findings DOM while navigating the architecture lens to avoid unnecessary layout work.

## 1.7.9

### Patch Changes

- Record report render phase timings in visual evidence for actionable performance diagnosis.

## 1.7.8

### Patch Changes

- Cache the graph model for the active report navigation state and invalidate it after lazy data hydration.

## 1.7.7

### Patch Changes

- Avoid recalculating hidden findings and insight dashboards during architecture navigation.

## 1.7.6

### Patch Changes

- Persist browser interaction timing markers in the report DOM so visual evidence is isolated from test-runner state.

## 1.7.5

### Patch Changes

- Distinguish real browser gesture duration from application interaction response in visual evidence.

## 1.7.4

### Patch Changes

- Avoid duplicate architecture drill-down renders when a native double-click is received.

## 1.7.3

### Patch Changes

- Measure report render and interaction latency with a high-resolution clock.

## 1.7.2

### Patch Changes

- Harden verification outcomes and add measurable report interaction timings.

## 1.7.1

### Patch Changes

- Keep verification outcomes consistent when human approval completes a run.

## 1.7.0

### Minor Changes

- Add configurable package/module reconciliation scopes while preserving raw file-level evidence for architecture exploration.
- Require verification contracts to declare intent and map every outcome to executable checks.

## 1.6.4

### Patch Changes

- Make report visual verification work with standalone reports, lazy-loaded findings, and repositories whose architecture starts at a domain or group rather than an app.

## 1.6.3

### Patch Changes

- Add configurable relation-coverage policy, invalidate workflow artifacts when analyzer logic changes, improve offline report readability on small screens, and ship the visual verification script used by the report command.

## 1.6.2

### Patch Changes

- Keep the architecture overview legible by mapping project packages first, using a scrollable deterministic canvas, and revealing external dependencies in package drill-down views.

## 1.6.1

### Patch Changes

- Index report findings by entity and relation before rendering the offline graph, keeping large reports responsive during initial load and level changes.

## 1.6.0

### Minor Changes

- Replace the offline HTML report with a progressive, read-only architecture viewer. The report now includes grouped SVG topology by level, documentation drift, risk/hotspot, and evidence lenses, deterministic heuristic signals, selected-entity evidence details, Jest-like diagnostics, and explicit analyzer coverage boundaries.

## 1.5.2

### Patch Changes

- Exclude Turbo cache files from repository discovery by default.

## 1.5.1

### Patch Changes

- Honor configured repository file limits and ignore non-package workspace directories during discovery.

## 1.5.0

### Minor Changes

- Add the canonical knowledge-engine workflow, architecture map, configurable MCP surfaces, and human-gated Registry agent proposals.

## 1.4.3

### Patch Changes

- Keep the release audit green by pinning the available `nanoid` fix and documenting
  the upstream `extract-zip` advisory exception until its patched npm release exists.

## 1.4.2

### Patch Changes

- df61b17: Accept managed ecosystem products without a public repository by supporting `repo: null` and declaration-backed claims in the canonical ecosystem contract.

## 1.4.1

### Patch Changes

- ef543f6: Publish the portable handoff skill through an Agent Plugins v1 manifest for GitHub Copilot.
- 8b07f46: Package the portable handoff skill and credential-free MCP server as a Claude Code plugin.

## 1.4.0

### Minor Changes

- 14a9075: Add a portable, fail-closed Doc Bridge handoff skill with a zero-credential resolver and synthetic compatibility fixture for Agent Skills runtimes.

### Patch Changes

- 5133bda: Expose the portable Doc Bridge handoff skill as a discoverable Pi package.
- 14a9075: Add a Cursor plugin manifest, pinned MCP configuration, and handoff skill.

## 1.3.0

### Minor Changes

- 319605e: Add read-only Nx project inference for Doc Bridge ownership, handoffs, and available test and lint checks.
- e0db193: Add first-party VitePress and Astro Starlight human-documentation adapters.
- 03c17bc: Add a first-party Nextra human-documentation adapter for deterministic content-directory routes.

## 1.2.6

### Patch Changes

- Restore the stable release security gate with patched Next.js and Sharp versions and pnpm 11-compatible dependency overrides.

## 1.2.5

### Patch Changes

- d2429f4: Add read-only MCP tool annotations, a public privacy policy, and deterministic MCPB packaging for local Claude Desktop installation.

## 1.2.4

### Patch Changes

- 8106e2e: Add the verified MCP Registry namespace to the published package metadata.

## 1.2.3

### Fixed

- Publish path for seven-product `properties[]` contract and `formatEcosystemLlmsBlock` (v1.2.2 GitHub tag/package.json were misaligned; npm still on 1.2.1)
- Marketplace Action dogfoods the local workspace package when run in this repository
- Docs site `llms.txt` renders the shared seven-product mesh with role, maturity, machine index, and **(current)**

### Changed

- Sync `ecosystem.json` upstream snapshot from AgentsKit hub main

## 1.2.1

### Fixes

- Restore the stable release audit with pnpm's bulk advisory client and pin patched transitive versions of PostCSS, tmp, and uuid.

## 1.2.0

### Minor Changes

- d4260b9: Add the production documentation portal, deterministic AgentsKit Chat knowledge surface, generated LLM and raw Markdown artifacts, and README Standard v1 quality gates.

## Unreleased

### Features

- Add read-only MCP tool annotations, a public privacy policy, and validated MCPB packaging for local Claude Desktop installation.
- Migrate the documentation portal dogfood from AgentsKit Chat 0.2 packages (`@agentskit/chat-protocol`, `@agentskit/chat-react`) to the consolidated 0.3.x surface (`@agentskit/chat/protocol`, `@agentskit/chat/react`) while keeping `@agentskit/chat` as the root package.
- Replace the legacy Pages landing with a statically exported Fumadocs portal backed directly by the canonical `docs/**` corpus.
- Generate `llms.txt`, `llms-full.txt`, raw Markdown, and a hash-verified deterministic AgentsKit Chat artifact from the repository's own Doc Bridge index.
- Add dynamic AgentsKit Chat dogfood with local exact answers, ambiguity choices, session-aware backend fallback, and explicit provenance.
- Adopt README Standard v1 for repository, package, and public-app profiles with synchronized executable examples and freshness evidence.

### Quality

- Add `pnpm check:no-legacy-chat-imports` to reject any reintroduction of `@agentskit/chat-protocol` or `@agentskit/chat-react`.
- Add desktop/mobile Playwright coverage for the landing, Fumadocs, local chat, ambiguity, and completed backend stream.
- Expand self-ownership handoffs across CLI, indexing, query, MCP, quality, memory, and intelligence modules.

## 1.1.1

### Fixes

- Publish stable packages only from immutable tags after security, test, coverage, packaged-smoke, dogfood, and Documentation Standard v1 gates pass.
- Sync the canonical ecosystem snapshot before release so conformance and cross-product navigation remain current.

## 1.1.0

### Minor Changes

- Add the stable, HITL-approved Documentation Standard v1 deterministic conformance profile, CLI command, reports, remediation, explicit approved exceptions, generated llms.txt freshness checks, and canonical ecosystem manifest/claims validation.

## 1.0.2

### Fixes

- Sync `ak-docs --version`, MCP `serverInfo.version`, and capabilities version from `package.json` during build/release.
- Allow `ak-docs query <id> --agent` as a shortcut for package/ownership handoff lookup.
- Packaged smoke now verifies installed CLI version.

## 1.0.1

### Fixes

- Hardened release validation with coverage for Layer 1 CLI, RAG/chat wrappers, MCP install, package-manager checks, watcher, markdown/glob helpers, and packaged/docsite smoke paths.
- Fixed provider API-key defaults for optional AgentsKit intelligence adapters.
- Replaced publish-time `pnpm build` hooks with `npm run build` for npm-friendly packing.

## 1.0.0

**Stable** — doctor, CI gate, MCP install, and agent skill are boring-reliable. Tier C polish ships.

### Features

- **Landing** — `docs/landing/index.html` deployed to GitHub Pages (`https://doc-bridge.agentskit.io/`)
- **Playbook pattern** — published `docs/playbook/doc-bridge-pattern.md` + `ak-docs playbook pattern [--text]`
- **Used by** — public AgentsKit surfaces cited on landing (for-agents, Registry, Playbook)

### Stable criteria met

- 60s demo path (`ak-docs demo`)
- Doctor coverage score + badges
- GitHub Action `doc-bridge-gate` + repo dogfood CI
- Cursor skill + `mcp install --cursor`
- Memory promote → draft PR, index `--watch`, Ollama smoke (optional)

### Breaking changes from alpha

- None intended for Layer 0 config/handoff schemas (still `schemaVersion: 1`)
- Pin `@v1.0.0` for GitHub Action instead of alpha tags

## 0.1.0-alpha.5

Tier B — power-user workflows and production pipeline polish.

### Features

- **`ak-docs memory promote --pr`** — draft file + `gh pr create --draft` (with `--dry-run`, `--force`)
- **`ak-docs index --watch`** — debounced rebuild on agent/human doc changes
- **`ak-docs doctor --badge`** / **`--write-badge`** — shields.io markdown + `.doc-bridge/coverage-badge.json`
- **Ollama demo** — `examples/ollama-chat.config.ts`, `docs/ollama-demo.md`, `pnpm smoke:ollama`
- **Index pipeline recipes** — pre-commit, Turborepo, CI (`docs/recipes/index-pipeline.md`)
- **`pnpm coverage:badge`** — CI-friendly badge updater script

## 0.1.0-alpha.4

Activation and agent-adoption polish — from "works" to "wow in 60s".

### Features

- **`ak-docs demo`** — bundled example/monorepo fixtures; before/after handoff, gate red→green, MCP snippet (no local config)
- **`ak-docs doctor`** — coverage score 0–100, missing agentDoc/humanDoc, gate status, next actions
- **`ak-docs mcp install --cursor | --claude`** — writes MCP server config
- **Handoff `bridge`** — `linked` / `missing` / `external` humanDoc status with bootstrap action
- **`ak-docs ask`** — handoff preview (start, edit, checks, bridge) when ownership matches
- **GitHub Action** — `action.yml` (`doc-bridge-gate`) for PR gates + doctor annotation
- **Agent skill** — `docs/skills/doc-bridge.md` for Cursor/Claude one-shot routing rules
- **Demo fixtures** — `examples/demo-example`, `examples/demo-monorepo` (auth + billing)

## 0.1.0-alpha.3

Dogfood round-2 fixes (search ranking, full-text body, peers, federation soft-fail).

### Fixes

- **Search ranking:** exact id / basename boost; ownership preferred for routing questions; path dedupe
- **Full-text search:** knowledge entries store `body` excerpt; descriptions prefer frontmatter `purpose` and complete sentences
- **ask:** next command prefers ownership match over knowledge-only
- **Text UX:** multi-line search/ask matches (`[type] id`, path, summary)
- **Federation:** missing/404 remote `llms.txt` soft-skipped (no hard fail)
- **Peers:** optional peer ranges widened (`@agentskit/core` `>=1.0`, adapters `>=0.12`) so Layer 0 install is not blocked
- **humanDoc:** more aliases (`packages/id`, `reference/packages/id`, path suffixes)

## 0.1.0-alpha.2

Dogfood-driven polish after ecosystem install on agentskit, playbook, registry, and a product monorepo.

### Fixes / features

- **Package-manager-aware checks** — pnpm/yarn/npm/bun; `pnpm --filter <pkg>` in workspaces
- **Corpus ownership inference** — `packages/<id>.md`, pillars patterns, registry READMEs (toggle `routing.options.ownershipFromCorpus`)
- **Richer `guessAgentDocForPackage`** — packages/id, index.md, mdx, for-agents top-level
- **humanDoc aliases** — scoped names, common id variants
- **Fumadocs** excludes nested `for-agents/` from human corpus by default
- **plain-markdown** accepts `contentDir` (alias of `root`)
- **Gates:** preset `playbook`; docs-style profiles `playbook-okf-soft`, `title-only`; strict includes docs-style
- **Git install:** `prepare` via `scripts/prepare.mjs` builds `dist/` when missing; `prepack` builds; source included for rebuilds
- Default agent include `**/*.{md,mdx}`

## 0.1.0-alpha.1

Initial alpha — human↔agent documentation bridge.

### Layer 0 (no API key)

- Versioned Zod schemas for AgentHandoff, AgentSearch, DocBridgeIndex, config, and MemoryCandidate.
- `ak-docs init` (demo ownership by default, `--no-demo` available), `index`, `query`, `search`, `list`, `gate run`, `mcp`, `ask`.
- Ownership handoffs from **config**, **agent-doc frontmatter** (`package` + `editRoot`), or monorepo discovery.
- `--config` resolves project root from the config file directory.
- MCP: `handoff.resolve`, `doc.search`, `doc.get`, `gate.status`, memory + retriever tools.
- Human adapters: plain markdown, Fumadocs, Docusaurus; gates for freshness, human links, OKF style.
- Memory pipeline: ingest → classify → promote drafts (HITL).
- Progressive CLI help (Core / Intelligence / Advanced).

### Layer 1 (optional AgentsKit peers)

- `ak-docs rag ingest|search` via `@agentskit/rag` + `@agentskit/memory`.
- `ak-docs chat` and `ask --chat` via `@agentskit/ink` + adapters (`handoffFirst`).
- Optional peerDependencies — Layer 0 install stays lean.

### Docs / packaging

- Positioning as human↔agent bridge; public consumers: for-agents, Registry, Playbook.
- Getting started, MCP, examples, chat-and-rag guides.
- Fixed package `main`/`types` exports for publish.
