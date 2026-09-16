<!-- doc-bridge:generated hash=3f63ca9ecd3d77c4 -->
# Area `src/query`

Query layer

Ownership record `fixture-query`; agent document `docs/for-agents/query.md`; human guide /docs/query.

## Modules

- `src/query/parse.ts`: exports `parseQuery`
- `src/query/search.ts`: exports `searchIndex`

## Documents

- [Query](docs/for-agents/query.md): covers this area
- [Mention](docs/mention.md): mentions this area

## Related areas

- `src/ranking`: imports, 1 import(s) — src/query/search.ts → src/ranking/bm25.ts

## Checks

- `pnpm test --filter query`

Source: ownership.

## Open findings

- **RELATION_UNDOCUMENTED** (warn, undocumented): Observed relation has no matching documentation declaration. — `src/query (relation:area:src/query:contains:module:src/query/search.ts)`
- **RELATION_UNDOCUMENTED** (warn, undocumented): Observed relation has no matching documentation declaration. — `src/query (relation:area:src/query:contains:module:src/query/parse.ts)`
- **RELATION_UNDOCUMENTED** (warn, undocumented): Observed relation has no matching documentation declaration. — `src/query/search.ts:1 (relation:package:fixture:contains:module:src/query/search.ts)`
- **RELATION_UNDOCUMENTED** (warn, undocumented): Observed relation has no matching documentation declaration. — `src/query/search.ts:1 (relation:module:src/query/search.ts:imports:module:src/ranking/bm25.ts)`
- **RELATION_UNDOCUMENTED** (warn, undocumented): Observed relation has no matching documentation declaration. — `src/query/parse.ts:1 (relation:package:fixture:contains:module:src/query/parse.ts)`
- **RELATION_UNDOCUMENTED** (warn, undocumented): Observed relation has no matching documentation declaration. — `src/query (relation:package:fixture:contains:area:src/query)`
<!-- /doc-bridge:generated -->
