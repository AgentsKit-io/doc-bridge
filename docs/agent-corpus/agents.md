---
type: module
id: doc-bridge-agents
editRoot: agents
humanDoc: /docs/for-agents
owner: doc-bridge-maintainers
lifecycle: active
sourceOfTruth: agents
validationPath: pnpm typecheck
docbridge:
  covers:
    - area:agents
---

# Catalog agents

Owns the three typed-output agents published from the top-level `agents/` directory:
`content-fact-checker`, `content-style-guide-enforcer` and `ecosystem-doc-bridge-corpus-scanner`.
They are separate from `src/agents/`, which holds the Registry adapter the engine itself uses.

Each agent is a directory with a `README.md` (the pain it addresses and the typed output it returns),
an `agent.ts` that validates its output with a zod schema and always marks the draft as requiring human
review, and an `eval.ts` that checks it. Missing input becomes `gaps` and `openQuestions`, never an
invented fact. Keep the three directories in the same shape when adding or changing one.
