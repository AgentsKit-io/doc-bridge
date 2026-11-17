---
type: module
id: doc-bridge-storage
editRoot: src/storage
humanDoc: /docs/spec/cli
owner: doc-bridge-maintainers
lifecycle: active
sourceOfTruth: src/storage
validationPath: pnpm test && pnpm typecheck
docbridge:
  covers:
    - area:src/storage
---

# storage

Owns local artifact and fact storage and its operation contract. Writes stay under `.doc-bridge/`.
