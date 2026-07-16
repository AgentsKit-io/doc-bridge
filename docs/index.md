---
title: Documentation
description: Practical Doc Bridge paths for humans, agents, PR gates, and MCP — one repository, two audiences.
---

# Documentation

Doc Bridge keeps **one repository** useful to people and coding agents. Pick the shortest path:

## Start

| Goal | Page |
| --- | --- |
| Install + 60s proof | [Getting started](./getting-started.md) |
| Guided install | [Install and run](./guides/install-and-run.md) |
| Machine-first entry | [For agents](./for-agents.md) · site route `/for-agents` |
| PR freshness gate | [Gate and CI](./guides/gate-ci.md) · [Marketplace](./MARKETPLACE.md) |

## Build workflows

| Goal | Page |
| --- | --- |
| Index + resolve ownership | [Index and query](./guides/index-and-query.md) · [Query](./query.md) |
| MCP for Cursor / Claude | [MCP for agents](./guides/mcp-agents.md) · [MCP](./mcp.md) |
| Config sketches | [Examples](./examples.md) |
| Optional chat / RAG | [Chat and RAG](./chat-and-rag.md) · [Ollama demo](./ollama-demo.md) |

## How it works

```text
Repository docs
      │
      ▼
ak-docs index  ──►  .doc-bridge/index.json + llms.txt
      │
      ├─► Human guides (Fumadocs / Docusaurus / md)
      ├─► Agent handoff (CLI / MCP)
      └─► PR gate (Marketplace Action)
```

1. **Index** — map ownership from corpus + config  
2. **Resolve** — deterministic handoffs (`startHere`, `editRoots`, `checks`)  
3. **Gate** — fail stale context before agents run  
4. **Promote** — optional memory → draft docs loop  

## Product vs reference

- **Start / Guides** — get value in minutes  
- **Product** — [Positioning](./POSITIONING.md), [Playbook pattern](./playbook/doc-bridge-pattern.md), [Recipes](./recipes/index-pipeline.md)  
- **Reference** — [CLI](./spec/cli.md), [Config](./spec/config-v1.md), [Schemas](./schemas/agent-handoff-v1.md)  

Machine surfaces: [llms.txt](/llms.txt) · [llms-full.txt](/llms-full.txt) · [raw Markdown](/raw/getting-started.md)

## Ecosystem

Part of AgentsKit — next to [AgentsKit](https://www.agentskit.io), [Registry](https://registry.agentskit.io), [Chat](https://chat.agentskit.io), [Playbook](https://playbook.agentskit.io), and [AKOS](https://akos.agentskit.io).
