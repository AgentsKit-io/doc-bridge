---
type: module
id: doc-bridge-brief
editRoot: src/brief
humanDoc: /docs/spec/cli
owner: doc-bridge-maintainers
lifecycle: active
sourceOfTruth: src/brief
validationPath: pnpm test && pnpm typecheck
docbridge:
  covers:
    - area:src/brief
---

# Brief

Owns the ticket brief a production line attaches to an agent's task.

`buildBrief` searches the ticket text in the index, turns the best matches (at most three) into
agent handoffs, and quotes bounded product context files (`docs/finalizacao`, `docs/mvp.yaml` by
default). It is Layer 0 only: no model is called, so the run record reports zero tokens. The same
index, config and options produce the same brief.
