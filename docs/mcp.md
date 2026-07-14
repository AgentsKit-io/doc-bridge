---
title: MCP setup
description: Connect Doc Bridge deterministic handoffs to MCP-compatible coding agents.
---

# MCP setup

## One command (recommended)

```bash
ak-docs mcp install --cursor    # writes .cursor/mcp.json in repo root
ak-docs mcp install --claude    # merges into Claude Desktop config (macOS)
```

Then add the agent skill: [skills/doc-bridge.md](./skills/doc-bridge.md)

## Manual — Cursor / Claude Desktop / Codex-style

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

Or with a global/local bin:

```json
{
  "mcpServers": {
    "ak-docs": {
      "command": "ak-docs",
      "args": ["mcp"]
    }
  }
}
```

Run from the repo root (or pass config discovery that resolves to it). Always `ak-docs index` after doc changes (or gate in CI).

## Tools

| Tool | Purpose |
|------|---------|
| `handoff.resolve` | Package/ownership → AgentHandoff |
| `doc.search` | Deterministic index search |
| `doc.get` | Read an indexed agent doc |
| `gate.status` | Freshness / configured gates |
| `retriever.query` | Local retriever chunks |
| `memory.classify` / `memory.promoteDraft` | Memory pipeline |

## Agent guidance (paste into AGENTS.md)

Before editing a package:

1. Call `handoff.resolve` with the package id  
2. Open `startHere`  
3. Stay inside `editRoots`  
4. Run `checks` before claiming done  
