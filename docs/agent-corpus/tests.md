---
type: module
id: doc-bridge-tests
editRoot: tests
humanDoc: /docs/spec/cli
owner: doc-bridge-maintainers
lifecycle: active
sourceOfTruth: tests
validationPath: pnpm test
docbridge:
  covers:
    - area:tests
---

# tests

Owns the vitest suites. Tests use temp directories, never the real HOME, and must be deterministic.
