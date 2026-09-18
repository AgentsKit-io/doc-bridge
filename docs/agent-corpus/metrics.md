---
type: module
id: doc-bridge-metrics
editRoot: src/metrics
humanDoc: /docs/query
owner: doc-bridge-maintainers
lifecycle: active
sourceOfTruth: src/metrics
validationPath: pnpm test && pnpm typecheck
docbridge:
  covers:
    - area:src/metrics
---

# Metrics

Owns benchmark measurement for entity, relation, and finding precision and recall, and efficiency
metrics for agent latency, response bytes, and tokens.

`measureBenchmark` compares observations against a fixture of supported and excluded items,
counts true positives, false positives and negatives per category, and reports regressions when
precision or recall falls below thresholds. `measureAgentEfficiency` calculates hit rate, latency
percentiles, and response compression ratio from query runs. `measureAgentTaskEfficiency` tracks
per-task correctness and resource cost. `compareBenchmarkSnapshots` diffs two snapshots by
classification state.

