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
