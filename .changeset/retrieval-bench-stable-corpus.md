---
"@agentskit/doc-bridge": minor
---

Add `retrieval.benchmark.exclude`: globs left out of the corpus `ak-docs bench retrieval` and the
doctor measure, so test files no longer shift BM25 statistics and source rankings in the benchmark.
Ranking now lets a weaker lexical anchor take graph proximity from a stronger one over a
documentation edge, so a page named for the query is no longer outranked by a body-only mention
linked to the top hit.
