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

Owns change sets between two discovery snapshots and the routing of a change set to documents.

`snapshotChanges`, `changeImpact`, `diffSnapshots` and `diffSnapshotsWithRead` in
`src/diff/change-set.ts` compute changes and the documents to review, and `parseChangeSet` and
`changeSetContentHash` validate and seal a ChangeSetV1. `stampChangeSet` and
`changeSetEligibility` in `src/diff/version-routing.ts` stamp a release onto a change set and
decide whether a document target is eligible for it.
