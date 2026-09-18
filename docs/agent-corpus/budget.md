---
type: module
id: doc-bridge-budget
editRoot: src/budget
humanDoc: /docs/spec/config-v1
owner: doc-bridge-maintainers
lifecycle: active
sourceOfTruth: src/budget
validationPath: pnpm test && pnpm typecheck
docbridge:
  covers:
    - area:src/budget
---

# Budget

Owns token counting and message trimming under a budget, mirroring `@agentskit/core` algorithms
synchronously for MCP handlers.

`compileBudget` drops oldest messages until the remainder fits a budget, keeping at least one
recent message. The `approximateCounter` uses the four-characters-per-token rule and stays
deterministic. `applyBudget` splits a payload into named sections, each costing one message,
and drops sections front-to-back until the trimmed payload fits a token budget, reporting what
was dropped and whether it all fit. Every call over the same payload and budget produces the
same report.

