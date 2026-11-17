---
type: module
id: doc-bridge-graph
editRoot: src/graph
humanDoc: /docs/spec/cli
owner: doc-bridge-maintainers
lifecycle: active
sourceOfTruth: src/graph
validationPath: pnpm test && pnpm typecheck
docbridge:
  covers:
    - area:src/graph
---

# graph

Owns graph construction from the index and from reviewed memory. Output is sorted so repeated builds are byte-identical.
