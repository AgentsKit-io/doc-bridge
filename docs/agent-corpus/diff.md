---
type: module
id: doc-bridge-diff
editRoot: src/diff
humanDoc: /docs/spec/change-set-v1
owner: doc-bridge-maintainers
lifecycle: active
sourceOfTruth: src/diff
validationPath: pnpm test && node bin/ak-docs.js index
docbridge:
  covers:
    - area:src/diff
---

# Diff

Owns change-set computation between two discovery snapshots. `snapshotChanges` in `change-set.ts`
lists entity and relation changes; `changeImpact` maps them to documents to review through the
`DOCUMENT_RELATIONS` kinds (covers, mentions, mentions-symbol, links-to). `diffSnapshots` and
`diffSnapshotsWithRead` produce the change set, `parseChangeSet` validates one and
`changeSetContentHash` hashes it. `version-routing.ts` stamps change sets with release events
(`stampChangeSet`) and decides whether a document target is eligible (`changeSetEligibility`).
