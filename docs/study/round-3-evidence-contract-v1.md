---
title: Round 3 evidence contract validation v1
description: Before-and-after measurement of structured evidence coverage in independent study adjudication.
---

# Round 3 evidence contract validation v1

## Objective

Improve the study evidence contract so an independent adjudicator can distinguish missing evidence from unexecuted acceptance checks without receiving repository content or paths.

## Change

The adjudicator input now includes a bounded `evidenceCoverage` object with presence for each required evidence identifier, a reference count, and an `acceptanceExecution` object with execution status, observed passed/total counts, and a measurement-presence flag. The provider contract also asks agents to execute declared acceptance checks when available and to emit typed coverage measurements. No raw repository data, credentials, prompts, or provider responses are included.

## Results

The exact 12-observation anonymized sample from round 2 was re-adjudicated with the real Codex CLI (`gpt-5.6-luna`).

| Metric | Round 2 | Round 3 | Change |
| --- | ---: | ---: | ---: |
| Independent coverage | 100% | 100% | 0 pp |
| Success outcomes | 0 | 1 | +1 |
| Partial outcomes | 5 | 4 | -1 |
| Incomplete outcomes | 2 | 2 | 0 |
| Blocked outcomes | 5 | 5 | 0 |
| Adjudicator input tokens | 226,577 | 227,535 | +958 |
| Adjudicator output tokens | 3,297 | 3,029 | -268 |
| Token cost units | 229,874 | 230,564 | +690 |
| Configured study cost | USD 0.302758 | USD 0.330994 | +USD 0.028236 |
| Mean latency | 9,841.5 ms | 9,498.08 ms | -343.42 ms |
| P95 latency | 11,503 ms | 11,643 ms | +140 ms |

The new contract produced clearer reason codes, including `required-evidence-present`, `required-evidence-missing`, and `acceptance-check-unexecuted`. One observation was classified as `success`, but the sample remains inconclusive: five observations stayed blocked and the same sample was re-adjudicated, so model response variance is a confounder.

## Acceptance evidence

| Criterion | Result | Evidence |
| --- | --- | --- |
| Evidence coverage is explicit and bounded | Validated | Round-3 adapter input contract and 12 automated adjudications. |
| Real Codex CLI executed with the new contract | Validated | Output ledger hash `3a5191e9bb839da91c7bf8bcfe58ba77e718a381c27e8867243fc7c859167eee`. |
| Before/after metrics are auditable | Validated | `round-3-evidence-contract-v1.json` and round-2 summary. |
| Privacy boundary preserved | Validated | Zero forbidden matches; raw paths and content excluded. |
| Full semantic documentation quality proven | Not analyzed | The bounded sample measures evidence sufficiency, not full-repository truth. |

## Provenance

- Source ledger: `cc3eb8a816f961b4a4d8fdefd96365e6b89f3fd7d5aad287c3c5cc79a80ed0f5`.
- Round-3 configuration: `1735f10937845e1db35873c27fd38700e8c5a93bbd412884df5bd0b550628ce5`.
- Summary artifact: `a75b0bdd23eeb0ba65d25e1ff0c9836922190f78a25f317cc38172266c586e32`.

## Limitations

- This is a same-sample re-adjudication, not a causal A/B experiment.
- The configured USD rates are experimental study rates, not a vendor invoice.
- The adjudicator cannot recover evidence omitted from the candidate record.
- The next confirmatory round should use a fresh representative sample and test whether the improved contract generalizes.
