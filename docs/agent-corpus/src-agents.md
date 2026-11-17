---
type: module
id: doc-bridge-src-agents
editRoot: src/agents
humanDoc: /docs/spec/cli
owner: doc-bridge-maintainers
lifecycle: active
sourceOfTruth: src/agents
validationPath: pnpm test && pnpm typecheck
docbridge:
  covers:
    - area:src/agents
---

# Source agents

Owns the registry adapter that exposes agent definitions to the AgentsKit registry.
