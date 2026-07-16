---
title: Getting started
description: Install, index, query, and gate repository documentation in about 60 seconds.
---

# Getting started

doc-bridge turns your existing docs into an **AgentHandoff** index:

- `startHere` — what the agent reads first
- `editRoots` — where the agent is allowed to work
- `checks` — what proves the edit
- `humanDoc` — the human-facing guide for the same area

It also runs the inverse loop: local agent memory becomes a classified,
reviewable documentation draft. Start with CLI. Add MCP when agents should call
it automatically. Add CI when the bridge becomes part of review.

## Install

```bash
npm i -D @agentskit/doc-bridge
# or
pnpm add -D @agentskit/doc-bridge
```

CLI binary: **`ak-docs`**.

## 60-second demo (zero setup)

```bash
npx ak-docs demo --text
npx ak-docs demo --fixture monorepo --text   # auth + billing monorepo
```

Prints before/after, a real handoff, gate red→green, and the MCP snippet.

## Two-minute path (no API key)

```bash
ak-docs init          # config + demo ownership + AGENTS.md snippet
ak-docs index
ak-docs query package example --agent
ak-docs doctor --text
ak-docs doctor --badge
ak-docs mcp install --cursor
ak-docs index --watch          # optional — dev loop
```

You should see an **AgentHandoff** with `startHere`, `editRoots`, `checks`, and optional `bridge`.

Useful follow-ups:

```bash
ak-docs list packages --text
ak-docs ask "where do I change example?"
ak-docs gate run
ak-docs mcp
```

`init --no-demo` skips the starter module if you want an empty corpus.

## Configuration

Default: `doc-bridge.config.json` (also `.ts` / `.js` / `package.json#docBridge`).

**Required:** `schemaVersion: 1` + `corpus.agent.root`.

Ownership (any one of these):

1. `routing.options.ownership`
2. Frontmatter on agent docs: `package` + `editRoot`
3. Monorepo plugin (`pnpm-monorepo` + workspace discovery)

Project root for `--config path/to/doc-bridge.config.json` is the **directory of that file**.

See [config-v1](./spec/config-v1.md) and [examples](./examples.md).

## Use surfaces

| Surface | When to use | Command |
|---------|-------------|---------|
| CLI | You want to inspect or debug the bridge yourself | `ak-docs query package <id> --agent` |
| MCP | You want coding agents to resolve handoffs before editing | `ak-docs mcp install --cursor` |
| CI | You want stale indexes and broken links to fail PRs | `ak-docs index && ak-docs gate run` |
| Adapters | You already have Fumadocs, Docusaurus, or markdown docs | configure `corpus.human` |
| Memory pipeline | You want agent notes turned into reviewable docs | `ak-docs memory promote --pr --dry-run` |
| Optional RAG/chat | You want a terminal assistant grounded in the same index | `ak-docs rag ingest && ak-docs chat` |

## MCP (Cursor / Claude)

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

Tools: `handoff.resolve`, `doc.search`, `doc.get`, `gate.status`, …

## Human ↔ agent bridge

```bash
# After configuring corpus.human (fumadocs | docusaurus | plain-markdown)
ak-docs index
ak-docs query package <id> --agent   # includes humanDoc when linked
ak-docs gate run human-guide-links
ak-docs bootstrap agent-docs         # draft agent docs from human site
```

## Memory → project docs

```bash
ak-docs memory ingest
ak-docs memory classify
ak-docs memory promote              # prints a safe draft body
ak-docs memory promote --pr --dry-run
ak-docs memory promote --pr         # opens a GitHub draft PR via gh
```

Sources include `.agent-memory/**` and `.cursor/rules/*.mdc`. Promotion is
draft-only and never auto-merges.

## Optional chat + RAG (AgentsKit)

```bash
npm i -D @agentskit/rag @agentskit/ink @agentskit/adapters @agentskit/memory react
```

Enable in config:

```json
{
  "intelligence": {
    "enabled": true,
    "adapter": { "provider": "ollama", "model": "llama3.2" },
    "chat": { "enabled": true, "handoffFirst": true, "sources": ["agent", "human"] }
  }
}
```

```bash
ak-docs index
ak-docs rag ingest
ak-docs rag search "authentication boundaries"
ak-docs chat
ak-docs ask "how does auth work?" --chat
```

Details: [chat-and-rag.md](./chat-and-rag.md).

## Related

- [Install and run](./guides/install-and-run.md) — guided path with tables  
- [Index and query](./guides/index-and-query.md) — ownership resolve loop  
- [Gate and CI](./guides/gate-ci.md) · [Marketplace](./MARKETPLACE.md)  
- [MCP for agents](./guides/mcp-agents.md) · [For agents](./for-agents.md)  
- [CLI reference](./spec/cli.md) · [Config](./spec/config-v1.md)  
- [Positioning](./POSITIONING.md)
