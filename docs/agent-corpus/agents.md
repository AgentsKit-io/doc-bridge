---
type: module
id: doc-bridge-agents
title: Content agents
editRoot: agents
humanDoc: /docs/for-agents
owner: doc-bridge-maintainers
lifecycle: active
sourceOfTruth: agents
validationPath: pnpm test && pnpm typecheck
docbridge:
  covers:
    - area:agents
---

# Content agents

Owns the `agents` folder. It holds three agents, each with a `README.md`, an `agent.ts` and an `eval.ts`: `content-fact-checker`, `content-style-guide-enforcer` and `ecosystem-doc-bridge-corpus-scanner`.
