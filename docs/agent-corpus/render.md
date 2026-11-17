---
type: module
id: doc-bridge-render
editRoot: src/render
humanDoc: /docs/spec/cli
owner: doc-bridge-maintainers
lifecycle: active
sourceOfTruth: src/render
validationPath: pnpm test && pnpm typecheck
docbridge:
  covers:
    - area:src/render
---

# render

Owns template-driven rendering of canonical artifacts (`llms.txt`, area, ownership, change digest) to Markdown.
