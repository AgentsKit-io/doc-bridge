# Getting started

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
ak-docs memory promote   # draft only — never auto-merges
```

Sources include `.agent-memory/**` and `.cursor/rules/*.mdc`.

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
