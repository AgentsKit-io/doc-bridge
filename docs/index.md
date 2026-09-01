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
| Memory digest → draft docs | [Memory pipeline](./guides/memory-pipeline.md) |
| Every CLI command | [CLI map](./guides/cli-map.md) · [CLI reference](./spec/cli.md) |
| Config sketches | [Examples](./examples.md) |
| Optional chat / RAG | [Chat and RAG](./chat-and-rag.md) · [Ollama demo](./ollama-demo.md) |
| Study and measurement | [Study overview and anonymized data](./study/README.md) · [Study protocol v1](./spec/study-protocol-v1.md) |
| Controlled task suite | [Study task suite v1](./spec/study-task-suite-v1.md) |
| Controlled study runner | [Study runner v1](./spec/study-runner-v1.md) |
| Provider CLI adapter | [Study provider CLI v1](./spec/study-provider-cli-v1.md) |
| Round 1 instrumentation | [Instrumentation plan v1](./study/round-1-instrumentation-plan-v1.md) · [adjudicated smoke ledger](./study/round-1-adjudicated-smoke-v1.json) |
| Longitudinal measurements | [Study metrics v1](./spec/study-metrics-v1.md) |
| Study verification | [Study verification v1](./spec/study-verification-v1.md) |
| A/B baseline result | [A/B baseline result 2026-08-31](./study/ab-baseline-result-v1.json) · [analysis](./study/ab-baseline-analysis-v1.md) |
| Documentation quality audit | [Documentation audit v1](./spec/documentation-audit-v1.md) |
| Current documentation audit snapshot | [Audit round 2026-08-31](./study/documentation-audit-round-2026-08-31.json) |
| Controlled pilot evidence | [Pilot round 2026-08-31](./study/pilot-round-2026-08-31.json) |

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

Part of AgentsKit — next to [AgentsKit](https://www.agentskit.io), [Registry](https://registry.agentskit.io), [Chat](https://chat.agentskit.io), and [Playbook](https://playbook.agentskit.io).
