---
title: Longitudinal study metrics v1
description: Deterministic, content-addressed comparison of controlled study rounds.
---

# Longitudinal study metrics v1

`ak-docs study metrics <observation-ledger.json>` calculates an anonymization-safe report from `ControlledStudyObservationV1` records. It groups observations by task, repository, category, difficulty, model, scenario, replicate, and aggregate, then compares the selected baseline and current rounds. When a round contains retries or recovery runs, pass `--baseline-run-id` and `--current-run-id` to bind each side to an exact run without rewriting ledger history.

When both sides intentionally share one round (for example, two arms of a pairwise run), the same-round selection keeps only the explicitly named run IDs. A same-round report exposes the scenario groups for arm-level analysis; it does not manufacture a round comparison.

```bash
ak-docs study metrics docs/study/observation-ledger-v1.json --text
ak-docs study metrics docs/study/observation-ledger-v1.json --baseline-round baseline --current-round cycle-1 --json
ak-docs study metrics docs/study/observation-ledger-v1.json --baseline-round baseline --baseline-run-id baseline-run-01 --current-round cycle-1 --current-run-id cycle-1-run-01 --json
```

## Metric contract

The report keeps metric families separate. Counts are sums, rates are weighted ratios or means as stated below, and latency/answer-cost distributions use p95.

| Family | Metrics | Collection |
| --- | --- | --- |
| Discovery/context | `providerTokens`, `estimatedTokens`, `tokensToCorrectAnswerP95`, `timeToCorrectAnswerP95Ms`, `contextBytesP95`, `responseBytesP95`, `searchHitRate`, `evidenceCitationRate`, `averageToolCalls`, `clarificationRate` | provider or explicitly labeled observation measurements |
| Task/delivery | `successRate`, `completedRate`, `acceptanceCheckRate`, `errorRate`, `reworkRate`, `safetyRate` | adjudication and observation measurements |
| Documentation | `documentationFindingCount`, `documentationExampleRate`, `documentationFreshnessRate`, `documentationCorrectnessRate`, `documentationCompletenessRate`, `documentationClarityRate`, `documentationMaintainabilityRate` | audit or human/adjudicator measurements |
| Operations/cost | `latencyP95Ms`, `analysisCostUsd`, `agentCostUsd`, `adjudicatorCostUsd`, `totalCostUsd`, `providerTokenCostUnits`, `adjudicatorTokenCostUnits` | runner and explicitly labeled cost measurements |

Provider token totals and estimated token totals are never combined. An estimate is valid only when the observation says `tokenMethod: estimate`. Known values are retained in partial totals; if any observation is missing a value, the metric is marked with a `-partial` entry in `missingMetrics` and must not be used as a complete-round comparison. A value that was not collected at all is `null`, listed in `missingMetrics`, and excluded from its denominator.

Observations may carry additional bounded numeric values in `measurements`. The reserved keys above have the following meanings:

- `searchHitRate`, `errorRate`, and documentation `*Rate` values are ratios from `0` to `1`.
- `acceptanceChecksPassed` and `acceptanceChecksTotal` form a weighted acceptance ratio.
- `documentationFindingCount`, `analysisCostUsd`, `agentCostUsd`, `adjudicatorCostUsd`, `providerTokenCostUnits`, and `adjudicatorTokenCostUnits` are additive values. Token-unit fields are one unit per provider-reported input or output token and are not currency values. USD fields are valid only when the run records configured rates and provider-reported usage.
- `safetyOutcome` is preferred for the safety rate; `safe` is `1`, `unsafe` is `0`, and `not-applicable` is excluded.

## Comparison rules

Each comparison contains baseline and current values, absolute change, relative change when the baseline is non-zero, sample sizes, limitations, and one of `improved`, `unchanged`, `regressed`, `inconclusive`, or `not-analyzed`.

- Fewer tokens, lower latency, less context, fewer clarifications, less rework, and lower cost are directionally better.
- Higher success, evidence, safety, acceptance, search-hit, and documentation-quality rates are directionally better.
- A lower-efficiency value cannot make a round `improved` when success, evidence citation, evidence quality, acceptance, safety, or rework regresses.
- A comparison with fewer than two observations on either side is `inconclusive`, not a pass.
- Missing baseline/current groups are `not-analyzed`; the calculator does not invent values or backfill historical data.

Wilson 95% intervals are emitted for completion and task success rates. They communicate uncertainty; they do not establish causality. Aggregate results must be read with the subgroup results because model, scenario, repository, task difficulty, and documentation changes can confound a round.

## Provenance and immutability

The report is normalized and content-hashed with `sha256-normalized-v1`. JSON and text output expose the same group/comparison metric values and report hash. Calculating metrics never writes or replaces a baseline. Baseline approval and replacement remain explicit, audited harness operations.

The report contains identifiers, versions, hashes, counts, timings, and classifications only. It must not contain repository contents, private paths, prompts, credentials, or raw agent responses.

The CLI exits non-zero for a comparison classified as `regressed`. Structural verification that only checks report generation may pass `--allow-regressions`; regressions remain present in the report and should still fail a quality gate that is intended to enforce improvement.

The first anonymized deterministic documentation snapshot is [Audit round 2026-08-31](../study/documentation-audit-round-2026-08-31.json). It is an observational inventory, not the controlled baseline: all six consumers still require semantic review, and its missing metrics must remain missing rather than being inferred.
