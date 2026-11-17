---
type: module
id: doc-bridge-reconciliation
editRoot: src/reconciliation
humanDoc: /docs/spec/cli
owner: doc-bridge-maintainers
lifecycle: active
sourceOfTruth: src/reconciliation
validationPath: pnpm test && pnpm typecheck
docbridge:
  covers:
    - area:src/reconciliation
---

# reconciliation

Owns reconciliation of documented claims against discovered code facts, scoped per package.
