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

## Claude Desktop MCP Bundle

Maintainers can build the local desktop extension from a clean checkout:

```bash
pnpm install --frozen-lockfile
pnpm mcpb:pack
```

The bundle asks the user to select the repository's `doc-bridge.config.json` and uses that file's directory as the project boundary. It contains a self-contained MCP runtime rather than the optional RAG, chat, or model-provider packages. The build validates the manifest, checks the archive inventory, and exercises all eight tools from the staged runtime.

The stdio server accepts the newline-delimited JSON transport used by current MCP clients and the legacy `Content-Length` framing used by older integrations. Responses use the same framing as each request.

## Tools

| Tool | Purpose |
|------|---------|
| `handoff.resolve` | Package/ownership → AgentHandoff |
| `doc.search` | Deterministic index search |
| `doc.get` | Read an indexed agent doc |
| `gate.status` | Freshness / configured gates |
| `retriever.query` | Local retriever chunks |
| `memory.classify` / `memory.promoteDraft` | Memory pipeline |
| `registry.topology` | Static curator and delegate topology |

Every tool is annotated read-only. None of these MCP calls writes project files or publishes a memory promotion.

## Agent guidance (paste into AGENTS.md)

Before editing a package:

1. Call `handoff.resolve` with the package id  
2. Open `startHere`  
3. Stay inside `editRoots`  
4. Run `checks` before claiming done  

## Related

- [MCP for agents guide](./guides/mcp-agents.md)  
- [CLI map](./guides/cli-map.md)  
- [Memory pipeline](./guides/memory-pipeline.md)  
- [For agents](./for-agents.md)  
- [Index and query](./guides/index-and-query.md)  
- [Skill](./skills/doc-bridge.md) 
