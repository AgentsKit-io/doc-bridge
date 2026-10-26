---
type: module
id: doc-bridge-vault
editRoot: src/vault
humanDoc: /docs/spec/vault-export-v1
owner: doc-bridge-maintainers
lifecycle: active
sourceOfTruth: src/vault
validationPath: pnpm test && node bin/ak-docs.js index
docbridge:
  covers:
    - area:src/vault
    - area:integrations
---

# Vault

Owns the Obsidian-style vault export. `exportVault` and `renderVault` in `export.ts` write notes
from a discovery snapshot and keep a manifest (`MANIFEST`, `.doc-bridge-vault.json`); `safePath`
and `requireIgnored` keep writes inside an ignored output directory. `diffVault` in `diff.ts`
compares an existing vault with a fresh render. `content.ts` builds note summaries
(`documentSummary`, `moduleSummary`, `entitySummary`), relation sections and the
`excludedFromVault` filter.

The `integrations/obsidian` directory is the separate Obsidian desktop plugin that shows drift for
a vault; its usage is described in `integrations/obsidian/README.md`. It runs
`ak-docs vault export --findings --json` or a custom command and does not share code with `src/vault`.
