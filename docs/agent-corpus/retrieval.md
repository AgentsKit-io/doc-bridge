---
type: module
id: doc-bridge-retrieval
editRoot: src/retrieval
humanDoc: /docs/query
owner: doc-bridge-maintainers
lifecycle: active
sourceOfTruth: src/retrieval
validationPath: pnpm test && node bin/ak-docs.js index
docbridge:
  covers:
    - area:src/retrieval
---

# Retrieval

Owns the projection from a discovery snapshot to the sealed retrieval index, and the ranking over it.

`projectRetrievalIndex` is the only writer of `RetrievalIndexV1`. It seals over **what the snapshot
observed** — `pipelineVersion`, `analyzerVersions`, entities and relations, hashed by
`snapshotObservationHash` — and never over the revision the snapshot was taken at. `snapshotHash`
survives in the projection as provenance only; reading it as a seal input is what made a committed
index go stale the moment it landed, fixed in 1.10.1 by bumping `RETRIEVAL_PROJECTION_VERSION` to 2.

Each area and module carries `graph.coveredBy` and `graph.mentionedBy`, built from the `covers`,
`mentions` and `mentions-symbol` relations pointing into it. The doctor reads exactly those two
lists to decide whether an area is documented, so a document earns connectivity by declaring an
edge, never by sitting in the corpus.

Ranking is deterministic: `bm25.ts` builds a field-weighted BM25 index at `BM25_VERSION`, `rank.ts`
scores an entry from named components and returns a `RankExplanation` for every hit, and
`weights.ts` holds the shares those components divide. A hit below `RELEVANCE_FLOOR` is dropped
rather than returned with a low score, so the benchmark measures answers, not near-misses.
