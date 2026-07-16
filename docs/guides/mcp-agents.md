---
title: MCP for agents
description: Expose Doc Bridge handoffs to Cursor, Claude Desktop, and other MCP clients.
---

# MCP for agents

Doc Bridge MCP tools return the **same deterministic handoffs** as the CLI — ownership, start files, edit roots, and checks.

## One-command install

```bash
ak-docs mcp install --cursor    # writes .cursor/mcp.json
ak-docs mcp install --claude    # merges Claude Desktop config (macOS)
```

Then index your repo:

```bash
ak-docs index
```

Optional skill text: [skills/doc-bridge.md](../skills/doc-bridge.md)

## Manual config

```json
{
  "mcpServers": {
    "ak-docs": {
      "command": "npx",
      "args": ["ak-docs", "mcp"],
      "cwd": "/absolute/path/to/your/repo"
    }
  }
}
```

Run MCP from the **repository root** (or ensure config discovery resolves there).

## Tools

| Tool | Purpose |
| --- | --- |
| `handoff.resolve` | Package / ownership → AgentHandoff |
| Search / list tools | Discover modules and docs without dumping the tree |

Prefer `handoff.resolve` **before** any multi-file edit.

## Agent loop

1. Resolve ownership via MCP or `ak-docs query … --agent`  
2. Read `startHere`  
3. Edit only `editRoots`  
4. Run `checks`  
5. Re-index when docs change  

## Related

- [For agents](../for-agents.md)  
- [Index and query](./index-and-query.md)  
- [MCP deep dive](../mcp.md)  
- [Chat and RAG](../chat-and-rag.md) — optional intelligence plane  
