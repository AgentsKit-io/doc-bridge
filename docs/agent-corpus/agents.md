---
type: module
id: doc-bridge-agents
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

# Agents

`agents/` holds three agent definitions that ship with the repository. Each directory has a
`README.md`, an `agent.ts` and an `eval.ts`:

- `content-fact-checker` — checks documentation claims.
- `content-style-guide-enforcer` — checks documentation against a style guide.
- `ecosystem-doc-bridge-corpus-scanner` — classifies a corpus before indexing.

Each README documents its install command and typed output. Change an agent and its `eval.ts` together.
