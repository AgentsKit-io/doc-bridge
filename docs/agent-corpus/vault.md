---
type: module
id: doc-bridge-vault
editRoot: src/vault
humanDoc: /docs/adr/0020-vault-edit-review
owner: doc-bridge-maintainers
lifecycle: active
sourceOfTruth: src/vault
validationPath: pnpm test && pnpm typecheck
docbridge:
  covers:
    - area:src/vault
    - area:src/studio
---

# Vault and Studio

Owns the two generated read surfaces built from a discovery snapshot: the Markdown vault and the
Studio graph. Neither scans the repository on its own account for the Studio side; both are
projections, not sources of truth.

## Vault (`src/vault`)

`export.ts` exports `exportVault` and `renderVault`, which write generated notes plus the ownership
manifest `.doc-bridge-vault.json` (`MANIFEST`, `ManifestSchema`). `safePath` keeps writes inside the
repository and `requireIgnored` refuses an output folder that git does not ignore. `content.ts` builds
the note text (`documentSummary`, `moduleSummary`, `entitySummary`, `relationSections`) and
`excludedFromVault` applies the exclude patterns. `diff.ts` exports `diffVault`, which regenerates the
baseline, checks it against the manifest and turns edits to generated notes into reviewable
`vault-edit` proposals as ADR 0020 describes. It calls `denyServiceOperation`, so it is unavailable
under the service profile.

## Studio (`src/studio`)

`export.ts` exports `exportStudioGraph`, a pure bounded projection of a `DocBridgeIndexV1` into a
`StudioGraphV1`, plus `searchStudioGraph` and `whyStudioNode` for searching it and explaining a node.
It never approves or changes the index it reads.
