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

Run from the repo root (or pass config discovery that resolves to it). Run `ak-docs index` before starting MCP in a fresh checkout and after doc changes.
In this repository the index is generated locally and ignored, never committed.

## Claude Desktop MCP Bundle

Maintainers can build the local desktop extension from a clean checkout:

```bash
pnpm install --frozen-lockfile
pnpm mcpb:pack
```

The bundle asks the user to select the repository's `doc-bridge.config.json` and uses that file's directory as the project boundary. It contains a self-contained MCP runtime rather than the optional RAG, chat, or model-provider packages. The build validates the manifest, checks the archive inventory, and exercises eleven read-only tools from the staged runtime.

The stdio server accepts the newline-delimited JSON transport used by current MCP clients and the legacy `Content-Length` framing used by older integrations. Responses use the same framing as each request.

## Tools

| Tool | Purpose |
|------|---------|
| `handoff.resolve` | Package/ownership → AgentHandoff |
| `doc.search` | Deterministic index search; set `agent: true` with `mode` and `contextBudgetTokens` for bounded agent context |
| `doc.get` | Read an indexed agent doc |
| `gate.status` | Freshness / configured gates |
| `retriever.query` | Local retriever chunks |
| `memory.classify` / `memory.promoteDraft` | Memory pipeline |
| `registry.topology` | Static curator and delegate topology |
| `knowledge.search` | Ranked entries for a query, by kind, explained, within a `budgetTokens` |
| `knowledge.decision` / `knowledge.concept` / `knowledge.whyChanged` | Exact target/name/alias rationale with indexed evidence, budgets and explicit history coverage |
| `knowledge.lookup` | One entity with neighbours, documents, handoff, open diagnostics and evidence, within a `budgetTokens` |
| `docbridge.diagnostics { format: 'finding' }` | Diagnostics as ecosystem `Finding`s |
| `docbridge.proposals` | Prepare/revalidate region remediations from a base snapshot and allowed roots; human approval/application use the local CLI |

Budgets, the drop order and the lookup shape are specified in [MCP knowledge tools v1](./spec/mcp-knowledge-tools-v1.md).

The rationale tools are read-only; [knowledge query v1](./spec/knowledge-query-v1.md) defines their contract and enablement guidance.
Retrieval tools are annotated read-only and never publish a memory promotion.
`docbridge.proposals` may save review artifacts and retains separate enrichment
actions, but cannot approve or apply region remediations to documentation. See the
[2.0 migration guide](./migration/1.x-to-2.0.md) for the human boundary.

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

Rationale tools include bounded indexed `memory-supports` relations with exact
`id`, `alias`, or `path` evidence in JSON and text, following
[knowledge query v1](spec/knowledge-query-v1.md). Relations only target returned entities, including under service restrictions.
