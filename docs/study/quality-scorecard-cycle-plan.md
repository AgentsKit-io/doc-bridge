---
title: Documentation quality scorecard improvement cycles
description: Auditable checklist for improving documentation quality, agent efficiency, and evidence quality without hiding not-analyzed areas.
---

# Documentation quality scorecard improvement cycles

## Operating contract

- **Objective:** turn the five-dimensional documentation-quality matrix into a repeatable scorecard without replacing evidence with a single vanity number.
- **Scope:** Doc Bridge quality analysis, deterministic retrieval evaluation, provider-assisted evaluation, and publication-safe study evidence.
- **Out of scope:** private consumer repository names, semantic claims without evidence, automatic document edits, and external tracking changes.
- **State machine:** `PLANNED` → `RUNNING` → `EVALUATING` → `AWAITING_HUMAN_APPROVAL` → `COMPLETE`.
- **Stop conditions:** missing evidence, changed source/configuration, regression in correctness/evidence/safety, or an unclassified `not-analyzed` result.
- **Evidence rule:** a passing harness gate proves only its mapped criterion. It does not prove that every documentation-quality dimension is semantically validated.

## Scorecard model

The scorecard keeps five independent dimensions:

1. **Correctness** — documented claims agree with observed code, configuration, tests, and applicable runtime evidence.
2. **Completeness** — required knowledge for the declared audience and scope is present.
3. **Clarity** — a human can understand and follow the document without unnecessary interpretation.
4. **Agent efficiency** — an agent can locate and use the knowledge with bounded context and evidence.
5. **Maintainability** — ownership, lifecycle, source of truth, and validation path are explicit and current.

Each dimension uses these evidence states rather than an opaque average:

| State | Meaning | Allowed claim |
|---|---|---|
| `validated` | The declared evidence and acceptance check passed for the current revision. | The dimension is validated for the declared scope. |
| `partial` | Deterministic signals passed, but semantic or runtime evidence is incomplete. | The dimension has bounded partial evidence only. |
| `not-analyzed` | No valid evidence exists for the current scope. | No quality claim may be made. |
| `blocked` | Required evidence could not be collected or was invalidated. | The cycle cannot be completed. |

No aggregate score is published until the dimension values, weights, criticality rules, and missing-data policy are versioned and approved.

## Cycle 1 — Baseline scorecard (10 items)

Run ID: `1789302346313-27248-jkf26r`

Source revision: `b175338a94104f3c2bf198acbaccfda48b334e39`

Verification digest: `aa01dce37623f9c45038f909d9ffc3f3dec49b4300666c3f494106a5c6a9b52d`

Status: `COMPLETE` — all 23 configured verification gates passed, with the limitations below preserved.

- [x] **1. Freeze the five quality dimensions and evidence states.**
  - Evidence: this scorecard model; PRD documentation-quality dimensions.
  - Result: no single score hides missing semantic evidence.
- [x] **2. Freeze document criticality tiers.**
  - Evidence: audit metrics for the current revision.
  - Result: 94 documents classified as tier-0 `18`, tier-1 `25`, tier-2 `51`.
- [x] **3. Establish the document inventory baseline.**
  - Evidence: documentation audit report, content hash `75e1fc17f9704bac41b9616f629d245433782ea53b8cb87eb3a212c3ce3c36db`.
  - Result: `94` documents; `0` generated documents in this scope.
- [x] **4. Measure structural completeness signals.**
  - Evidence: audit metrics.
  - Result: title rate `94/94` (`100%`); required-sections rate `94/94` (`100%`).
- [x] **5. Measure example coverage.**
  - Evidence: audit metrics.
  - Result: examples in `51/94` documents (`54.3%`). This is a baseline, not a universal requirement for every document.
- [x] **6. Measure maintainability metadata coverage.**
  - Evidence: audit findings and critical-document metrics.
  - Result: `18` critical-document findings; owner coverage `1/18`; lifecycle, source-of-truth, and validation-path coverage `0/18`.
- [x] **7. Preserve the semantic-quality boundary.**
  - Evidence: audit dimension status.
  - Result: correctness `0 validated / 94 not-analyzed`; completeness `94 partial`; clarity `94 partial`; agent efficiency `51 partial / 43 not-analyzed`; maintainability `94 partial`.
- [x] **8. Measure deterministic retrieval quality.**
  - Evidence: `agent-task-efficiency-v1` check.
  - Result: `4/4` correct; estimated context `51 → 28` tokens p95 (`45.1%` reduction); compact JSON whitespace reduction `22.0%`.
- [x] **9. Measure provider-assisted task outcomes separately.**
  - Evidence: real provider pilot `phase5-provider-telemetry-pilot-08`, `16/16` completed observations.
  - Result: adjudicated success `3/8 → 6/8` (`37.5% → 75%`); observed context `58,171 → 54,937` bytes p95 aggregate comparison (`5.6%` lower); provider tokens `696,007 → 740,599` (`6.4%` higher). No incorrect or blocked observations.
- [x] **10. Define promotion gates for the next cycle.**
  - Evidence: harness contract and this file.
  - Result: a cycle may advance only when correctness, evidence quality, and safety do not regress; every `not-analyzed` result has a declared next action; source/config/run hashes are recorded; and human approval is captured.

## Cycle 1 decision

**Baseline accepted for comparison.** The evidence supports a deterministic retrieval/context improvement and a promising provider-assisted success signal, but it does **not** support a claim of provider-token reduction or full semantic documentation correctness. The next cycle must target semantic correctness and maintainability evidence rather than optimize the aggregate score.

## Cycle 2 — Structured semantic correctness (10 items)

Run ID: `1789304962652-52511-6h8frs` (verification evidence; human approval pending)

Source revision: `b175338a94104f3c2bf198acbaccfda48b334e39`

Configuration hash: `e213ebc3dbbab1c65044676d5f4747258562482333eb2401a8ca10b792214682`

Verification digest: `28fa6490faae9f27a0ca2efa6c952917ca0908be7a77a64e7a370dd2cc252dd9`

Hypothesis: structured code/document relations can be classified with exact, evidence-backed outcomes, while natural-language correctness must remain explicitly unvalidated until an independent semantic reviewer supplies evidence.

Budget: local deterministic tests and the existing verification harness; no new provider observations.

- [x] **1. Freeze the semantic case taxonomy.**
  - Evidence: `tests/semantic-benchmark.test.ts`.
  - Result: confirmed, undocumented, stale, dynamic/not-analyzed, conflicting, and unresolved-reference cases are explicit.
- [x] **2. Validate confirmed relations.**
  - Evidence: semantic benchmark case `confirmed`.
  - Result: `RELATION_CONFIRMED` classified exactly with source evidence.
- [x] **3. Validate undocumented relations.**
  - Evidence: semantic benchmark case `undocumented`.
  - Result: `RELATION_UNDOCUMENTED` classified exactly with source evidence.
- [x] **4. Validate stale declarations.**
  - Evidence: semantic benchmark case `stale`.
  - Result: `DECLARED_RELATION_STALE` classified exactly with source evidence.
- [x] **5. Preserve dynamic-analysis limits.**
  - Evidence: semantic benchmark case `not-analyzed`.
  - Result: dynamic declarations remain `RELATION_NOT_ANALYZED`; no unsupported correctness claim is emitted.
- [x] **6. Validate conflicting declarations.**
  - Evidence: semantic benchmark case `conflict`.
  - Result: conflict, confirmed, and not-analyzed diagnostics are all retained; no diagnostic is silently discarded.
- [x] **7. Validate unresolved references.**
  - Evidence: semantic benchmark case `unresolved`.
  - Result: `UNRESOLVED_ENTITY_REFERENCE` is classified with evidence.
- [x] **8. Measure semantic classifier quality.**
  - Evidence: `semantic-reconciliation-v1` test output.
  - Result: `6/6` cases, `8/8` expected findings, precision `1.0`, recall `1.0`, evidence ratio `1.0`.
- [x] **9. Reconcile fixture evidence with the real documentation audit boundary.**
  - Evidence: fresh audit output, content hash `27b013189b70fa7e435e1948c5a340c8c01673248922f97be85a77ac1a64cb50`.
  - Result: `95` documents audited; structured contradictions `0`; natural-language correctness remains `95 not-analyzed` and is not promoted by fixture results.
- [x] **10. Decide promotion and next action.**
  - Evidence: this scorecard and the round-2 verification run.
  - Result: structured reconciliation is validated for the declared fixture scope; full-document semantic correctness is not validated. Cycle 3 must target critical-document maintainability metadata.

### Cycle 2 decision

**Bounded improvement.** The semantic reconciliation path has a reproducible fixture-level quality signal (`100%` precision/recall/evidence ratio) across six divergence classes. This does not prove that prose is correct across the repository; the live audit still reports correctness as `not-analyzed` for all `95` documents. No provider-token claim is changed.

## Cycle 3 — Maintainability evidence (10 items)

Run ID: `1789305598380-62229-90sxwf` (verification evidence; human approval pending)

Source revision: `b175338a94104f3c2bf198acbaccfda48b334e39`

Configuration hash: `322dc906d79f6c40325303d1aa99268ed067c4da269275d20bda45739134fa61`

Verification digest: `72dc75d639696eb257647de7f226d49ba62bf230423689deb6e033bb8744fb2e`

Hypothesis: critical-document maintainability can be measured deterministically, but missing ownership and lifecycle metadata must remain visible as gaps until the repository documentation is updated.

Budget: local audit and the existing verification harness; no provider observations and no automatic document edits.

- [x] **1. Freeze the maintainability metadata contract.**
  - Required fields: `owner`, `lifecycle`, `sourceOfTruth`, and `validationPath`.
- [x] **2. Freeze critical-document classification.**
  - Evidence: `18` tier-0 critical documents under the configured classification.
- [x] **3. Measure owner coverage.**
  - Evidence: `1/18` critical documents (`5.6%`) have explicit owner metadata.
- [x] **4. Measure lifecycle coverage.**
  - Evidence: `0/18` critical documents (`0%`) have explicit lifecycle metadata.
- [x] **5. Measure source-of-truth coverage.**
  - Evidence: `0/18` critical documents (`0%`) have explicit source-of-truth metadata.
- [x] **6. Measure validation-path coverage.**
  - Evidence: `0/18` critical documents (`0%`) have explicit validation-path metadata.
- [x] **7. Preserve missing-metadata findings as actionable gaps.**
  - Evidence: `18` critical-document metadata findings with document-level remediation; no silent suppression.
- [x] **8. Check generated-document boundaries.**
  - Evidence: `0` generated documents in the analyzed scope; generated freshness remains a separate boundary.
- [x] **9. Compare maintainability against the prior scorecard.**
  - Evidence: baseline and current counts are recorded; no unsupported improvement claim is made.
- [x] **10. Decide promotion and next action.**
  - Evidence: maintainability remains `partial` for the repository; the next action is to update critical-document metadata before claiming coverage improvement.

### Cycle 3 decision

**Gap measured, not fixed.** The audit now provides a reproducible maintainability baseline: `18` critical documents, `5.6%` owner coverage, and `0%` lifecycle/source-of-truth/validation-path coverage. The cycle validates measurement and preserves the gaps; it does not claim that the documentation is maintainable until those documents are updated.

## Cycle 4 — Agent-efficiency scorecard (10 items)

Run evidence: harness state is recorded under `.codex/verification-0.19-round19/`.

Hypothesis: deterministic retrieval improves grounded context efficiency and speed, while provider-level token savings require separate repeated evidence and must not be inferred from deterministic estimates.

Budget: reuse the existing anonymized observations and deterministic task suite; no new provider observations.

- [x] **1. Freeze the efficiency dimensions.**
  - Dimensions: correctness, context cost, latency, evidence quality, task success, clarification/failure rate, and provider cost.
- [x] **2. Measure deterministic task correctness.**
  - Result: `4/4` task cases returned the expected grounded result.
- [x] **3. Measure deterministic context reduction.**
  - Result: estimated p95 context decreased from `51` to `28` tokens (`45.1%` lower).
- [x] **4. Measure compact serialization overhead.**
  - Result: compact JSON reduced whitespace overhead by `22.0%`.
- [x] **5. Measure provider-assisted task success.**
  - Result: adjudicated success increased from `3/8` (`37.5%`) to `6/8` (`75%`) in the bounded pilot.
- [x] **6. Measure observed context bytes separately.**
  - Result: observed context was `5.6%` lower in the Doc Bridge arm; this is not equivalent to provider-token reduction.
- [x] **7. Measure provider tokens without narrative bias.**
  - Result: provider tokens increased from `696,007` to `740,599` (`6.4%` higher); token savings are not validated at provider level.
- [x] **8. Measure first-tool latency.**
  - Result: p95 first-tool latency decreased from `13,327ms` to `11,390ms` (`14.5%` lower).
- [x] **9. Preserve safety and evidence outcomes.**
  - Result: `16/16` observations completed; no incorrect or blocked observation was recorded, and acceptance checks remained `100%`.
- [x] **10. Decide promotion and next action.**
  - Result: deterministic context/correctness efficiency is validated for the declared suite; provider-token reduction is not validated. A future cycle needs at least three fresh replicates before a provider-cost claim.

### Cycle 4 decision

**Improvement is dimension-specific.** The evidence supports better deterministic retrieval, bounded context, task success, and first-tool latency. It does not support claiming lower provider token usage; the measured provider-token result regressed by `6.4%` in the bounded pilot.

## Cycle 5 — Critical-document metadata remediation (10 items)

Run evidence: harness state is recorded under `.codex/verification-0.21-round21/`.

Hypothesis: adding explicit maintainability metadata to manual critical documents will make ownership and validation discoverable, while generated documents must remain governed by freshness checks rather than manual metadata.

Budget: local documentation edits, one focused regression test, and the existing verification harness; no provider observations.

- [x] **1. Inventory the affected critical documents.**
  - Result: `18` critical documents identified; `apps/docs/AGENTS.md` is generated by Next.js.
- [x] **2. Separate generated and manually maintained documents.**
  - Result: `1` generated path is configured as a freshness boundary; `17` manual documents remain metadata targets.
- [x] **3. Apply owner metadata to manual critical documents.**
  - Result: owner coverage is `17/18` (`94.4%`); the generated document is intentionally excluded.
- [x] **4. Apply lifecycle metadata to manual critical documents.**
  - Result: lifecycle coverage is `17/18` (`94.4%`).
- [x] **5. Apply source-of-truth metadata to manual critical documents.**
  - Result: source-of-truth coverage is `17/18` (`94.4%`).
- [x] **6. Apply validation-path metadata to manual critical documents.**
  - Result: validation-path coverage is `17/18` (`94.4%`).
- [x] **7. Fix generated-document audit semantics.**
  - Result: generated critical documents no longer emit manual metadata findings; freshness remains explicitly `not-analyzed`.
- [x] **8. Add a regression test for the generated boundary.**
  - Evidence: `tests/documentation-audit.test.ts`, 5/5 tests passed.
- [x] **9. Re-run the documentation audit and classify remaining findings.**
  - Result: findings reduced from `3` to `2`; remaining findings are the intentional semantic-review limitation and generated freshness boundary; blocking findings: `0`.
- [x] **10. Decide promotion and next action.**
  - Result: maintainability metadata remediation is validated for manual critical documents. Remaining work is semantic review and a real generator freshness check, not more metadata filling.

### Cycle 5 decision

**Maintainability improved and the audit false-positive was fixed.** Manual critical-document metadata moved from `1/18` owner and `0/18` for the other fields to `17/18` across all four fields. The generated path is correctly governed separately; no unsupported completeness or semantic-correctness claim is made.

## Cycle 6 — Executable generated-document freshness (10 items)

Run evidence: `.codex/verification-0.23-round23/`.

Hypothesis: a real generator check can convert the generated-document freshness boundary from an unverified presence signal into independently executable evidence, without overstating natural-language semantic correctness.

Budget: one local generator check, the existing deterministic audit and benchmark suite, no provider observations, no external tracking mutation, and no automatic documentation edits.

- [x] **1. Freeze the cycle contract and scope.**
- [x] **2. Reconcile the previous cycle as complete before starting.**
- [x] **3. Identify the actual generator used by the generated document.**
- [x] **4. Add a bounded, read-only freshness check using that generator.**
- [x] **5. Emit structured freshness evidence with the generated path and generator path.**
- [x] **6. Add the freshness check to the verification contract.**
- [x] **7. Run the real freshness check against the repository artifact.**
- [x] **8. Re-run the documentation audit and semantic benchmark.**
- [x] **9. Compare findings, coverage, and limitations with Cycle 5.**
- [x] **10. Record the decision, evidence, and next gap without claiming semantic completeness.**

Decision: improved. The generator freshness boundary now has an executable, read-only check: `apps/docs/AGENTS.md` is fresh against `node_modules/next/dist/server/lib/generate-agent-files.js`. The deterministic audit still reports natural-language semantics and generated-document freshness as not analyzed because those are separate semantic boundaries; the harness validates the freshness command independently. The verification contract completed with 25/25 checks and 20/20 outcomes, without exceeding the local budget. Remaining gap: configured Registry-agent or human review for semantic redundancy, unnecessary prose, and contradictions.

## Cycle 7 — Bounded Registry-assisted semantic review (10 items)

Run evidence: `.codex/verification-0.25-round25/`.

Hypothesis: two independent, read-only Registry review contracts can surface semantic documentation candidates with citations while preserving human approval and without conflating suggestions with resolved defects.

Budget: two Codex CLI model runs (`gpt-5.6-sol` and `gpt-5.6-luna`), four bounded documents, deterministic audit summary, no automatic edits, and local evidence only.

- [x] **1. Freeze the semantic review scope and acceptance contract.**
- [x] **2. Install the Registry agent sources used by the review contracts.**
- [x] **3. Resolve the local AgentsKit CLI dependency setup.**
- [x] **4. Provide a strict structured-output schema for semantic candidates.**
- [x] **5. Run the fact-checking contract against bounded documentation and repository facts.**
- [x] **6. Run the style-review contract against the same bounded evidence.**
- [x] **7. Execute both pinned models through the read-only Codex CLI runner.**
- [x] **8. Preserve model outputs as separate, review-required artifacts.**
- [x] **9. Compare candidate findings without merging or treating disagreement as truth.**
- [x] **10. Record the next human-gated action and retain unresolved semantic scope.**

Decision: completed and bounded. The harness reached `COMPLETE` with 24/24 checks and 19/19 outcomes, without exceeding the local budget. The published-version and CI candidates were adjudicated as not contradictory/substantiated. The onboarding overlap remains a low-severity documentation-ownership candidate. The three stale README source hashes were corrected in Cycle 9; no automatic semantic documentation edit was authorized. Model disagreement is preserved as evidence for human review, not treated as a resolution. The remaining semantic gap is coverage beyond the four-document bounded sample.

## Cycle 9 — README Standard source-hash repair (10 items)

Run evidence: `.codex/verification-0.29-round29/`.

Hypothesis: refreshing the three freshness hashes from the current source set will restore the executable README gate without changing documentation meaning or adding generated content.

Budget: one local hash computation, the README Standard check and tests, one cached semantic adjudication, no provider calls, no automatic prose edits, and local evidence only.

- [x] **1. Freeze the repair scope to the three reported source hashes.**
- [x] **2. Recompute hashes from the existing `readme-standard-v1.json` source lists.**
- [x] **3. Update only the stale hash values.**
- [x] **4. Run the real README Standard gate.**
- [x] **5. Run the executable README Standard tests.**
- [x] **6. Require the adjudication script to fail closed if the gate regresses.**
- [x] **7. Add an explicit README freshness outcome to the verification contract.**
- [x] **8. Preserve the repaired adjudication artifact before the harness snapshot.**
- [x] **9. Run the full verification harness with cached semantic evidence.**
- [x] **10. Record the repaired state and keep the onboarding candidate human-gated.**

Decision: ready for final harness verification. The deterministic README gate and its two executable tests pass locally after the three hashes were refreshed. The repair changes freshness metadata only; the version and onboarding adjudications remain unchanged.

## Cycle 10 — Critical documentation coverage and onboarding consolidation (10 items)

Run evidence: `.codex/verification-0.30-round30/`.

Hypothesis: removing duplicated onboarding commands and reviewing a bounded set of eight critical documents will improve human and agent navigation without spending tokens on the entire historical corpus.

Budget: one small documentation edit, two Registry-assisted model reviews over eight bounded documents, cached deterministic checks, no provider pilot, and local evidence only.

- [x] **1. Freeze the eight-document critical review corpus.**
- [x] **2. Remove the duplicated zero-setup demo from the getting-started guide.**
- [x] **3. Keep the README as the canonical short proof.**
- [x] **4. Expand the Registry review input without expanding the output schema.**
- [x] **5. Bound each document input to control model context cost.**
- [x] **6. Run both configured review contracts with Sol and Luna.**
- [x] **7. Preserve each model result and disagreement separately.**
- [x] **8. Re-run deterministic documentation and README freshness checks.**
- [x] **9. Run the complete verification harness.**
- [x] **10. Record remaining semantic candidates without claiming full-corpus correctness.**

Decision: ready for final harness verification. The onboarding duplication was reduced by making the README the canonical proof and linking to it from the getting-started guide. The semantic review is now bounded to eight critical documents; findings remain advisory until human review.

## Cycle 11 — Semantic candidate remediation and study-claim review (10 items)

Run evidence: `.codex/verification-0.31-round31/`.

Hypothesis: previously reported documentation candidates can be resolved when
configured CI behavior, canonical onboarding ownership, and study limitations
are stated directly and reviewed against the ten critical documents.

Budget: bounded two-model Registry-assisted review, deterministic documentation
checks, and the existing local verification harness; no new provider
observations or consumer-repository data.

- [x] **1. Reconcile the documented CLI binary surface.**
- [x] **2. Reconcile configured CI behavior and human-guide-link claims.**
- [x] **3. Remove duplicated onboarding workflows while retaining the short README proof.**
- [x] **4. Add a runnable agent-corpus discovery example.**
- [x] **5. Remove obsolete alpha terminology from the v1 configuration contract.**
- [x] **6. Reconcile the MCP advertised-tool and smoke-test counts.**
- [x] **7. Pin and explain the published Action/package version boundary.**
- [x] **8. State the study's semantic-correctness limitation as an explicit limitation.**
- [x] **9. Review ten critical documents with the configured Sol/Luna semantic contracts.**
- [x] **10. Re-run the full verification harness against the current source revision.**
  - Evidence: harness run `1789321753110-1240-rb90yg`; 26/26 checks and 22/22 outcomes passed; budget not exceeded.

Decision: **resolved for this remediation scope.** The semantic review returned
zero unresolved candidates across ten critical documents for both configured
models, and the complete harness verified the current source revision. The
study narrative remains bounded by its explicit correctness and generalization
limitations.

## Cycle 12 — Quality matrix evals for unresolved claims

Run evidence: current `.codex/verification-0.35-round35/` harness state and
`quality:scorecard` output.

Hypothesis: unresolved claims should be represented as executable scorecard
criteria with explicit thresholds, rather than as prose caveats or a single
aggregate number.

Budget: local scorecard evaluation, the existing semantic fixture test, the
existing documentation audit, and previously recorded study artifacts; no new
provider observations and no currency estimates.

- [x] **1. Version the quality matrix and missing-data policy.**
  - Evidence: `docs/study/quality-scorecard-v1.json`.
  - Result: required criteria must pass for `ready`; `not-analyzed` never passes.
- [x] **2. Add executable semantic-correctness evals.**
  - Evidence: `tests/quality-scorecard.test.ts`, `tests/semantic-benchmark.test.ts`.
  - Result: structured fixture classification passes; provider-task correctness remains an explicit failure at `0%` adjudicated success in both arms.
- [x] **3. Add token-reduction consistency evals.**
  - Evidence: `docs/study/phase4-public-pilot-result-v1.json`.
  - Result: observed pilot reduction is `3.15%`, but consistency fails because only `1` replicate exists and the threshold is `3`.
- [x] **4. Add USD-cost evidence evals.**
  - Evidence: pilot cost fields.
  - Result: `not-analyzed`; no provider USD value exists and no financial claim is emitted.
- [x] **5. Add generalization evals.**
  - Evidence: pilot scope.
  - Result: `2/2` models passes, but `1/3` populations and `1/3` replicates fail the promotion threshold.
- [x] **6. Add deterministic documentation-quality evals.**
  - Evidence: live documentation audit.
  - Result: structural quality passes; contradictions, stale findings, structure gaps, and manual critical metadata gaps are zero.
- [x] **7. Keep semantic documentation coverage separate.**
  - Evidence: bounded two-model review and audit dimension status.
  - Result: the bounded review passes, but the full corpus remains `99` documents not analyzed semantically, so documentation quality is `partial`.
- [x] **8. Add reproducibility and latency criteria.**
  - Evidence: content hashes and pilot p95 latency.
  - Result: evidence hashes pass; pilot p95 latency is `7.53%` lower as a directional, single-pilot signal.
- [x] **9. Add regression tests for ready/not-ready promotion.**
  - Evidence: `tests/quality-scorecard.test.ts`.
- [x] **10. Run the scorecard through the verification harness.**
  - Evidence: `quality-scorecard` harness check; the evaluator reports `decision: not-ready` when required evidence is missing or fails.

### Cycle 12 decision

**The measurement system is implemented and honest; the product evidence is not
ready for an enterprise claim.** Current scorecard result: `6` pass, `1`
partial, `1` not analyzed, and `4` fail. This is the intended result: the
scorecard now identifies exactly what must improve instead of hiding the gaps
behind a green aggregate gate.

## Cycle 13 — Semantic candidate closure and scorecard expansion

Run evidence: `.codex/verification-0.36-round36/`.

Hypothesis: explicit scorecard criteria for semantic candidates, duplicate
documentation, example coverage, and semantic-review coverage will prevent a
green deterministic audit from hiding unresolved prose-quality gaps.

Budget: two bounded Registry review contracts over the ten critical documents,
local scorecard/unit evals, README freshness hashing, and the existing harness;
no new provider observations, USD estimates, or automatic documentation edits.

- [x] **1. Fix the README gate path claim.**
  - `scripts/check-readme-standard.mjs` is now named instead of the library module.
- [x] **2. Clarify the primary config filename and discovery alternatives.**
- [x] **3. Label static README coverage numbers as illustrative output.**
- [x] **4. Pin the published package version in the published Action example.**
- [x] **5. Replace “semantic successes” with the bounded adjudicator's actual outcome name.**
- [x] **6. Add scorecard criteria for examples, duplicates, semantic candidates, and review coverage.**
- [x] **7. Add regression tests for candidate and duplicate failures.**
- [x] **8. Re-run both configured semantic reviewers.**
  - Result: `0` findings from both models across `10` supplied documents.
- [x] **9. Re-run the scorecard with current audit and semantic evidence.**
  - Result: `8` pass, `3` partial, `1` not analyzed, `4` fail; product decision remains `not-ready`.
- [ ] **10. Close provider-study gaps with fresh accepted observations.**
  - Still open: adjudicated correctness, three populations, three replicates, and observed USD pricing.

### Cycle 13 decision

Documentation claims in the bounded critical corpus are cleaner and now have
executable coverage for semantic candidates. Full-corpus semantic coverage and
the provider-study gates remain intentionally unresolved; no market or
enterprise-readiness claim is promoted.

## Cycle 14 — Acceptance execution instrumentation

Run evidence: `.codex/verification-0.37-round37/`.

Hypothesis: requiring observed acceptance-check execution at the shared
adjudication boundary will prevent provider-reported passes from being treated
as verified task success when checks were skipped or their execution telemetry
was absent.

Budget: local unit/eval tests, the existing anonymized pilot ledger, one full
verification harness run, and no new provider calls.

- [x] **1. Make deterministic adjudication fail closed on missing or inconsistent execution telemetry.**
  - `acceptanceChecksExecuted` must be present, equal the declared check count, and be at least the passed count before a success is possible.
- [x] **2. Expose executed-check telemetry to independent adjudicators.**
  - The bounded candidate record now includes `acceptanceExecution.executed` and requires all three counters for `measurementPresent`.
- [x] **3. Add regression coverage for a claimed pass with no observed execution.**
  - `tests/study-provider-cli.test.ts` records that this case is `blocked`.
- [x] **4. Add acceptance instrumentation to the quality matrix.**
  - Matrix `v1.2` reports whether every pilot observation has bounded, internally consistent passed/total/executed counters.
- [x] **5. Validate the existing pilot without rewriting its immutable evidence.**
  - The pilot has `16/16` structurally valid telemetry records; one record executed `0/1` checks and therefore remains incomplete rather than being promoted to success.
- [x] **6. Run the scorecard and harness.**
  - Scorecard result: `9` pass, `3` partial, `1` not analyzed, `4` fail; decision remains `not-ready` because semantic correctness, replicate consistency, population coverage, and observed USD cost remain unresolved.

### Cycle 14 decision

The instrumentation gap is closed without upgrading the product evidence. The
new guard makes incomplete acceptance execution visible and non-successful;
the next improvement must add fresh, executable task evidence rather than
reclassifying the historical zero-success adjudication result.

## Cycle 15 — Semantic finding closure

Run evidence: `.codex/verification-0.42-round42/`.

Hypothesis: narrowing the development-loop page metadata and explicitly
distinguishing documented limitations from failed checks will remove the two
bounded semantic candidates without weakening the `not-analyzed` policy.

Budget: two configured semantic review contracts, deterministic README and
documentation checks, and the existing full harness; no provider study calls.

- [x] **1. Align the development-loop page metadata with its actual scope.**
- [x] **2. Clarify the `not-analyzed` versus documented-limitation distinction for agents.**
- [x] **3. Re-run both semantic reviewers.**
  - Result: `0` findings from both models across `10` supplied documents.
- [x] **4. Remove the test's global-working-directory race.**
  - The doctor CLI test now passes an explicit fixture config path.
- [x] **5. Re-run the complete harness on the new source/configuration revision.**
  - The complete harness passed after the explicit-config test fix, but the
    semantic reviewer surfaced one generated-document evidence gap.
- [x] **6. Bind generated-document freshness to the semantic review evidence.**
  - The reviewer now receives the executable `verify-generated-docs` result, and
    the harness runs that check as a first-class gate.
- [x] **7. Resolve the memory promotion dry-run wording candidate.**
  - The CLI reference now distinguishes local draft generation from the
    side-effecting commit/push/PR path, with a regression test that proves
    dry-run does not execute `git` or `gh`.

### Cycle 15 decision

The two bounded semantic candidates were addressed in the source documents and
the focused reviewer rerun found no new candidates. The explicit-config test
removed the global-working-directory race, and generated-document freshness is
now executable and supplied as semantic-review evidence. The product scorecard
remains `not-ready` because task correctness still has no successful adjudicated
replicate, generalization has one population and one replicate, cost has no
observed USD value, and natural-language coverage stays bounded by design. The
memory promotion candidate is resolved against the implementation: dry-run
writes a local draft and prints commands, while the non-dry path executes the
GitHub flow.

## Future cycle template

Copy this block for each new cycle and change the run identifiers before execution:

```text
Cycle: N
Hypothesis:
Source revision:
Configuration hash:
Task-suite hash:
Verification run ID:
Baseline run ID:
Budget:

Checklist:
- [ ] Contract and acceptance criteria frozen.
- [ ] Deterministic evals run.
- [ ] Real artifact flows run where applicable.
- [ ] Documentation audit run.
- [ ] Provider-assisted paired eval run, if in scope.
- [ ] UI/API/database evidence collected, if in scope.
- [ ] Per-dimension scorecard updated.
- [ ] Regressions and missing evidence classified.
- [ ] Human approval recorded.
- [ ] Tracking and cleanup reconciled.

Decision: improve | unchanged | regress | blocked
Evidence links:
Open gaps:
Next hypothesis:
```

## Next cycles

- **Cycle 2 — Semantic correctness:** add evidence-backed code/document claim cases and independent adjudication; do not infer correctness from headings, links, or counts.
- **Cycle 3 — Maintainability:** improve owner, lifecycle, source-of-truth, and validation-path coverage for critical documents.
- **Cycle 4 — Agent efficiency:** expand the task suite and measure time-to-correct-answer, clarification rate, evidence citation, and tokens-to-correct-answer across at least three replicates.
- **Cycle 5 — Longitudinal regression:** compare every approved cycle with this baseline and the immediately preceding cycle, preserving protocol and configuration hashes.
