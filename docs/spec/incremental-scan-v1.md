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

This entry is the one part of a snapshot that describes the *run* rather than the repository. The
entities, the relations and every other coverage entry are byte-identical to a cold scan's, which
is what the tests assert; the snapshot's own `contentHash` covers this entry too, so a warm scan
and a cold scan of the same tree hash differently. That is why the CLI does not yet pass a previous
snapshot: the artifacts it writes are compared across runs, and the caching layer has to decide
what a report keys on before a fast scan starts feeding it. `contentHash` and `sourceRevision`
semantics are otherwise untouched.
