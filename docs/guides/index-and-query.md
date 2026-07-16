---
title: Index and query
description: Build a deterministic index and resolve ownership handoffs without calling a model.
---

# Index and query

Layer 0 is **offline and deterministic**. Indexing scans your corpus; querying never re-scans and never calls a model.

## Index

```bash
ak-docs index
ak-docs index --watch   # rebuild on doc changes
```

Outputs (defaults):

| Path | Role |
| --- | --- |
| `.doc-bridge/index.json` | Machine index (DocBridgeIndex v1) |
| `llms.txt` | Concise agent discovery surface |
| `.doc-bridge/capabilities.json` | Capability map for MCP / tools |

After ownership or corpus changes, **always re-index** (or gate in CI will fail).

## Query ownership

```bash
ak-docs query package <id> --agent
ak-docs query ownership <id> --agent
ak-docs query package <id> --text      # human-readable
```

`--agent` returns validated **AgentHandoff** JSON:

```json
{
  "startHere": "docs/for-agents/packages/auth.md",
  "editRoots": ["packages/auth"],
  "checks": ["pnpm test --filter auth"],
  "humanDoc": "docs/guides/auth.md"
}
```

Use this **before** an agent edits code. The model should not invent ownership from the full monorepo dump.

## Search and ask (local)

```bash
ak-docs list packages --text
ak-docs ask "where is authentication?"
```

`ask` stays on the deterministic plane when a known match exists. Only unresolved questions should escalate to optional backend/RAG (see [Chat and RAG](../chat-and-rag.md)).

## Agent workflow

```text
resolve ownership  →  read startHere  →  edit only editRoots  →  run checks
```

1. `ak-docs query ownership <module> --agent`  
2. Open `startHere` / `readBeforeEditing`  
3. Edit paths under `editRoots` only  
4. Run every command in `checks`  
5. Promote durable learnings via memory pipeline when ready  

## Related

- [Install and run](./install-and-run.md)  
- [For agents](../for-agents.md)  
- [MCP](./mcp-agents.md)  
- [AgentHandoff schema](../schemas/agent-handoff-v1.md)  
- [CLI reference](../spec/cli.md)  
