---
title: Round 2 expanded validation v1
description: Auditable independent adjudication results for an anonymized study sample.
---

# Round 2 expanded validation v1

## Objective

Measure whether a real, configurable Codex CLI can independently evaluate bounded study observations while preserving provenance, privacy, token accounting, cost attribution, and latency measurements.

## Contract and sample

The run selected 12 observations from the anonymized `phase-9-ab-adjudicated-cost-03` run. The sample covers all four task categories (`architecture`, `discovery`, `documentation`, and `implementation`), both scenarios (`repository-only` and `deterministic-doc-bridge`), and five anonymized consumer identifiers. The adjudicator was the real Codex CLI running `gpt-5.6-luna`, separated from the provider execution being evaluated.

The adapter sent only bounded task metadata and candidate measurements. It did not send repository paths, raw repository content, prompts, credentials, or raw provider responses.

## Results

| Metric | Result |
| --- | ---: |
| Sample size | 12 |
| Independent adjudications | 12 |
| Adjudication coverage | 100% |
| Pending adjudications | 0 |
| Input tokens | 226,577 |
| Output tokens | 3,297 |
| Token cost units | 229,874 |
| Configured study cost | USD 0.302758 |
| Mean latency | 9,841.5 ms |
| P95 latency | 11,503 ms |

The independent outcomes were 2 `incomplete`, 5 `partial`, and 5 `blocked`; no observation was promoted to `success`. The dominant signals were missing or unvalidated discovery evidence, unavailable or unexecuted acceptance checks, and insufficiently specific documentation evidence. These are actionable study findings, not a claim that the underlying repositories are defective in every respect.

## Acceptance evidence

| Criterion | Result | Evidence |
| --- | --- | --- |
| Real configurable adjudicator executed | Validated | Output ledger hash `a89fa316b88eea707347c1b2caae64c6895ce19688a57a7909e15abb51058f20`; 12 automated decisions. |
| Coverage and category/scenario representation measured | Validated | `round-2-expanded-adjudication-v1.json`. |
| Token, latency, and configured cost measured | Validated | Per-observation adjudicator measurements and aggregate summary. |
| Privacy boundary preserved | Validated | `forbiddenMatchCount: 0`; raw paths and content excluded. |
| Result reproducibility bound to inputs | Validated | Source ledger hash, output ledger hash, configuration hash, and content hash are recorded. |
| Full-repository semantic quality established | Not analyzed | This bounded sample evaluates candidate records; it does not replace a full documentation/code comparison. |

## Provenance

- Source ledger: `cc3eb8a816f961b4a4d8fdefd96365e6b89f3fd7d5aad287c3c5cc79a80ed0f5`.
- Adjudicator configuration: `d816148be351fd8dacdf82f204d6694b41e3f3af90ce5f8cae11ced8c99ef37b`.
- Summary artifact: `df4a869c9da7354c7fdd6a6ed993f67f9fb16ccb8c2953b8c937328e248701ce`.

## Limitations

- The sample is anonymized and bounded; it is not a full-repository evaluation.
- The configured USD rates are experimental study rates, not a vendor invoice.
- The adjudicator can evaluate only evidence present in the bounded candidate record and cannot recover omitted evidence.

The initial batch attempt exposed an invalid strict JSON schema and produced only `pending` results. The schema was corrected to require nullable usage fields, a one-observation CLI smoke passed, and the controlled 12-observation run was repeated successfully. The failed attempt is retained only as an operational limitation, not as quality evidence.
