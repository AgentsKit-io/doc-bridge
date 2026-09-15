---
type: module
id: doc-bridge-mcp
editRoot: src/mcp
humanDoc: /docs/mcp
owner: doc-bridge-maintainers
lifecycle: active
sourceOfTruth: src/mcp
validationPath: pnpm test && pnpm typecheck && pnpm smoke:packaged
---

# MCP

Owns the stdio server and public tool contracts. Preserve runtime validation and stable response shapes.

`knowledge.search` and `knowledge.lookup` (`src/mcp/knowledge.ts`) read the same projection and
rank with the same `searchIndex` as the CLI; a test compares the two. A `budgetTokens` drops
sections only in the declared order — evidence excerpts, related, neighbours, summaries — and
never the entity, the evidence paths and hashes, the handoff fields or the diagnostics; a payload
that cannot fit says `fits: false`. Existing tool names, arguments and payloads do not change.
`docbridge.proposals` carries enrichment review as `enrich-list`, `enrich-approve` and
`enrich-reject`; a decision goes through `decideEnrichment` and the shared approval gate, never
through a direct overlay edit.
