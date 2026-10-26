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

Owns the Obsidian-style vault export and the vault drift diff.

`exportVault` and `renderVault` in `src/vault/export.ts` write notes plus the
`.doc-bridge-vault.json` manifest, refusing paths outside the output root (`safePath`) and
outputs that are not git-ignored (`requireIgnored`). `diffVault` in `src/vault/diff.ts`
compares a vault against what the export would produce. `src/vault/content.ts` builds note
summaries (`documentSummary`, `moduleSummary`, `entitySummary`), relation sections and the
`excludedFromVault` filter.
