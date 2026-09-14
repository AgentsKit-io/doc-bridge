---
type: module
id: doc-bridge-query
editRoot: src/query
humanDoc: /docs/query
---

# Query

Owns deterministic package and document resolution. Prefer an explicit miss over an invented answer.

Ranking is field-weighted BM25 (`src/retrieval/bm25.ts`) plus absolute boosts for exact identity
and multiplicative priors for query shape. Keep the split: a prior must never be able to rank a
record that matched nothing, and an exact id, path or exported symbol must win over prose that
mentions it. One tokenizer (`searchTokens`) serves both indexing and querying — never tokenize
one side differently. Changing the stopword lists, folding, or token expansion means bumping
`SEARCH_LEXICON_VERSION`, because the index records it and the artifact hash depends on it.

Re-run `pnpm bench:retrieval` after any ranking change; a hit@3 regression is a blocked change,
not a judgement call.
