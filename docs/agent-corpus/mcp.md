---
type: module
id: doc-bridge-mcp
editRoot: src/mcp
humanDoc: /docs/mcp
---

# MCP

Owns the stdio server and public tool contracts. Preserve runtime validation and stable response shapes.

`docbridge.proposals` carries enrichment review as `enrich-list`, `enrich-approve` and
`enrich-reject`; a decision goes through `decideEnrichment` and the shared approval gate, never
through a direct overlay edit.
