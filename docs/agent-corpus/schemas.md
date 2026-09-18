---
type: module
id: doc-bridge-schemas
editRoot: src/schemas
humanDoc: /docs/schemas/doc-bridge-index-v1
owner: doc-bridge-maintainers
lifecycle: active
sourceOfTruth: src/schemas
validationPath: pnpm test && pnpm typecheck
docbridge:
  covers:
    - area:src/schemas
---

# Schemas

Owns the artifact contracts: every sealed artifact this repository writes or reads is shaped here, and
the schema is the contract, not the code that happens to produce it.

`knowledge.ts` holds `DiscoverySnapshotV1Schema` and the shared `Provenance` and finding vocabulary;
`retrieval-index.ts` the projection, including `ConfidenceSchema` and `AudienceSchema` and the bounded
`coveredBy`/`mentionedBy` lists the doctor reads; `doc-bridge-index.ts` the committed index that wraps
both; `agent-handoff.ts`, `memory-candidate.ts`, `enrichment.ts` and `budget.ts` the remaining
artifacts; `json-schemas.ts` the published JSON Schema forms of three of them.

Get the two hashes the right way round. **`contentHash` is the seal**: `contentHashForArtifactV1`
removes that field and hashes everything else, so the value is a hash *of the rest of the artifact*.
`snapshotHash` inside the projection is **provenance** and deliberately not a seal input — sealing over
it was the 1.10.0 defect, because the snapshot's revision changes when the tree does and a committed
index then went stale the moment it landed. 1.10.1 replaced it with `snapshotObservationHash` and bumped
`RETRIEVAL_PROJECTION_VERSION`.

Field bounds are part of the contract, not hygiene: shortening a `max()` here rejects artifacts that
were valid before.
