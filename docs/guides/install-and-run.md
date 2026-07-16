---
title: Install and run
description: Install Doc Bridge, run the demo, and index your repository in minutes.
---

# Install and run

Get a deterministic AgentHandoff from your own docs — no API key required for Layer 0.

## Install

```bash
pnpm add -D @agentskit/doc-bridge
# or
npm i -D @agentskit/doc-bridge
```

CLI binary: **`ak-docs`**.

## Prove it in 60 seconds (no project setup)

```bash
npx ak-docs demo --text
npx ak-docs demo --fixture monorepo --text
```

You should see handoffs, a gate red→green path, and an MCP install snippet.

## Two-minute path on your repo

```bash
cd your-repo
ak-docs init                 # config + optional demo ownership + AGENTS.md tip
ak-docs index                # build .doc-bridge/index.json
ak-docs query package example --agent
ak-docs doctor --text
ak-docs gate run
```

Expected handoff fields:

| Field | Meaning |
| --- | --- |
| `startHere` | What the agent reads first |
| `editRoots` | Where edits are allowed |
| `checks` | Commands that prove the change |
| `humanDoc` | Human guide for the same ownership |

## Minimal config

`doc-bridge.config.json`:

```json
{
  "schemaVersion": 1,
  "corpus": {
    "agent": { "root": "docs/for-agents" }
  }
}
```

**Required:** `schemaVersion: 1` and `corpus.agent.root`.

Ownership comes from (first match wins):

1. `routing.options.ownership` in config  
2. Frontmatter on agent docs (`package`, `editRoot`, `checks`)  
3. Monorepo plugin discovery (`pnpm-monorepo`)

## Dev loop

```bash
ak-docs index --watch
ak-docs list packages --text
ak-docs ask "where do I change auth?"
```

## Related

- [Index and query](./index-and-query.md) — resolve ownership deterministically  
- [Gate and CI](./gate-ci.md) — fail stale context in PRs  
- [MCP for agents](./mcp-agents.md) — wire Cursor / Claude / Codex  
- [Config reference](../spec/config-v1.md)  
- [Examples](../examples.md)  
