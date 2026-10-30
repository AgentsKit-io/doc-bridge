---
type: module
id: doc-bridge-integrations
title: Obsidian integration
editRoot: integrations
humanDoc: /docs/for-agents
owner: doc-bridge-maintainers
lifecycle: active
sourceOfTruth: integrations
validationPath: pnpm test && pnpm typecheck
docbridge:
  covers:
    - area:integrations
---

# Integrations

Owns the `integrations` folder, which holds the Obsidian plugin in `integrations/obsidian` (see its `README.md` and `main.ts`). It refreshes drift findings from `ak-docs vault export --findings --json` or from a custom command.
