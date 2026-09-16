---
'@agentskit/doc-bridge': patch
---

Keep a committed index fresh across commits.

The retrieval projection sealed its content hash over the discovery snapshot's hash, and a
snapshot's hash covers its `sourceRevision` — the commit SHA when the working tree is clean, a
digest of the scanned files when it is not. That is right for an artifact whose job is to say what
one revision looked like, and wrong as a projection input: the projection is a function of what the
snapshot observed, not of where it observed it.

The consequence only appears in a repository that commits `.doc-bridge/index.json`, which is the
recommended setup: committing the index changes the revision that the next run hashes, so the
artifact was stale the moment it landed — landing it is a commit. `ak-docs gate run` reported
`index-freshness` failing on an index that nothing had invalidated, and no regenerate could fix it,
because the fix was itself a commit. Dogfooding on a 25-package monorepo, the gate could not be
made to pass twice in a row.

The seal is now over what the snapshot observed: the entities, the relations and the analyzer
identity that produced them, alongside the overlay and configuration hashes it already covered. The
artifact still carries `snapshotHash`, now documented as provenance rather than a seal input, so a
reader can still say which snapshot a projection came from. `RETRIEVAL_PROJECTION_VERSION` goes to
2, so no reader compares a hash across the change, and every index's content hash changes once on
the next `ak-docs index`.
