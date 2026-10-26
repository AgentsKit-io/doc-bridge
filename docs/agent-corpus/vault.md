---
type: module
id: doc-bridge-vault
editRoot: src/vault
humanDoc: /docs/spec/vault-export-v1
owner: doc-bridge-maintainers
lifecycle: active
sourceOfTruth: src/vault
validationPath: pnpm test && pnpm typecheck
docbridge:
  covers:
    - area:src/vault
---

# Vault

Owns the Obsidian-style vault export of the knowledge graph.

`exportVault` and `renderVault` (`src/vault/export.ts`) render markdown notes into the configured
output folder and track generated files in the `.doc-bridge-vault.json` manifest (`MANIFEST`,
`ManifestSchema`). `safePath` and `requireIgnored` keep writes inside the repository and inside an
ignored folder. `diffVault` (`src/vault/diff.ts`) reviews edits made to generated notes against a
regenerated baseline. `src/vault/content.ts` builds note text: `documentSummary`, `moduleSummary`,
`entitySummary`, `relationSections`, and `excludedFromVault` for pattern exclusion.
