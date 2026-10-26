---
type: module
id: doc-bridge-studio
editRoot: src/studio
humanDoc: /docs/getting-started
owner: doc-bridge-maintainers
lifecycle: active
sourceOfTruth: src/studio
validationPath: pnpm test && pnpm typecheck
docbridge:
  covers:
    - area:src/studio
---

# Studio graph

Owns the studio graph export. `exportStudioGraph` in `src/studio/export.ts` turns an index into
a StudioGraphV1, `searchStudioGraph` searches it and `whyStudioNode` explains why a node is
present.
