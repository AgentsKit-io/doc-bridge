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

`snapshotChanges`, `changeImpact`, `diffSnapshots` and `parseChangeSet` (src/diff/change-set.ts) compute and
validate a `ChangeSetV1`. `stampChangeSet` and `changeSetEligibility` (src/diff/version-routing.ts) stamp
releases and decide which documents a change set applies to. See the
[change set contract](../spec/change-set-v1.md).
