---
type: module
id: doc-bridge-gates
editRoot: src/gates
humanDoc: /docs/spec/documentation-standard-v1
owner: doc-bridge-maintainers
lifecycle: active
sourceOfTruth: src/gates
validationPath: pnpm test && node bin/ak-docs.js gate run
---

# Gates

Owns freshness, coverage, and human-link checks. A gate must observe committed state before rewriting artifacts.
