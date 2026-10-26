---
type: module
id: doc-bridge-integrations
editRoot: integrations
humanDoc: /docs/getting-started
owner: doc-bridge-maintainers
lifecycle: active
sourceOfTruth: integrations
validationPath: pnpm test && pnpm typecheck
docbridge:
  covers:
    - area:integrations
---

# Integrations

Owns `integrations/obsidian`, the Obsidian plugin for reviewing drift in a vault. It runs
`ak-docs vault export --findings --json` or a custom command and shows stale notes in a status
bar item and findings view. Its entry point is `main.ts` and its install helper is
`scripts/install.mjs`.
