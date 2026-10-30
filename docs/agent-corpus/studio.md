---
type: module
id: doc-bridge-studio
title: Studio graph export
editRoot: src/studio
humanDoc: /docs/spec/cli
owner: doc-bridge-maintainers
lifecycle: active
sourceOfTruth: src/studio
validationPath: pnpm test && pnpm typecheck
docbridge:
  covers:
    - area:src/studio
---

# Studio

Owns the studio graph projection in `src/studio/export.ts`.

`exportStudioGraph` builds a bounded, pure presentation graph from an index, with optional notes, findings, an enrichment overlay and vault diff proposals. `searchStudioGraph` and `whyStudioNode` query the exported graph.
