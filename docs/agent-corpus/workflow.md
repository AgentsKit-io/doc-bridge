---
type: module
id: doc-bridge-workflow
editRoot: src/workflow
humanDoc: /docs/spec/cli
owner: doc-bridge-maintainers
lifecycle: active
sourceOfTruth: src/workflow
validationPath: pnpm test && pnpm typecheck
docbridge:
  covers:
    - area:src/workflow
---

# workflow

Owns the workflow engine that sequences deterministic steps for the loop workflow.
