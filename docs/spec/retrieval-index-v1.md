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

Package entry titles use the observed `package.json` name, with the package
directory name as fallback when the manifest name is missing or empty. Attached
documentation titles and ownership descriptions never replace that name; they
remain document titles and package summaries respectively. Studio projects this
title as its package label; vault notes use the same discovery entity name.
Existing package IDs retain their manifest-name or path-based fallback encoding.

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

New projections inherit `contentHashAlgo: sha256-semantic-v1` from their snapshot. The seal
hashes the full projection (excluding `contentHash`) plus `projectionVersion` and
`observationHash` (the canonical entity/relation/pipeline/analyzer observation fingerprint).
This includes the algorithm, semantic `snapshotHash`, accepted `overlayHash`, configuration,
lexicon/graph versions, weights, parameters, lexical metadata and entries. Snapshot identity
includes repository identity, effective configuration, analyzer versions and meaningful coverage;
revision/time and reuse-run statistics remain outside semantic identity. The semantic repository input
fingerprint also binds pipeline/analyzer versions and effective configuration for query freshness.

Legacy `sha256-normalized-v1` projections keep the original input-only seal: projection version,
observation fingerprint, overlay/configuration hashes, lexicon/graph versions, weights and parameters.
Public-index freshness and query loaders refuse legacy identity with regeneration guidance. Unknown algorithms
fail with an actionable compatible-version/regeneration diagnostic; unlike algorithms cannot be
equal identities. Explicit regeneration migrates the index and its projection together. Old strict
readers must be upgraded before consuming the new algorithm. Entity/evidence hashes, exact
approval bindings and study artifact seals are unchanged.

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

## Exact-partition storage integration

`buildStoredDocBridgeIndex` reads document bodies through `RepositoryReadV1`
using the inventory's expected file `ContentRef` and independently checking each
snapshot document's Markdown evidence hash. Failed or mismatched reads
never supply substitute text. The operation returns `limitations` beside its
unchanged index payload, with exact `{partition: {repositoryId, revision}, path,
status, code}`. Snapshot metadata still projects when an individual body is
unavailable. A failed/incomplete listing prevents publication and carries the
listing limitation plus any individually checked document failures.

`loadStoredDocBridgeIndex` validates the exact partition envelope, existing
index schema, projection algorithm and index hash. `loadFreshStoredDocBridgeIndex`
also verifies source/configuration input fingerprints and retrieval versions
through the same reader; an unavailable input is a failure, not fresh evidence.
Legacy indexes without recorded inputs require an explicit rebuild for injected
freshness. The synchronous local freshness facade retains its legacy rebuild
path. Ranking, query scores, handoffs and BM25 preparation continue to operate on
the unchanged loaded payload; no partition metadata is inserted into entity IDs.

A caller-provided `SnapshotReadBinding` can bind source-only fingerprints to the
verified discovery capture. It matches exact partition/revision, snapshot hash,
listing policy hash and snapshot source evidence; absent or mismatched binding
retains physical verification. Consumed document/configuration/manifest/sidebar
bytes and freshness reads are always verified. Existing document/corpus/sidebar
byte ceilings remain in force even when storage capability limits are larger.


## Generic fact relation isolation

Relations carrying `metadata.factKind` retain their discovery, change-set and
finding semantics but are excluded from retrieval graph edges and canonicality.
CLI/config/signature/package fact citations cannot introduce ranked entries,
boost existing entries, or change query scores through graph signals. Legacy
symbol relations (`metadata.symbol`) still contribute their existing deduplicated
connections. The complete fact observations continue to participate in semantic
snapshot/projection identity, so equality of ranking does not transfer artifact
or revision approval. Index and handoff schema versions remain compatible.

Declared fact-extractor input extensions also enter the repository freshness
fingerprint under the effective safety exclusions and limits, for both local and
reader-backed scans. This conservatively includes safe JSON inputs, so schema
additions, removals, empty-schema edits and default-only changes invalidate an
index even when no source or Markdown file changes.

## Findings and negotiated handoff caveats

Region fixes and settled human decisions follow [region remediation v1](../spec/region-remediation-v1.md),
[FindingV1](../schemas/finding-v1.md), [RemediationV1](../schemas/remediation-v1.md) and
[DecisionV1](../schemas/decision-v1.md). CLI and MCP use region remediation contracts;
region creation/review is a deterministic library API. Enrichment retains settled Decision records
through cache replay, without converting remediation rejection into finding rejection.

`AgentHandoffV1` readers accept optional bounded `caveats` with `pendingFindings`,
`analyzed` repository/revision identities and `coverage` limitations. New writers emit
it only with explicit `includeCaveats: true` and caller-supplied validated caveats; unknown
capability defaults to the legacy field set. Default index and MCP writers never embed
caveats. New strict readers accept legacy payloads; old strict readers receive legacy
output. The public reader preserves negotiated caveats. Limitations cannot establish
semantic validation or invent an answer.

Fenced-code citation relations with `metadata.citationContext: "code-fence"`
remain available to discovery/diff, but are excluded from retrieval ranking
signals alongside generic fact citations. Existing inline relations retain their
ranking behavior.
