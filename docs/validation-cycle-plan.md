---
title: Doc Bridge validation cycle plan
description: Evidence-driven validation of Doc Bridge against the AgentsKit OS repository.
---

# Doc Bridge validation cycle plan

## Objective

Validate the complete Doc Bridge change against `agentskit-os`, not only the published package or the HTML report. The validation must prove the bridge between repository structure, documentation, agents, and humans:

1. repository architecture is discovered at package, module, and file levels;
2. documentation is classified, indexed, and checked for freshness;
3. documentation claims are reconciled with observed code relationships;
4. disconnected, stale, conflicting, unresolved, and not-analyzed areas are visible;
5. the Registry agent proposes grounded follow-up work without becoming an unverified authority;
6. the report makes those results useful and navigable;
7. runs are reproducible, resumable, versioned, idempotent, and cost-bounded.

This plan is a validation contract. A green result from one cycle never substitutes for a missing cycle.

## Evidence rules

- Every result is tied to the source revision, configuration hash, snapshot hash, report hash, and verification run ID.
- `not-analyzed` is visible and counts against coverage unless an explicit, human-approved exemption exists.
- Unit tests and compilation are supporting evidence. They do not prove repository behavior, documentation agreement, endpoint/database behavior, or UI behavior.
- Deterministic agent runs and assisted agent runs are separate evidence classes. Deterministic output proves replayability; it does not prove semantic quality.
- No agent proposal is applied without human approval and a fresh post-apply verification run.

## Cycle gates and success metrics

### Cycle 0 — Contract and scope gate

**Purpose:** map the human request to verifiable outcomes before changing the product or narrowing the target.

**Required evidence:** task contract, acceptance matrix, repository/surface matrix, explicit exemptions, validation budget, and the decision for architecture declaration granularity.

**Success metrics:**

- 100% of requested outcomes mapped to one or more executable checks;
- 0 unresolved scope, authorization, or behavior ambiguities;
- 0 unapproved surface exclusions;
- 100% of required checks have an evidence location and an expected result;
- the contract names what the report must show for architecture, stale docs, doc/code drift, disconnected areas, Registry proposals, and UI.

**Stop condition:** any unmapped outcome returns the task to `CLARIFYING`.

### Cycle 1 — Real consumer and reproducibility

**Purpose:** prove the published package is the artifact used by `agentskit-os` and that the pipeline is repeatable.

**Checks:** install the declared package version, run discovery, index, reconcile, check, report, and Registry agent using the target repository.

**Success metrics:**

- installed version equals the declared and published version;
- two unchanged runs produce identical snapshot, report, and deterministic proposal hashes;
- every generated artifact is linked from the workflow run;
- resume after an interrupted stage completes without duplicating or corrupting artifacts;
- local execution is used unless a contract explicitly requires network or CI.

### Cycle 2 — Architecture discovery

**Purpose:** validate the project topology rather than merely listing dependencies.

**Checks:** compare discovered packages/apps/modules/files and relations with the monorepo manifests, workspace configuration, representative source imports/exports, and known application boundaries.

**Success metrics:**

- 100% of in-scope workspace packages and apps are classified;
- package, module, and file graph levels are independently navigable;
- relation kinds and direction are preserved;
- disconnected nodes and high-connectivity/SPOF candidates are reported with code evidence;
- dynamic imports, runtime wiring, and generated code are either analyzed or explicitly reported as `not-analyzed`;
- no architecture claim is inferred from `package.json` dependencies alone.

### Cycle 3 — Documentation inventory and freshness

**Purpose:** distinguish document presence from document usefulness and freshness.

**Checks:** inventory agent and human docs, resolve links, compare documentation ownership and referenced paths with the current repository, and run generated-doc freshness checks.

**Success metrics:**

- 100% of in-scope docs have a classification and source evidence;
- 100% of in-scope packages/apps have an explicit documentation status: `fresh`, `stale`, `missing`, or `unverified`;
- every `stale` result has at least one content/path/code evidence item;
- 0 stale decisions based only on filename keywords, dates, or the presence of words such as “old” or “deprecated”;
- generated and internal documentation checks pass, or each failure is surfaced as a finding.

### Cycle 4 — Documentation/code reconciliation

**Purpose:** prove that documented architecture and observed architecture agree at the declared semantic level.

**Checks:** use representative package/module declarations and known-positive, known-negative, stale, conflicting, unresolved, and dynamic relation cases; run the same policy against `agentskit-os`.

**Success metrics:**

- 100% of declared static relations are classified as confirmed, stale, conflicting, unresolved, or not-analyzed;
- undocumented observed relations are grouped at a useful package/module scope instead of producing unbounded raw noise;
- intentional exclusions are explicit and counted, never hidden by an empty required-kind list;
- the known-case fixture matrix has 100% detection of expected findings and 0 unsupported findings;
- the real target report does not show zero findings merely because reconciliation was disabled.

### Phase 3 — Real-artifact documentation inventory

The first AKOS audit exposed that the repository contains multiple documentation
surfaces. A single `documentedDocumentCount / documentCount` ratio mixed the 27
agent-corpus documents with human guides, project files, archives, and
unclassified Markdown. Doc Bridge now reports deterministic document counts by
classification and marks `docs-archive` as `archive`; the report highlights the
agent-corpus ratio separately. This keeps the metric useful without hiding the
full inventory.

The phase gate is satisfied only when the real AKOS artifact reports the
classification totals, the agent-corpus numerator/denominator, and evidence for
the classification rule. A changed source revision or configuration invalidates
the evidence and requires a new workflow and verification run.

### Cycle 5 — Registry agent quality

**Purpose:** validate the configured agent from the AgentsKit Registry as an evidence-grounded assistant to discovery and classification.

**Checks:** run deterministic replay, inspect proposal origin/version/hashes/evidence, and run an assisted mode only when authorized credentials and budget are available.

**Success metrics:**

- proposal origin is the configured Registry agent ID and provider;
- base snapshot/report hashes match the run that produced the proposal;
- every intended change maps to an observed diagnostic or evidence item;
- deterministic replay is hash-stable;
- no proposal invents a path, claim, or remediation unsupported by the snapshot/report;
- human approval is required before any proposal application.

### Cycle 6 — Report and interaction validation

**Purpose:** prove that the evidence can be understood and explored by a human.

**Checks:** real-browser interaction, responsive layouts, keyboard access, contrast, text overflow, loading/latency, console/network errors, level navigation, selection, filters, zoom/pan, and evidence drilldown.

**Success metrics:**

- 0 automated failures across all configured viewport/theme scenarios;
- 0 console errors, failed requests, horizontal page overflow, clipped controls, or contrast violations;
- package → module → file navigation preserves context and breadcrumbs;
- every visible finding has evidence and an actionable explanation;
- human visual approval is recorded for the current report hash.

### Cycle 7 — Enterprise completion gate

**Purpose:** close the loop without overstating readiness.

**Success metrics:**

- all required cycles are `COMPLETE` for the same source revision and contract;
- no required surface remains `not-analyzed` without an approved exemption;
- source, target, config, docs, and generated artifacts have been reconciled;
- issue/PR tracking is updated only after authorization and includes the exact run ID;
- task-owned temporary artifacts are cleaned while user-owned or ambiguous artifacts remain untouched;
- structural decisions are documented in the relevant ADR/RFC;

## Documentation quality audit baseline — 2026-08-29

The first deterministic audit run across the five consumer repositories used the same local Doc Bridge source revision. Repository names are intentionally anonymized in this study artifact; the evidence remains in each repository's local verification state.

| Consumer | Documents | Package coverage | Title rate | Example rate | Exact duplicate groups | Structure gaps | Contradictions | Stale |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| Consumer 01 | 4,098 | 82/83 (98.8%) | 32.4% | 15.0% | 23 | 2,712 | 0 | 0 |
| Consumer 02 | 1,537 | 26/26 (100%) | 71.2% | 42.0% | 2 | 0 | 0 | 0 |
| Consumer 03 | 169 | 20/21 (95.2%) | 96.4% | 59.8% | 0 | 1,083 | 0 | 0 |
| Consumer 04 | 163 | 0/2 (0%) | 98.2% | 58.3% | 0 | 512 | 0 | 0 |
| Consumer 05 | 416 | 0/1 (0%) | 99.8% | 23.6% | 0 | 5,118 | 0 | 0 |

These numbers are a baseline, not a quality score. The audit reports semantic contradiction, unnecessary content, and generated-document freshness as `not-analyzed` until a configured AgentsKit Registry agent or human review supplies evidence. Future rounds must retain the same metrics and compare source revision, configuration hash, audit hash, and verification run ID.
- final report states residual risks and the next human action; enterprise readiness is not claimed while any required gate is pending.

## Initial baseline to collect

The first cycle records counts and timings without treating them as success: entities by kind, relations by kind, declared relations, findings by code/severity/status, coverage states, document classifications, proposal evidence ratio, report load time, interaction latency, generated artifact size, and agent-output token/byte counts. Later cycles ratchet these metrics against the baseline instead of hiding regressions behind aggregate pass/fail status.

The executable benchmark stores an anonymization-safe baseline at `.doc-bridge/benchmarks/baseline.json`. The baseline contains numeric metrics and rule definitions only; it must not contain repository paths, document contents, package names, credentials, or agent prompts. It is created or replaced only by an explicit human-authorized command (`--write-baseline` or `--replace-baseline`).

### Efficiency metric contract

| Metric family | Measurements | Initial gate |
|---|---|---|
| Pipeline | total, discovery, comparison, and proposal milliseconds | no more than 10% regression |
| Artifact | total bytes, initial HTML bytes, overview/levels/findings chunk bytes | initial HTML and total bytes no more than 10% regression |
| Agent context | hit rate, p50/p95 latency, p50/p95 response bytes, estimated p95 tokens, corpus-to-context reduction | 100% fixture hit rate; p95 bytes/tokens no more than 10% regression |
| Report UX | p95 first render, application response after real browser events, gesture duration, render-phase p95, and lazy-chunk bytes | first render ≤ 2s; application response ≤ 200ms; gesture is reported separately; phase/chunk data explains regressions |
| Analysis quality | analyzed ratio, documented/evidence ratios, overview node/edge counts, raw/compared relation ratio, finding density | tracked as evidence; fixture precision/recall gates semantic correctness |
| Reliability | UI failures, console errors, failed requests, incomplete stages | zero |

The report exposes aggregate insights suitable for case studies, but publication requires a separate redaction review. A benchmark passing means the measured contract passed; it does not prove semantic quality without the fixture set or prove enterprise readiness when surfaces are exempted.

## Latest measured cycle

Cycle 2 shipped Doc Bridge `1.7.20` to `agentskit-os` and added deterministic resolution of literal dynamic imports. The official workflow run is `1787934948972-14360`; the verification run is `1787935063723-14641`.

- discovered entities: `12,930 → 12,937`;
- raw relations: `40,921 → 41,300`;
- package-level compared relations: `2,663 → 2,698`;
- findings: `2,580 → 2,615`, all with evidence;
- benchmark: passed against baseline with pipeline `6,052ms`, initial HTML `68,069B`, report artifact `26,338,177B`, first render p95 `113ms`, application response p95 `92ms`, gesture p95 `76ms`, and zero UI failures;
- agent search remained at `100%` hit rate and `1,067` estimated p95 tokens with `99%` context reduction;
- all 10 automated viewport/theme scenarios passed; human approval is still required for the current report hash.

The result is an improvement in semantic discovery, not proof that runtime wiring or non-literal loading is resolved. The next cycle should measure and improve those boundaries or add an explicit configuration/adapter path for projects that can provide runtime architecture evidence.

Cycle 3 shipped Doc Bridge `1.7.21` to `agentskit-os` and added explicit `dynamic-literal` relation metadata plus benchmark counters for unresolved dynamic loading and runtime-wiring candidates. The official workflow run is `1787937333636-16849`; the verification run is `1787937404198-17113`.

- `379` literal dynamic-import relations are now identifiable in the snapshot;
- `56` files contain non-literal loading that remains unresolved;
- `46` files contain runtime-wiring candidates that remain explicitly not analyzed;
- benchmark passed with first render p95 `59ms`, application response p95 `79ms`, gesture p95 `76ms`, and zero UI failures;
- entity/relation/documentation and agent-search metrics remained grounded, with agent search at `100%` hit rate and `1,067` estimated p95 tokens;
- automated UI evidence passed across all 10 viewport/theme scenarios; human approval is required for the current report hash.

Cycle 4 shipped Doc Bridge `1.7.24` to `agentskit-os` and added configurable JS/TS runtime-wiring detection for statically imported targets, explicit unresolved-wiring coverage, a runtime-wiring benchmark counter, and browser-runtime warmup for stable visual timing. The official workflow run is `1787938291045-21432`; the verification run is `1787938325493-21506`.

- the real repository produced `12,937` entities and `41,300` raw relations;
- package-level reconciliation compared `2,774` relations and produced `2,691` findings, all with evidence;
- `379` literal dynamic-import relations were identified and `56` files still contain unresolved non-literal loading;
- `116` files contain unresolved runtime-wiring candidates; no real target wiring was resolved automatically, confirming the conservative boundary rather than overstating coverage;
- the benchmark passed without replacing the anonymization-safe baseline: pipeline `6,094ms`, artifact `26,441,496B`, initial HTML `68,069B`, first render p95 `110ms`, application response p95 `71ms`, gesture p95 `76ms`, and zero UI failures;
- agent search remained at `100%` hit rate and `1,067` estimated p95 tokens with `99%` context reduction;
- all 10 automated viewport/theme scenarios passed with no console errors, failed requests, overflow, clipping, or contrast violations; the screenshots were reviewed locally and the harness is awaiting explicit human approval.

Cycle 5 shipped Doc Bridge `1.7.25` to `agentskit-os` and tightened the default runtime-wiring heuristic by making generic `bind` and `listen` calls opt-in while preserving explicit configuration. The official workflow run is `1787938899030-22694`; the verification run is `1787938967570-22837`.

- the real repository remained stable at `12,937` entities, `41,300` raw relations, `2,774` compared relations, and `2,691` evidence-backed findings;
- unresolved runtime-wiring candidates fell from `116` to `54` (`53.4%` reduction) by removing generic API false positives;
- the benchmark passed against the unchanged baseline: pipeline `6,042ms`, first render p95 `58ms`, application response p95 `71ms`, gesture p95 `75ms`, report artifact `26,422,816B`, and zero UI failures;
- agent search remained at `100%` hit rate and `1,067` estimated p95 tokens with `99%` context reduction;
- the explicit configuration path was covered by a fixture: `listen` is ignored by default and produces a relation when configured;
- all 10 automated viewport/theme scenarios passed; the verification run is awaiting human visual approval.

Cycle 6 shipped Doc Bridge `1.7.26` to `agentskit-os` and tightened unresolved-wiring coverage to require a potential target argument, excluding inline registrations and no-argument calls from architectural gaps while preserving identifiers, property accesses, and factory calls. The official workflow run is `1787939273593-23788`; the verification run is `1787939317943-23884`.

- the real repository remained stable at `12,937` entities, `41,300` raw relations, `2,774` compared relations, and `2,691` evidence-backed findings;
- unresolved runtime-wiring candidates fell from `54` to `22` (`59.3%` reduction; `81.0%` reduction from the `116`-file starting point);
- the benchmark passed against the unchanged baseline: pipeline `5,903ms`, first render p95 `106ms`, application response p95 `71ms`, gesture p95 `77ms`, report artifact `26,412,971B`, and zero UI failures;
- agent search remained at `100%` hit rate and `1,067` estimated p95 tokens with `99%` context reduction;
- the known-case fixture retained both unresolved identifier detection and the explicit custom-method configuration path;
- all 10 automated viewport/theme scenarios passed; the verification run is awaiting human visual approval.

Cycle 7 shipped Doc Bridge `1.7.28` to `agentskit-os` and made the large-report overview payload package-scoped. The first load now carries package topology plus compact diagnostic indexes; module/file detail remains lazy. The official workflow run is `1787940069560-26699`; the verification run is `1787940112369-26783`.

- the real repository remained stable at `12,937` entities, `41,300` raw relations, `2,774` compared relations, and `2,691` evidence-backed findings;
- unresolved runtime-wiring candidates fell from `22` to `9` (`59.1%` additional reduction; `92.2%` reduction from the `116`-file starting point); test/spec runtime wiring is excluded by default and covered by an explicit opt-in fixture;
- the overview payload contains `83` package entities and `627` package relations instead of the full canonical entity/relation set, while retaining `2,691` diagnostic group indexes and `2,691` relation-finding indexes;
- the benchmark passed against the unchanged baseline: pipeline `5,910ms`, first render p95 `113ms`, application response p95 `71ms`, gesture p95 `78ms`, report artifact `26,370,691B`, initial HTML `68,170B`, overview chunk `843,002B`, and zero UI failures;
- agent search remained at `100%` hit rate and `1,067` estimated p95 tokens with `99%` context reduction; reconciliation evidence coverage remained `100%`;
- all 10 automated viewport/theme scenarios passed with no console errors, failed requests, overflow, clipping, or contrast violations; screenshots were reviewed locally and the run is awaiting explicit human visual approval.

## Current known blockers after the measured dogfood cycle

- package `1.7.28` is installed and verified in `agentskit-os`; the workflow run is `1787940069560-26699` and the verification run is `1787940112369-26783`;
- the benchmark passed against the original anonymization-safe baseline; the detailed cycle measurements are recorded above;
- the agent search fixture returned a grounded match for `100%` of queries, with p95 `1,067` estimated tokens and `99%` context reduction; reconciliation evidence coverage was `100%` for the `2,691` findings;
- the visual check passed all automated checks across 10 viewport/theme scenarios, but the current verification run remains `AWAITING_HUMAN_APPROVAL` until a human reviews the screenshots and approves run `1787940112369-26783`;
- only `3%` of reported analyzer scopes are complete in this target, so non-literal dynamic loading, unresolved runtime wiring, and generated code remain explicit coverage limitations;
- the current verification contract covers the package dogfood target, not the complete Doc Bridge enterprise objective.

The current run is `AWAITING_HUMAN_APPROVAL`, not complete. Discovery, package-level reconciliation, Registry-agent proof, documentation cohesion, export accuracy, CLI execution, and measured efficiency passed. The benchmark baseline was not replaced. After human approval, the next cycle should use these numbers as the comparison point and focus on classifying the remaining 9 production runtime-wiring candidates and improving documentation usefulness rather than report transport performance.

### Phase 2 — Semantic classification measurement

The next cycle adds a small, deterministic labeled benchmark around the real reconciliation function. It covers confirmed, undocumented, stale, not-analyzed, conflicting, and unresolved declarations. The acceptance threshold is exact per-case diagnostic classification with non-empty evidence, plus `1.000` finding precision, `1.000` finding recall, and `1.000` evidence ratio. The AKOS verification contract runs this gate directly against the checked-out Doc Bridge source so a later change cannot silently preserve only the aggregate report counts.
