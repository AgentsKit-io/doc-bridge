---
type: module
id: doc-bridge-integrations
editRoot: integrations
humanDoc: /docs/spec/vault-export-v1
owner: doc-bridge-maintainers
lifecycle: active
sourceOfTruth: integrations
validationPath: pnpm test && pnpm typecheck
docbridge:
  covers:
    - area:integrations
---

# Integrations

Owns the Obsidian companion plugin in integrations/obsidian. It runs `ak-docs vault export --findings --json`
(or a custom command) and shows drift in the status bar, a findings view and graph colours. See
integrations/obsidian/README.md and the [vault export contract](../spec/vault-export-v1.md).
