---
'@agentskit/doc-bridge': minor
---

Give every file-backed entity its own content hash, and reuse unchanged entities between scans.

`EvidenceSchema.contentHash` had existed since the first schema and `discoverRepository` never
filled it: on this repository 0 of 369 entities carried one. Every cache and every overlay could
therefore be keyed only on "the whole repository changed", which is true between any two commits.
Now every `module`, `document` and `package` entity carries the hash of its file in its first
evidence item, and `external` entities carry none — a name in a manifest is not a file.

`discoverRepository({ previous })` accepts a snapshot from a previous scan and skips the TypeScript
and Markdown parses for files whose hash is unchanged. Reuse is only taken where it cannot change
the answer:

- an entity's own fields depend on its own bytes, so a hash match is enough for the entity;
- a relation depends on what else exists, so relation reuse also requires that the universe the
  references resolve against is identical — module paths, packages and compiler options for a
  module, and additionally document paths, area paths and which module declares each exported
  symbol for a document. Both fingerprints are derived from the previous snapshot rather than
  stored in it;
- the whole snapshot is refused unless it declares, and matches, this `pipelineVersion`, these
  `analyzerVersions` and this `configurationHash`. An analyzer that learns to read more produces
  different entities from identical bytes.

A replayed edge whose internal target is gone is dropped rather than carried — a renamed file must
not leave a graph asserting something the repository no longer contains — while an external or
unresolved endpoint is re-added, because it is in the snapshot only because the reused entity
referenced it.

Two `js-ts` facts only ever lived in a local variable, which made the aggregate `dynamic-imports`
and `runtime-wiring` entries unreproducible from the per-file ones — and a reused scan replays the
per-file ones. A literal `require` now sets the resolved-dynamic-import flag it always recorded
evidence for, and every observed runtime-wiring call leaves a per-file entry: `complete` when its
target is statically known, `not-analyzed` when it is not, where before a resolved call left no
record at all. Both make the aggregate derivable from what the snapshot actually carries.

One `coverage` entry with `scope: reused-entities` reports what a run reused and what it re-parsed,
so a fast run is explainable rather than suspicious. It is the only part of a snapshot that
describes the run rather than the repository: the entities, the relations and every other coverage
entry are byte-identical to a cold scan's. The CLI still scans cold, so its artifacts are unchanged
apart from the new entry. `pipelineVersion` becomes `1.5.0`, the `repository` analyzer `1.3.0` and `js-ts` `1.3.5`.
