---
type: module
id: doc-bridge-bench
editRoot: src/bench
humanDoc: /docs/spec/cli
owner: doc-bridge-maintainers
lifecycle: active
sourceOfTruth: src/bench
validationPath: pnpm test && pnpm typecheck
docbridge:
  covers:
    - area:src/bench
---

# bench

Owns the retrieval benchmark runner, baselines and overlay deltas. The hit@3 baseline is a regression gate: change ranking, never the baseline, to fix a drop.
