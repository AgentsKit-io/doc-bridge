---
type: module
id: doc-bridge-studio
editRoot: src/studio
humanDoc: /docs/schemas/studio-graph-v1
owner: doc-bridge-maintainers
lifecycle: active
sourceOfTruth: src/studio
validationPath: pnpm test && node bin/ak-docs.js index
docbridge:
  covers:
    - area:src/studio
---

# Studio

Owns the Studio graph projection in `export.ts`. `exportStudioGraph` turns a Doc Bridge index into
a `StudioGraphV1` (options in `StudioExportOptions`), `searchStudioGraph` queries that graph and
`whyStudioNode` explains why a node is present.
