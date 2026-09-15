---
'@agentskit/doc-bridge': minor
---

Add code areas — the unit of architecture between a package and a file — so reconciliation says
something useful about a single-package repository.

With `reconciliation.scope: "package"` and one package, every internal relation aggregated into a
self-loop the comparison skips: a thousand observed relations, zero diagnostics, and a health
score of 100 out of 100 that meant nothing. Most repositories are a single package. The ownership
configuration already named the missing unit (`path: "src/mcp"`); the graph had no entity for it.

`area:<dir>` entities are now derived from the first directory level under each package's source
roots, plus any path an ownership record names, with `contains` relations from the package, to
nested areas, and to each module. Each module belongs to exactly one area — the most specific —
so containment stays a tree and an aggregation has one answer per module. `analysis.areas.depth`
and `analysis.areas.roots` change what is derived without a code change.

`reconciliation.scope: "area"` compares at that level. On this repository it turns 0 diagnostics
into 177 `RELATION_UNDOCUMENTED` findings, each with file and line evidence.

An area that an ownership record names carries `metadata.ownershipId`, which makes two things
work that could not before. An ownership path no observed module or document lives under is now
reported as `OWNERSHIP_PATH_UNOBSERVED` with status `stale-or-unverified` — a renamed directory
was previously invisible, because the handoff still resolved. And an agent document declaring
`id` plus `editRoot` now resolves to the area it owns: that pair has always filled the ownership
map, but discovery never read it, so every such declaration became an unresolved reference.

The documentation audit measures coverage against areas when a repository has exactly one package.
It reported `Packages covered: 0/0` on this repository; it now reports `Areas covered: 9/36`, with
`metrics.coverageUnit` naming the unit and `AREA_DOCUMENTATION_MISSING` for an uncovered area.

A document naming a directory in inline code now produces a `mentions` relation to that area,
completing the part of the Markdown analyzer that was waiting for areas to exist.

`pipelineVersion` becomes `1.3.0` and the `repository` analyzer `1.2.0`. `DiscoverySnapshotV1`'s
schema version is unchanged: the new kind travels through the existing generic envelope.
