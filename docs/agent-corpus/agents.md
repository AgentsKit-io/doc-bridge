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

# Agents

Holds three registry agents, each in its own folder with a `README.md`: `content-fact-checker`
(outputs typed claims), `content-style-guide-enforcer` (outputs typed violations) and
`ecosystem-doc-bridge-corpus-scanner` (outputs a typed scan report of paths, doc types and
staleness before indexing). The registry contract is in `docs/spec/registry-agents.md`.
