---
type: module
id: doc-bridge-agents
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

Owns the three registry agents under `agents/`: `content-fact-checker`,
`content-style-guide-enforcer` and `ecosystem-doc-bridge-corpus-scanner`. Each directory holds
a `README.md`, an `agent.ts` and an `eval.ts`.
