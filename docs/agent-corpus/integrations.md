---
type: module
id: doc-bridge-integrations
editRoot: integrations
humanDoc: /docs/spec/vault-export-v1
owner: doc-bridge-maintainers
lifecycle: active
sourceOfTruth: integrations/obsidian
validationPath: pnpm test && pnpm typecheck
docbridge:
  covers:
    - area:integrations
---

# Integrations

Holds the Doc Bridge for Obsidian desktop plugin in `integrations/obsidian` (`main.ts`, `src/`,
`manifest.json`, `scripts/install.mjs`). It reviews drift in a vault from either a doc-bridge vault,
by running `ak-docs vault export --findings --json`, or a custom command that prints JSON. Setup
and behaviour are described in `integrations/obsidian/README.md`.
