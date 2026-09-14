---
'@agentskit/doc-bridge': minor
---

Make the retrieval index a projection of the snapshot, explain every ranking, and derive handoffs
for any entity from the graph.

`buildDocBridgeIndex` used to run a scanner of its own: it walked the repository a second time,
parsed every module and document again, and produced records that shared nothing with the
snapshot but a file path — two views of one repository, built by two pipelines, free to disagree.
The index now carries `projection`, a `RetrievalIndexV1` built by `projectRetrievalIndex` as a pure
function of the snapshot, the accepted overlay and the configuration. Every entry is a snapshot
entity (or a route the configuration declares) with the entity's own content hash, provenance and
confidence, its graph position (PageRank, covered-by, mentioned-by, area, package, edges) and the
text the lexical ranker indexes. The projection's content hash is over its three input hashes, so
`IndexStaleError` keeps working; `knowledge[]` is still written and stays in step, without body
text, which now lives once. The index has no scanner of its own; `projectRepositoryCorpus` is gone
and `repositoryInputs` remains as the freshness fingerprint.

`searchIndex` keeps its signature and gains `{ explain, agent }`. Ranking (`src/retrieval/rank.ts`)
is BM25 over `title`, `headings`, `symbols`, `path`, `aliases`, `summary` and `body`, times the
query-shape prior, plus exact-identity boosts, graph proximity (scaled by the anchor's strength),
log-scaled canonicality, the `--agent` audience prior, and a zero-weighted hook for accepted agent
signals. `ak-docs search <term> --explain` names every component's contribution and the matched
terms per field; explaining never changes the ranking. Every result carries evidence, provenance
and confidence, where confidence is the entry's own for a direct match and the weaker of the entry
and the surfacing relation when a relation alone surfaced it. Per-token identity boosts apply only
to queries of at most two tokens: a sentence does not name a thing by containing one of its tokens.
On this repository's golden suite hit@3 rises from 83.3% to 88.3%, hit@1 from 76.7% to 78.3% and
MRR from 0.812 to 0.829.

`handoffForEntity(index, id, config, { root })` replaces `handoffForPackage` and answers for a
package, an area, a module or a document, by entity id, ownership id, alias or path. `editRoots` is
the unit itself or a module's area; `startHere` is the ownership agent document, then a document
that covers the target, then one that mentions it, then one links-to hop away, most canonical
first; `readBeforeEditing` adds the next two and `AGENTS.md`; `checks` report their origin in
`metadata.checksSource`, which the index builder now records where the decision is made;
`related` lists the strongest importing and imported areas with the import that proves each;
`explain` names the relation behind every field. `AgentHandoffV1` stays byte-compatible:
`related`, `explain`, `evidence` and `metadata` are optional additions and `target.type` gains
`area` and `document`. A `covers` declaration now also resolves by an area, module or document
path.

`createDocBridgeRetriever` returns `RetrievedDocument[]` from `@agentskit/core` with
`metadata: { kind, path, evidence, explain, confidence }`, so `createHybridRetriever` and
`formatRetrievedDocuments` consume Doc Bridge with no adapter — exercised against the real
packages. The original `retrieve('query', { limit })` still works.

The default field weights change with the field set (`id`, `tags` and `description` no longer
exist as fields; `headings`, `aliases` and `summary` do), `CORPUS_PROJECTION_VERSION` becomes 2 so
an index built by older code is stale by version, and a projected index is about three times the
size of the old one on this repository, because it now carries every entry's graph edges.
