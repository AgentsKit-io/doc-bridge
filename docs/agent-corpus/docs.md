---
type: module
id: doc-bridge-docs
editRoot: docs
humanDoc: /docs/spec/cli
owner: doc-bridge-maintainers
lifecycle: active
sourceOfTruth: docs
validationPath: pnpm test && pnpm typecheck
docbridge:
  covers:
    - area:docs
---

# docs

Owns the human documentation tree (specs, schemas, guides, recipes). Pages carry front matter (owner, lifecycle, sourceOfTruth, validationPath); gates fail without it.
