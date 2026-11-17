---
type: module
id: doc-bridge-retriever
editRoot: src/retriever
humanDoc: /docs/spec/cli
owner: doc-bridge-maintainers
lifecycle: active
sourceOfTruth: src/retriever
validationPath: pnpm test && pnpm typecheck
docbridge:
  covers:
    - area:src/retriever
---

# retriever

Owns the document retriever that answers queries from the deterministic index before any optional model is involved.
