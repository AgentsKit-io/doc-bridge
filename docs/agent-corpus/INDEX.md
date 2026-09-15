---
type: module
id: doc-bridge-index
editRoot: src/index-builder
humanDoc: /docs/recipes/index-pipeline
owner: doc-bridge-maintainers
lifecycle: active
sourceOfTruth: src/index-builder
validationPath: pnpm test && pnpm typecheck && node bin/ak-docs.js index
---

# Index builder

Owns corpus scanning, handoffs, hashes, `llms.txt`, and watch mode. Generated output must remain deterministic.
