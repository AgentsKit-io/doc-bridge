---
title: Round 1 instrumentation plan v1
description: Acceptance contract for configurable study cost attribution and independent adjudication.
---

# Round 1 instrumentation plan v1

## Objective

Make controlled study results auditable without bundling a local model runtime: record configured USD attribution when usage is available and support a separate adjudicator process that cannot approve its own provider output.

## Acceptance criteria

| ID | Criterion | Evidence |
| --- | --- | --- |
| R1-C1 | Provider and adjudicator rates are schema-validated, content-addressed, and use an explicit USD formula. | Focused provider CLI test and current configuration hash. |
| R1-C2 | The runner records `agentCostUsd` only for labeled provider usage with configured rates; missing data remains missing. | Runner test and metrics output. |
| R1-C3 | A separate bounded CLI can adjudicate a ledger using only anonymized structured candidate data. | Independent adjudicator test and CLI smoke run. |
| R1-C4 | Adjudicator timeout, invalid output, unavailable command, and output-limit failures remain `pending`. | Focused failure-path test. |
| R1-C5 | Token-equivalent and USD measurements remain distinct and auditable by source, run ID, configuration hash, and content hashes. | Ledger schema, metrics report, and verification harness evidence. |
| R1-C6 | The smoke run against a private consumer repository produces no publication-bound private path, repository content, prompt, or raw response. | Deterministic privacy gate and anonymized output inspection. |

## Deliberate boundary

Round 1 adjudicates the bounded structured candidate record, not raw model prose or private repository contents. This proves the independent process, privacy boundary, cost accounting, and failure behavior. Semantic review of documentation quality and code/documentation contradictions remains a later round because it requires richer evidence and a separately approved evaluation protocol.

## Measurement fields

- `agentCostUsd`: configured-rate USD estimate for the evaluated provider.
- `adjudicatorCostUsd`: configured-rate USD estimate for the independent adjudicator.
- `providerTokenCostUnits` and `adjudicatorTokenCostUnits`: provider-reported input plus output tokens.
- `adjudicatorLatencyMs`: elapsed adjudicator process time.
- `adjudication.status`, `actor`, `method`, `outcome`, `confidence`, and `reasonCodes`: independent decision provenance.

Rates are experimental configuration inputs, not vendor billing claims. Every result must retain the config hash and run identifier used to produce it.

## Recorded smoke evidence

The private-consumer smoke processed one observation with `--limit 1` and kept the remaining ledger observations unchanged. The anonymized output ledger hash is `3f2c80e6768ffd33a14f38ca8fb9eeb482f4722c9f028ec29adc7d09d54aaef6`; the configuration hash is `7ea4b4496d23c15f93527120927ec46105d8fc46c66114e0c710426f5f417ea8`. The independent adjudicator recorded 150 token-cost units, USD 0.00034 at the configured study rates, and 49 ms latency. The privacy gate scanned the output and found zero forbidden matches.
