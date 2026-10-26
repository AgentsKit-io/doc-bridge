---
type: module
id: doc-bridge-diff
editRoot: src/diff
humanDoc: /docs/spec/change-set-v1
owner: doc-bridge-maintainers
lifecycle: active
sourceOfTruth: src/diff
validationPath: pnpm test && pnpm typecheck
docbridge:
  covers:
    - area:src/diff
---

# Diff

Owns change sets between two discovery snapshots.

`snapshotChanges` in `src/diff/change-set.ts` compares entities and relations of a base and head
snapshot. `changeImpact` lists documents to review because related code changed. `diffSnapshots` and
`diffSnapshotsWithRead` produce the change set, `changeSetContentHash` hashes it and
`parseChangeSet` validates one from input. `src/diff/version-routing.ts` decides which change sets
apply to a documentation version: `stampChangeSet` attaches release data and `changeSetEligibility`
checks a `DocumentTarget` against it.
