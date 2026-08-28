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

Benchmark output is aggregate by default: it does not include repository contents, prompts, credentials, or the member lists used to calculate the result. Baselines are not changed by `benchmark` or by a verification run. Use the verification harness's explicit audited baseline command when a new baseline is intentionally approved.
