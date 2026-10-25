---
type: module
id: doc-bridge-integrations
editRoot: integrations
humanDoc: /docs/guides/vault
owner: doc-bridge-maintainers
lifecycle: active
sourceOfTruth: integrations/obsidian
validationPath: pnpm typecheck
docbridge:
  covers:
    - area:integrations
---

# Integrations

Owns `integrations/obsidian`, the desktop companion that shows documentation drift inside an Obsidian
vault. It is a separate package with its own `package.json`, build and tests; `main.ts` is the plugin entry
and `src/core.ts` holds the logic.

In the default source it runs `ak-docs vault export --findings --json` against the configured repository
root and never runs `ak-docs index`. In the custom-command source it runs the configured command and never
edits notes. Its install and settings are documented in `integrations/obsidian/README.md`; the vault the
default source reads is described in the [vault guide](../guides/vault.md).
