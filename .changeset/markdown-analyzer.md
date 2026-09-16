---
'@agentskit/doc-bridge': minor
---

Read documentation with a real Markdown parser, and turn its prose into evidence-backed graph
edges.

Documentation used to be read with regular expressions: frontmatter by one, the `docbridge` block
by a hand-written YAML subset, and the prose not at all. Headings, links and inline code were
discarded — so on this repository, where 23 documents link to other documents and 14 cite source
paths, none of it produced a single edge.

A new `markdown` analyzer parses documents with remark (CommonMark plus GFM) and emits `observed`
relations with the file and line each claim was made on: `links-to` between documents,
`mentions` from a document to a module or package, and `mentions-symbol` from an inline code token
to the module that exports it. On this repository that is 154 `links-to`, 93 `mentions` and 50
`mentions-symbol` where there were none, and 55 of 104 documents now have an outgoing edge.

A symbol resolves to the module that declares it rather than a barrel that re-exports it, and a
name declared by two modules resolves to neither — the reference and its lines are reported as a
coverage note, because sending an agent to one of two possible definitions is worse than sending
it nowhere. Unresolved path-shaped references are matched with Jaro-Winkler and accepted only at
0.92 or above with a single candidate, recorded as `confidence: 'fuzzy'`. Mentions inside a
`<!-- doc-bridge:generated -->` region are ignored, so Doc Bridge never reads its own output back
in as evidence. A document referencing more than 64 entities records `evidenceTruncated`.

Document entities now carry `title`, headings to depth three with their lines, a bounded
`summary`, `wordCount`, the frontmatter subset (`type`, `audience`, `owner`, `lifecycle`, `tier`),
any generated regions, and the file's content hash on its evidence. A document declaring
`audience` overrides the path heuristic that classifies it.

The `docbridge` block is now real YAML validated by a schema, so quoted lists, flow mappings,
anchors and multi-line strings work as they do everywhere else, and a schema violation names the
field. Every `DOCBRIDGE_*` diagnostic code is preserved, and a block YAML cannot read at all falls
back to the previous line-oriented scanner, which reports per line.

`pipelineVersion` becomes `1.2.0` and `analyzerVersions` gains `markdown`. The
`DiscoverySnapshotV1` envelope is unchanged.

Entity identity is consolidated into one module: `entityId` and `relationId` in
`src/discovery/identity.ts`, shared by the discovery analyzers and the retrieval projection, which
had grown a second copy. `projectedEntityId` (added in the unreleased corpus projection and never
published) is gone in favour of `entityId`.
