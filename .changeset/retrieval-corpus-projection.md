---
'@agentskit/doc-bridge': minor
---

Project the repository's documents and modules into the index retrieval reads, and rank them with
field-weighted BM25.

`index.knowledge` previously held only the curated agent sidecars, while the discovery snapshot
held hundreds of documents and modules, so a query for an exported symbol or a file path had
nothing to resolve against — on the retrieval benchmark, none of the twenty exported-symbol
queries found its module and 47% of all queries returned nothing at all.

Every documentation file and source module is now an entry carrying its own content hash, its
tags, and (for a module) its exported symbols, projected from the same repository walk as the
discovery snapshot so the two cannot disagree about what exists. Ranking is field-weighted BM25
plus boosts for exact identity and multiplicative priors for query shape, over one tokenizer
shared by indexing and querying: English and Portuguese stopwords, accent folding, plural
collapsing, identifier and path expansion, and CJK bigrams. Weights and BM25 parameters are
configurable under `retrieval` and recorded in `index.retrieval`, so a retuned ranking is a
visibly different artifact.

Measured against the committed benchmark: hit@1 21.7% → 76.7%, hit@3 23.3% → 83.3%, mean
reciprocal rank 0.228 → 0.812, zero-result rate 46.7% → 5.0%, exported-symbol queries 0% → 100%.

Queries also stop rebuilding the index to check freshness. The index records an `inputs`
fingerprint of the files and configuration it was built from, so a query re-hashes the inputs
instead — `loadFreshDocBridgeIndex` on this repository went from over a second to about 170 ms. An
index written before `inputs` existed is still validated by the previous rebuild-and-compare.
