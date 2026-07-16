---
title: Documentation
description: Choose the shortest Doc Bridge path for humans, agents, or pull-request enforcement.
---

# Documentation

Doc Bridge keeps **one repository** useful to both people and coding agents. Pick the outcome you need:

| Goal | Start here |
| --- | --- |
| Try it locally in ~60s | [Getting started](./getting-started.md) |
| Route a coding agent | [For agents](./for-agents.md) · [MCP](./mcp.md) |
| Enforce freshness in PRs | [GitHub Marketplace](./MARKETPLACE.md) |
| Wire optional chat / RAG | [Chat and RAG](./chat-and-rag.md) |
| Understand product boundaries | [Positioning](./POSITIONING.md) |

## How it works

1. **Index** repository docs into a deterministic knowledge map  
2. **Resolve** exact agent handoffs (`startHere`, `editRoots`, `checks`, `humanDoc`)  
3. **Gate** drift so incomplete context never reaches the model  
4. **Promote** durable learnings from agent memory back into human docs  

```text
Repository docs  →  Deterministic index  →  Human guide
                                      ↘  Agent handoff
                                      ↘  Pull-request gate
```

## Product vs reference

- **Start / Use** — get value in minutes (getting started, agents, MCP, query)  
- **Product** — positioning, playbook pattern, recipes  
- **Reference** — schemas, CLI, config contracts  

Long-form contracts live under **Specification** and as [raw Markdown](/raw/getting-started.md) without forcing every visitor through a reference manual.

## Ecosystem

Doc Bridge is one product in AgentsKit — next to [AgentsKit](https://www.agentskit.io), [Registry](https://registry.agentskit.io), [Chat](https://chat.agentskit.io), [Playbook](https://playbook.agentskit.io), and [AKOS](https://akos.agentskit.io).
