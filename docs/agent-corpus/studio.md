---
type: module
id: doc-bridge-studio
editRoot: src/studio
humanDoc: /docs/schemas/studio-graph-v1
owner: doc-bridge-maintainers
lifecycle: active
sourceOfTruth: src/studio
validationPath: pnpm test && pnpm typecheck
docbridge:
  covers:
    - area:src/studio
---

# Studio

Owns the studio graph export.

`exportStudioGraph`, `searchStudioGraph` and `whyStudioNode` (src/studio/export.ts) project an index into a
`StudioGraphV1`, search it and explain a node. See the [studio graph schema](../schemas/studio-graph-v1.md).
