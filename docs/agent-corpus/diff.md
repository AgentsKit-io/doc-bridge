---
type: module
id: doc-bridge-diff
editRoot: src/diff
humanDoc: /docs/adr/0010-versioned-change-set-and-semantic-identity
owner: doc-bridge-maintainers
lifecycle: active
sourceOfTruth: src/diff
validationPath: pnpm test && pnpm typecheck
docbridge:
  covers:
    - area:src/diff
---

# Diff

Owns the versioned change set between two discovery snapshots (ADR 0010).

`change-set.ts` exports `snapshotChanges`, which compares the entities and relations of a base and a
head snapshot, and `changeImpact`, which lists the documents to review because a changed entity is
covered, mentioned or linked (`DOCUMENT_RELATIONS`). `parseChangeSet` validates a stored change set and
`changeSetContentHash` hashes it. `diffSnapshots` and `diffSnapshotsWithRead` assemble a full
`ChangeSetV1`; the `WithRead` variant reads through a caller-provided `RepositoryReadV1` and runs under
`withExecutionProfile`.

`version-routing.ts` exports `stampChangeSet`, which stamps a change set with a release event and the
package versions it maps to, and `changeSetEligibility`, which decides whether a change set applies to a
`DocumentTarget`, using the discovery adapter's `satisfiesRange` when one is supplied.
