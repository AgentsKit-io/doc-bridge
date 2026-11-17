---
type: module
id: doc-bridge-discovery
editRoot: src/discovery
humanDoc: /docs/spec/cli
owner: doc-bridge-maintainers
lifecycle: active
sourceOfTruth: src/discovery
validationPath: pnpm test && pnpm typecheck
docbridge:
  covers:
    - area:src/discovery
---

# discovery

Owns repository discovery: areas, coverage, document targets, identity, entrypoints and facts. It reads files under the shared safety limits and never executes repository code.
