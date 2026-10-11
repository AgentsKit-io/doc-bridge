---
"@agentskit/doc-bridge": patch
---

Agent search (`ak-docs search --agent` and MCP `doc.search` with `agent: true`) no longer fails when the caller declares no budget. The default budget rises from 32 to 128 tokens, and an oversized default result is returned as its minimum grounded form (one match with type, id and path, no summary, no next commands) marked `truncated`. A declared `contextBudgetTokens` / `--context-budget` that cannot fit one grounded match still fails closed.
