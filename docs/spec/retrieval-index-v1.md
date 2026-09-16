---
title: Retrieval index v1
description: The retrieval index as a projection of the snapshot, the ranking that reads it, and the handoffs derived from its graph.
---

# Retrieval index v1

The retrieval index is what search ranks. It is a projection of the discovery snapshot — a pure
function of the snapshot, the accepted enrichment overlay and the effective configuration — and it
has no scanner of its own.

That sentence closes a gap that had been in the design since the first index. `buildDocBridgeIndex`
walked the repository a second time, parsed every module and document again, and produced records
that shared nothing with the snapshot but a file path. Two views of one repository, built by two
pipelines, could disagree; the index held eleven sidecars while the snapshot held hundreds of
entities. Now an entity retrieval can find is an entity discovery observed — same id, same content
hash, same evidence — and the routes the configuration declares (intents, changes, ownership) are
projected next to them.

## The artifact

`RetrievalIndexV1` lives inside `DocBridgeIndexV1` as `projection`, so every reader of the index
receives it with the same freshness check. `knowledge[]` is still written for every reader that
predates it and now carries every projected document and module — without body text, which lives
once in the projection.

```json
{
  "type": "retrieval-index",
  "schemaVersion": 1,
  "contentHash": "…",
  "snapshotHash": "…",
  "overlayHash": "…",
  "configurationHash": "…",
  "lexiconVersion": 1,
  "graphMetricsVersion": "1.0.0",
  "weights": { "title": 4, "headings": 3, "symbols": 3, "path": 2, "aliases": 2, "summary": 2, "body": 1 },
  "params": { "k1": 1.2, "b": 0.75 },
  "lexical": { "version": 1, "documentCount": 364, "fieldNames": ["…"], "averageFieldLength": { "…": 0 } },
  "entries": [
    {
      "id": "module:src/query/search.ts",
      "kind": "module",
      "path": "src/query/search.ts",
      "title": "search.ts",
      "aliases": [],
      "symbols": ["searchIndex"],
      "tags": ["module", "ts", "query"],
      "fields": { "title": "search.ts", "headings": "", "path": "src/query/search.ts", "symbols": "searchIndex", "summary": "", "body": "", "aliases": "module ts query" },
      "graph": { "pagerank": 0, "inboundLinks": 3, "coveredBy": ["document:docs/agent-corpus/query.md"], "mentionedBy": ["…"], "areaId": "area:src/query", "packageId": "package:@agentskit/doc-bridge", "inbound": [], "outbound": [] },
      "contentHash": "…",
      "provenance": "observed",
      "confidence": "observed",
      "ownershipId": "doc-bridge-query"
    }
  ]
}
```

`contentHash` is over the inputs — snapshot hash, overlay hash, configuration hash, lexicon and
graph-metrics versions, weights and parameters — because the projection is a function: equal
inputs, equal artifact. `IndexStaleError` keeps working from the same three hashes.

Every entry carries the entity's own `contentHash`, its `provenance`, and a `confidence`. An entry
kind is one of `document`, `module`, `area`, `package`, `intent`, `change`. An ownership record
attaches to the entity at its path and lends it its id as an alias; the unit then inherits its
agent document's title, headings, summary and body, because that document is the documentation of
that unit. A record whose path matches no entity is projected as a declared `package` entry, so a
query for it still has an answer.

The postings are not stored. `fields` already is the serialised index: tokenisation is versioned
(`lexiconVersion`) and deterministic, so the postings a reader rebuilds are the postings the writer
would have stored, and `lexical` records the shape of the collection so a reader can check it
rebuilt the same one.

The one thing read from disk is the body of a document the snapshot already names — bounded by the
same text budget as before — and the read is verified against the entity's content hash. A file
that changed since the scan is projected from what the snapshot recorded about it, not from what is
on disk now.

## Ranking

`src/retrieval/rank.ts` replaces the internals of `searchIndex` and keeps its signature. The score
has named parts:

```
score = lexical × prior
      + exactId + exactPath + exactSymbol
      + graphProximity + canonicality + audienceFit + acceptedAgentSignals
```

- **lexical** — BM25 over the projected fields, with the weights above. Configurable under
  `retrieval.weights`; recorded in the artifact.
- **prior** — the query-shape heuristics, as a multiplier: a curated (agent-audience) document, an
  ownership record for a routing question, an intent or change route whose title covers the query,
  a module for a symbol- or path-shaped query. A prior can only amplify evidence that exists.
- **exactId / exactPath / exactSymbol** — the query names the thing: an alias or id, a path or
  filename, an exported symbol. Per-token identity applies to queries of at most two tokens; a
  sentence does not name a thing by containing one of its tokens.
- **graphProximity** — within two hops of one of the ten strongest lexical hits, over covers,
  mentions, links and imports. Scaled by the anchor's share of the best score, so a hub page that
  barely matched cannot lift everything it links to.
- **canonicality** — log-scaled PageRank over `links-to` and `covers`: the page other pages point
  at outranks the leaf that mentions the same thing. A tie-breaker among answers, never an answer:
  it applies only to lexical hits.
- **audienceFit** — the `--agent` prior for documentation written for an agent.
- **acceptedAgentSignals** — the overlay hook, carried at zero weight until the overlay workstream
  lands, so the code path and the explain view already exist.

A result that only a relation surfaced earns proximity and nothing else. Results below a third of
the best score are dropped; a caller assembling a neighbourhood rather than an answer passes
`floor: 0`.

**Confidence** on a result is the entry's own when the query matched it directly, and the weaker
of the entry and the surfacing relation when a relation alone surfaced it — a `fuzzy` mention makes
a `fuzzy` result. Every result carries evidence (the entity's path and content hash), provenance and
confidence.

`ak-docs search <term> --explain`, or `explain: true` over the API, attaches the matched terms and
fields and every component's contribution to each result. Explaining never changes the ranking.

```
$ ak-docs search "workflow transitions persisted" --explain --text
  [module] module:src/workflow/engine.ts score=115.27 confidence=observed
    src/workflow/engine.ts
    why: lexical=115.27
    matched: aliases: workflow | path: workflow | symbols: workflow
```

## Handoffs for any entity

`handoffForEntity(index, id, config, { root })` in `src/query/handoff.ts` answers for a package, an
area, a module or a document — by entity id, ownership id, alias or path — and replaces
`handoffForPackage`. `runQuery` and MCP `handoff.resolve` go through it.

| Field | Derived from |
| --- | --- |
| `editRoots` | the area or package itself; a module's area; a document's own path |
| `startHere` | the ownership record's agent document, then documents that `cover` the target, then those that `mention` it, then one `links-to` hop from those, then the corpus index; within each tier the more canonical page first |
| `readBeforeEditing` | the next two, plus `AGENTS.md` |
| `checks` | an ownership override, then what the index recorded when it merged frontmatter, package scripts and defaults, then the package-manager default for the unit's package |
| `related` | the strongest importing and imported areas, with the import that proves each |
| `explain` | which relation produced each field |
| `evidence` | the target's path and content hash, and the documents behind `startHere` |
| `metadata` | `entityId`, `kind`, `checksSource`, `confidence`, `areaId`, `packageId` |

`AgentHandoffV1` stays byte-compatible: `related`, `explain`, `evidence` and `metadata` are optional
additions, and `target.type` gains `area` and `document`. A handoff written before they existed is
still a valid handoff.

## The retriever

`createDocBridgeRetriever(index)` returns `RetrievedDocument[]` from `@agentskit/core` — content is
the projected title, summary and body, `metadata` carries `kind`, `path`, `evidence`, `explain` and
`confidence` — so `createHybridRetriever`, `createRerankedRetriever` and `formatRetrievedDocuments`
consume Doc Bridge with no adapter. The contract is mirrored in-repo (the core package is an optional
peer) and a test asserts assignability against the real package and runs the real hybrid retriever
over it. `retrieve('query', { limit })` still works.

## Boundaries

Nothing reachable from `search`, `query` or the projection imports anything under `src/agents`; a
test walks the imports. The deterministic layer is complete on its own, and the enrichment stage
never sits on its path.
