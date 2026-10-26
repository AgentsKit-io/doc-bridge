---
type: module
id: doc-bridge-vault
title: Vault export and vault diff
editRoot: src/vault
humanDoc: /docs/guides/vault
owner: doc-bridge-maintainers
lifecycle: active
sourceOfTruth: src/vault
validationPath: pnpm test && pnpm typecheck
docbridge:
  covers:
    - area:src/vault
---

# Vault

Owns the Markdown vault export under `src/vault`.

`exportVault` and `renderVault` in `src/vault/export.ts` write generated notes plus a manifest, and `safePath` and `requireIgnored` guard the output location. `documentSummary`, `moduleSummary`, `entitySummary` and `relationSections` in `src/vault/content.ts` build note content. `diffVault` in `src/vault/diff.ts` reviews edits made to generated notes against the regenerated baseline.
