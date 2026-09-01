---
title: Round 4 final confirmation v1
description: Final fresh-sample confirmation of the evidence contract and study limitations.
---

# Round 4 final confirmation v1

## Objective

Test whether the round-3 evidence contract generalizes to a fresh representative anonymized sample, with the real configurable Codex CLI adjudicator and auditable operational measurements.

## Sample and recovery

The run selected 12 records at offset 12 from `phase-9-ab-adjudicated-cost-03`, avoiding the 12 records used in rounds 2 and 3. The sample covered all four task categories, both controlled scenarios, both configured models, and five anonymized consumers. One architecture observation timed out and was retried in isolation at offset 17; the initial timeout remains recorded and is not counted as a successful decision.

## Final result

| Metric | Result |
| --- | ---: |
| Sample size | 12 |
| Independent adjudications | 12 |
| Final coverage | 100% |
| Input tokens | 227,799 |
| Output tokens | 2,416 |
| Token cost units | 230,215 |
| Configured study cost | USD 0.301934 |
| Mean latency | 9,672.67 ms |
| P95 latency | 12,474 ms |
| `success` outcomes | 0 |
| `partial` outcomes | 1 |
| `incomplete` outcomes | 3 |
| `blocked` outcomes | 8 |

The final result is `inconclusive` for semantic improvement. The round-3 contract improved the structure of the adjudicator's explanations, but this fresh sample produced no successful outcome. The dominant issues were failed or unexecuted acceptance checks, missing required evidence, unavailable architecture artifacts, and unavailable validation commands. The evidence contract is therefore useful for diagnosis and measurement, but not sufficient by itself to establish documentation quality or delivery correctness.

## Acceptance evidence

| Criterion | Result | Evidence |
| --- | --- | --- |
| Fresh sample was selected deterministically | Validated | Selection `offset: 12`, `limit: 12`; recovery `offset: 17`, `limit: 1`. |
| Real Codex adjudicator executed | Validated | Initial and recovery ledger hashes recorded in `round-4-confirmation-v1.json`. |
| Coverage, tokens, latency, cost, and outcomes measured | Validated | Summary artifact with per-run aggregate values and round-3 deltas. |
| Timeout recovery is explicit and auditable | Validated | Initial output and recovery output hashes are both recorded. |
| Privacy and reproducibility boundaries hold | Validated | Zero forbidden matches; source/config/output hashes recorded; no raw paths or content published. |
| Semantic documentation quality is proven | Not analyzed | The bounded candidate-record study cannot establish full-repository truth. |

## Study conclusion

Across four rounds, Doc Bridge now has a reproducible measurement path for bounded evidence coverage, provider/adjudicator tokens, configured cost, latency, privacy, and failure recovery. The study does not support a claim that the evidence-contract change improves semantic correctness. A stronger claim requires a larger fresh sample, executable repository acceptance checks, richer validated evidence artifacts, and an independently approved semantic review protocol.

## Provenance

- Source ledger: `cc3eb8a816f961b4a4d8fdefd96365e6b89f3fd7d5aad287c3c5cc79a80ed0f5`.
- Round-4 configuration: `80590115a04157a385a6535cdc84d2040955599301ff9ae3b2f5194bc64ca482`.
- Summary artifact: `98a56b9c351e08c7b04860ee4da52eabab7654072fdd8f59d419aac0d167b27e`.
