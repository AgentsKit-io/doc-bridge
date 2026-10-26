---
type: module
id: doc-bridge-studio
editRoot: src/studio
humanDoc: /docs/spec/graph-signals-v1
owner: doc-bridge-maintainers
lifecycle: active
sourceOfTruth: src/studio
validationPath: pnpm test && pnpm typecheck
docbridge:
  covers:
    - area:src/studio
---

# Studio

Owns the graph export for studio viewers in `src/studio/export.ts`. `exportStudioGraph` turns an
index into a `StudioGraphV1` (configured with `StudioExportOptions`). `searchStudioGraph` matches a
query against it and `whyStudioNode` explains why a node is in the graph.
