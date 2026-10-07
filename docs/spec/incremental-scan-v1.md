---
title: Incremental scan v1
description: How Doc Bridge hashes each file-backed entity, when a second scan may reuse one, and what it refuses to reuse.
---

# Incremental scan v1

Every `module`, `document` and `package` entity carries the hash of its file in its first evidence
item. An `external` entity carries none: it is a name in a manifest, not a file on disk.

```json
{
  "id": "module:src/query/search.ts",
  "kind": "module",
  "evidence": [{ "source": "code", "path": "src/query/search.ts", "contentHash": "…" }]
}
```

`EvidenceSchema.contentHash` had existed since the first schema and discovery never filled it, so
every cache and every overlay could be keyed only on "the whole repository changed" — which is true
between any two commits and therefore useless. With a hash per file, a consumer can expire one
entry, and a second scan can skip the expensive part: the TypeScript parse and the Markdown parse,
where nearly all of discovery's time goes.

A document's hash is taken after a leading byte-order mark is stripped. A mark is not content: a
file that only gained one parses to the same tree, and should not invalidate anything.

## Reuse

```ts
const cold = discoverRepository({ root, config })
const fast = discoverRepository({ root, config, previous: cold })
```

`previous` is an offer, not an instruction. Discovery reuses an entity only when reuse cannot change
the answer, and two different things can change it:

- **An entity's own fields depend on its own bytes.** A hash match is enough.
- **A relation depends on what else exists.** A module importing `./new.js` resolved to nothing
  before that file was added and resolves to a module after; a document mentioning `rank` points at
  whichever module declares it. So relation reuse also requires that the universe the references
  resolve against is identical.

Two fingerprints capture that universe, both derived from the previous snapshot rather than stored
in it — everything they cover is in the snapshot already, and a stored fingerprint is one more
thing that can be stale or forged.

| Fingerprint | Covers | Gates |
| --- | --- | --- |
| Module universe | module paths, packages, compiler options | reuse of a module's relations |
| Resolution | the module universe, plus document paths, area paths and which module declares each exported symbol | reuse of a document |

A reused entity's relations are replayed against the entity set the scan is producing. An edge
whose internal target is gone is dropped rather than carried: the file it pointed at was renamed or
deleted, and a graph that keeps the edge is lying about the repository. An external or unresolved
endpoint is re-added instead, because such an entity is in the snapshot only because something
referenced it, and the thing that referenced it is exactly what was reused.

## What is refused outright

A hash says a file has not changed. It says nothing about whether this code would still read it the
same way — an analyzer that learns to record a document's headings produces different entities from
identical bytes, and a configuration change moves area boundaries and runtime-wiring detection. So
the whole snapshot is refused unless it was produced by this `pipelineVersion`, these
`analyzerVersions` and this `configurationHash`, and a snapshot that does not declare all three is
refused as well. Trusting an undeclared input with a repository scan is how a cache becomes a
source of wrong answers.

A cache that is only usually right is worse than no cache. Reuse either produces the snapshot a
cold scan would produce, or it does not happen.

Markdown analyzer version 1.1.0 invalidates older aggregated symbol-reference snapshots.
Replayed symbol relations retain their symbol-discriminated IDs, metadata and bounded evidence.
Reused document metadata retains structured ambiguous-symbol references and their truncation flag.
Changing the exported-symbol ownership fingerprint reparses document references, so removing one
export drops only its relation even when its owning module remains.

A reused entity also replays the per-file `coverage` its analyzer produced, because the aggregate
entries are derived from those rather than stored. An aggregate that cannot be rebuilt from what
the snapshot carries is an aggregate a fast scan gets wrong: a fact that lives only in a local
variable during a parse is a fact the next scan cannot replay. `dynamic-imports:<path>` and
`runtime-wiring:<path>` therefore record every observed load and wiring call — `complete` when the
target is statically known, `not-analyzed` when it is not.

## The run explains itself

A run that finishes in a tenth of the time has to be able to say why, or nobody can tell a working
cache from a broken scan. One `coverage` entry reports it:

```json
{
  "analyzer": "repository",
  "scope": "reused-entities",
  "status": "complete",
  "reason": "Reused 102 entities and skipped 102 of 102 parse(s). Nothing needed re-parsing."
}
```

`status` is `complete` when everything reusable was reused, `partial` when reuse was refused — the
reason then names what changed — and `not-applicable` when there was no previous snapshot to reuse.

This entry describes run provenance and stays serialized in `coverage`. New snapshots declare
`contentHashAlgo: sha256-semantic-v1`; their semantic projection excludes only repository
`reused-entities` coverage, `sourceRevision`, `sourceRevisionKind` and `generatedAt`.
Repository identity, canonical entities/relations and their evidence, effective configuration,
pipeline/analyzer versions and all meaningful coverage/limitations remain in the hash. Entities,
relations and coverage are canonically ordered for hashing. Equal trees at different revisions,
and cold/warm scans, therefore have equal semantic hashes while retaining distinct provenance.
A content, configuration, analyzer-version or meaningful coverage change invalidates identity.

Legacy `sha256-normalized-v1` snapshots retain their original verifier: remove `contentHash`,
then hash the remaining canonical JSON, including revision and reuse coverage. Readers select the
verifier by the declared algorithm and reject unsupported algorithms with a compatible-version and
explicit-regeneration diagnostic. Unlike algorithms are never equal identities. Declaration
resealing, reconciliation and documentation audit inherit the snapshot algorithm.

File/evidence hashes, workflow-run seals and revision-based workflow reuse, fix affected-file hashes,
proposal seals and approval bindings remain unchanged. Semantic equality cannot rebind approval
across revisions; registry proposal caches include the exact revision and snapshot algorithm.
Existing study artifact hash projections are unchanged.

Before explicit index regeneration migrates a legacy algorithm, the builder reads and verifies
the on-disk index being replaced and warns about legacy drift before writing. The warning concerns
that artifact; in a clean checkout it equals the committed index. CI's `gate run index-freshness`
still verifies the committed state under its stored algorithm and fails closed on drift.

## Discovery v2 acquisition

The synchronous local facade and `discoverRepositoryWithRead` share extraction
and replay code over the same scan-local inventory shape. For matching bytes,
configuration and source provenance, cold and warm outputs retain their original
reuse ledger and semantic identity. The injected path never acquires a different
revision or falls back to native TypeScript hosts. Config files outside its
partition are unsupported, and each external base URL/path/root-directory mapping
is reported explicitly; those intentional visibility limitations affect semantic
identity. Additional registered plugins and replacement source sets contribute
their effective manifests to configuration identity. The v2 transport alone does
not change built-in analyzer versions or default fact emission.

## Static fact extractor reuse

Built-in fact extractors currently declare global source/package inputs
(`inputScope: global`, also the compatibility default). Reusing facts requires
validated pipeline/analyzer/configuration identity and identical inventories and
content hashes for every scanned source module and package manifest. Under that
condition, facts are decoded from the previous snapshot codec and their component
coverage is replayed, including complete-empty and partial results. A serialized
unchanged previous snapshot requires no TypeScript parsing.

Changed global inputs trigger re-extraction. Within a live snapshot chain, a
weak snapshot-bound AST cache reuses identical source trees; source-map keys are
repository-relative while TypeScript filenames remain absolute for existing
parser accounting. A changed global input after loading a serialized snapshot
may require reacquiring all source ASTs. This is a performance limit, not a claim
of per-file independence or a reason to reuse stale results.

Prior and current Markdown resolution use the same sorted fact kind/name/owner
fingerprint, leaving the legacy fingerprint unchanged for an empty fact universe.
Changing a fact's value alone does not change citation ownership. Fact ambiguity
coverage is replayed alongside other document-scoped notes. Cold and warm entity,
relation and semantic-hash equality remain required; reuse statistics remain
provenance.

### Additional fact inputs

An extractor may declare `inputExtensions` for inputs outside the source module map.
Their scan-safe, sorted path/content inventory is hashed into one `extractor-inputs`
coverage scope (`extractor-inputs:<digest>`), with no synthetic evidence path. Additions, removals, content changes or an incomplete walk prevent
fact reuse. Existing extractor evidence file hashes also participate in the reuse
check; absent hashes conservatively prevent reuse. This applies to empty schemas as well as emitted facts; a missing prior
inventory forces extraction. Configuration extraction declares `.json` inputs,
so a JSON-only default edit cannot replay stale facts.
