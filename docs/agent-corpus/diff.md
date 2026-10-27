---
type: module
id: doc-bridge-diff
title: Change sets and version routing
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

Owns change-set computation under `src/diff`.

`diffSnapshots` and `diffSnapshotsWithRead` in `src/diff/change-set.ts` compare two snapshots, `changeImpact` classifies the impact, `parseChangeSet` validates a stored change set and `changeSetContentHash` hashes it. `stampChangeSet` and `changeSetEligibility` in `src/diff/version-routing.ts` route a change set to a document target by version.
