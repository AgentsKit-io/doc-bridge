---
title: Study protocol v1
description: Versioned and anonymization-safe contracts for measuring documentation quality and agent efficiency.
---

# Study protocol v1

Phase 0 defines two content-addressed JSON artifacts:

- `StudyProtocolV1` defines the population, evidence classes, task categories, model slots, scenarios, metrics, executable outcome checks, budget, privacy policy, and stopping rules.
- `HistoricalEvidenceRegistryV1` preserves historical observations, available numeric measurements, explicit missing measurements, limitations, and validation state.

The contracts are validated by the real Doc Bridge CLI:

```bash
ak-docs study protocol docs/study/protocol-v1.json --text
ak-docs study history docs/study/historical-evidence-v1.json --protocol docs/study/protocol-v1.json --text
```

Both artifacts contain a SHA-256 normalized content hash. A hash mismatch, unknown cross-reference, duplicate identifier, unsafe public field, or incompatible schema fails closed.

## Evidence classes

`historical` records preserve observations from prior cycles. They may show evolution but cannot support causal claims because the task suite, models, and metrics were not fixed.

`controlled` records belong to the approved benchmark protocol and can be compared only when the source revision, protocol, model, scenario, and validation contract match.

## Outcome coverage

Every protocol outcome must map to one or more executable checks. An outcome outside the current phase must instead declare an explicit `notApplicableReason`; an empty mapping is never silently accepted.

## Privacy contract

Public study artifacts use anonymized repository identifiers. They do not contain repository contents, paths, prompts, credentials, private identifiers, or raw agent responses. Publication always requires human review. The schema deliberately uses bounded identifiers and safe source references instead of arbitrary URLs or file paths.

## Missing data

Unavailable historical metrics are represented in `missingMetrics` with one of `missing`, `not-analyzed`, `blocked`, or `not-applicable` plus a reason. The importer never derives a missing value from another metric.

## Protocol changes

Changing task definitions, metric formulas, model identity, scenario behavior, privacy rules, or validation requirements changes the protocol hash. Existing baseline and historical evidence remains immutable; a changed protocol starts a new controlled evidence series.

## Human authority

The protocol and historical registry can be discovered and summarized by agents, but agents cannot approve protocol changes, replace a baseline, adjudicate their own output, or publish a report. Those actions remain human-gated through the verification harness.
