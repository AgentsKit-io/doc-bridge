---
title: Benchmark format v1
description: Reproducible, anonymization-safe semantic and agent-efficiency measurements.
---

# Benchmark format v1

`ak-docs benchmark <fixture.json> <observation.json>` compares an observed run with a versioned truth fixture. The command emits JSON by default and a compact human-readable summary with `--text`.

The fixture contains only stable identifiers and explicitly supported cases:

```json
{
  "schemaVersion": 1,
  "supported": {
    "entities": ["package:fixture"],
    "relations": ["package:fixture->module:src/index.ts"],
    "findings": ["undocumented-relation"]
  },
  "excluded": {
    "entities": ["generated:fixture"],
    "relations": [],
    "findings": ["ambiguous:dynamic-loading"]
  }
}
```

The observation contains the same three sets, plus optional evidence identifiers and finding-category counts. The result reports true positives, false positives, false negatives, precision, recall, duplicate observations, evidence ratio, finding density, excluded cases, thresholds, and regressions. Excluded cases are removed from denominators only because they are explicitly listed and their counts remain visible.

Benchmark output is aggregate by default: it does not include repository contents, prompts, credentials, or the member lists used to calculate the result. Baselines are not changed by `benchmark` or by a verification run. When a new baseline is intentionally approved, use the study tooling's separate audited baseline operation and record its artifact hash and human decision; the official `@agentskit/harness@0.9.0` verification CLI does not replace baselines.

## Deterministic agent retrieval gate

The query contract also measures the real `--agent` payload for a fixed query
fixture. It records hit rate, p95 estimated tokens, p95 response bytes, and
context reduction relative to the indexed fixture. This proves bounded,
repeatable retrieval behavior; it does not prove that a model completed a
semantic task correctly or that estimated tokens equal provider usage.

The task-efficiency contract adds a separate, deterministic layer: each fixed
task declares an expected evidence identifier, and the benchmark records task
count, exact-evidence correctness rate, p95 tokens/bytes, and p95 tokens/time
among correctly grounded tasks. A retrieval hit is not automatically a task
success. These fixture results measure whether the bounded context is
sufficient for the declared task; they are not LLM semantic-success data.

The repository verification contract runs the same class of check through the
real CLI artifact (`scripts/agent-task-efficiency-check.mjs`). This is a
required regression gate for bounded retrieval and measurement, but it remains
separate from semantic adjudication of an agent's prose or implementation.

## Semantic reconciliation gate

The semantic gate runs labeled, synthetic cases through the real reconciliation implementation. The required v1 cases are `confirmed`, `undocumented`, `stale`, `not-analyzed`, `conflict`, and `unresolved`. Each case declares its exact expected diagnostic-code set and requires every emitted diagnostic to contain evidence.

The gate is passing only when finding precision, finding recall, and evidence ratio are all `1.000`, with no regressions. The conflict case may legitimately emit the additional `RELATION_CONFIRMED` and `RELATION_NOT_ANALYZED` diagnostics because both declarations are evaluated independently; the expected set records that behavior explicitly. These cases prove classifier behavior, not coverage of every language analyzer or runtime-only relationship.

Study task success also requires exact coverage of the task's required evidence
identifiers. Matching only the number of evidence items is insufficient and is
treated as partial, preventing inflated correctness or token-efficiency claims.
