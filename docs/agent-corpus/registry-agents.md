---
type: module
id: doc-bridge-registry-agents
editRoot: agents
humanDoc: /docs/spec/registry-agents
owner: doc-bridge-maintainers
lifecycle: active
sourceOfTruth: agents
validationPath: pnpm test && pnpm typecheck
docbridge:
  covers:
    - area:agents
---

# Registry agents

Owns the registry agent packages `content-fact-checker`, `content-style-guide-enforcer` and
`ecosystem-doc-bridge-corpus-scanner`. Each directory holds a README and its agent code (for example
agents/content-fact-checker/agent.ts and eval.ts). See [registry agents](../spec/registry-agents.md).
