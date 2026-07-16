---
title: Query
description: Deterministic ownership and documentation lookup — no model, no re-scan of the repo.
---

# Query

The query layer reads `.doc-bridge/index.json` only. It does **not** re-scan the repository and does **not** call a model.

## Commands

```bash
# Machine-readable handoff (for agents / MCP)
ak-docs query package auth --agent
ak-docs query ownership auth --agent

# Human-readable
ak-docs query package auth --text

# Discovery
ak-docs list packages --text
ak-docs ask "where do I change billing?"
```

## What you get

An **AgentHandoff** (v1) with stable fields:

| Field | Use |
| --- | --- |
| `startHere` | First file the agent should open |
| `editRoots` | Allowed write paths |
| `checks` | Verification commands |
| `humanDoc` | Parallel human documentation |

Schema: [AgentHandoff v1](./schemas/agent-handoff-v1.md) · Index: [DocBridgeIndex v1](./schemas/doc-bridge-index-v1.md)

## When to use which surface

| Need | Surface |
| --- | --- |
| Agent about to edit a module | `query … --agent` or MCP `handoff.resolve` |
| Human browsing ownership | `query … --text` / `list packages` |
| Free-form question with known docs | `ask "…"` (local first) |
| Unresolved semantic question | Optional [Chat and RAG](./chat-and-rag.md) backend |

## Guarantees

- Same inputs → same handoff JSON (deterministic)  
- Breaking field meaning requires a **new schema version**, not silent reinterpretation of v1  
- Gate/CI can require a fresh index so agents never see stale ownership  

## Related

- [Guide: Index and query](./guides/index-and-query.md)  
- [For agents](./for-agents.md)  
- [CLI reference](./spec/cli.md)  
- [MCP](./mcp.md)  
