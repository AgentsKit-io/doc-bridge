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

`exportVault` and `renderVault` (src/vault/export.ts) write notes and the `.doc-bridge-vault.json` manifest,
guarded by `safePath` and `requireIgnored`. `diffVault` (src/vault/diff.ts) compares a vault with the repository.
`documentSummary`, `moduleSummary`, `entitySummary` and `excludedFromVault` (src/vault/content.ts) shape note
content. See the [vault export contract](../spec/vault-export-v1.md) and the
[vault diff contract](../spec/vault-diff-v1.md).
