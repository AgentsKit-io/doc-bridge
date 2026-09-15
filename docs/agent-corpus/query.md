---
type: module
id: doc-bridge-query
editRoot: src/query
humanDoc: /docs/query
---

# Query

Owns deterministic package and document resolution. Prefer an explicit miss over an invented answer.

Ranking (`src/retrieval/rank.ts`) reads the retrieval projection (`src/retrieval/project.ts`),
which is a function of the snapshot: never add a scanner to the query path, and never import
anything under `src/agents` from it. The score is field-weighted BM25 times a prior, plus absolute
boosts for exact identity, plus graph proximity and canonicality; every component is reported by
`--explain`, and explaining must never change the ranking. Keep the split: a prior must never be
able to rank a record that matched nothing, an exact id, path or exported symbol must win over
prose that mentions it, and a result only a relation surfaced earns proximity and nothing else. One
tokenizer (`searchTokens`) serves both indexing and querying — never tokenize one side differently.
Changing the stopword lists, folding, or token expansion means bumping `SEARCH_LEXICON_VERSION`,
because the index records it and the artifact hash depends on it.

Handoffs (`src/query/handoff.ts`) are derived from the projection's graph for any entity — package,
area, module, document — and every field says which relation produced it. `checks` must report
their origin in `metadata.checksSource`; `startHere` prefers a document that covers the target over
one that mentions it.

Re-run `pnpm bench:retrieval` after any ranking change; a hit@3 regression is a blocked change,
not a judgement call.

Accepted agent signals (`agentSignal` on an entry) are a share of `ACCEPTED_SIGNALS_WEIGHT`, which
is 15% of the exact-id boost and must stay there: a signal may reorder near-ties among lexical hits
and must never outrank an exact identifier, path or symbol match. Without an overlay the ranking is
byte-identical to the ranking before enrichment existed, and the bench baseline must not move.

`ak-docs bench retrieval <suite> --overlay` answers whether the accepted overlay earns its cost:
the same suite over the same snapshot, once with the overlay projected and once without. It needs
no index on disk, and it exits non-zero when hit@3 falls. Adding an overlay-consuming ranking
signal means re-running it, not only `pnpm bench:retrieval`.
