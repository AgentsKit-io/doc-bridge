# ak-docs CLI

Command-line interface for **`@agentskit/doc-bridge`**. The npm package is scoped; the **only published binary** is `ak-docs`.

## Naming

| What | Name |
|------|------|
| npm package | `@agentskit/doc-bridge` |
| CLI binary | `ak-docs` |
| Config file | `doc-bridge.config.ts` |
| GitHub repo | `AgentsKit-io/doc-bridge` |

Install the package, run `ak-docs` — not `doc-bridge` on the shell.

## Why a separate binary

| Choice | Rationale |
|--------|-----------|
| **`ak-docs`**, not `agentskit docs` | Dedicated tool; no need for full `@agentskit/cli` |
| **`ak-docs`**, not `agentskit-os docs` | OS CLI implies sidecar / runs / pipelines |
| **`@agentskit/doc-bridge` package** | Part of AgentsKit npm scope; engine + first consumer alignment |
| **`ak-docs` bin name** | Short, memorable CLI; avoids colliding with package import path |

## Install

```bash
npm install @agentskit/doc-bridge
# or
pnpm add -D @agentskit/doc-bridge
```

```json
{
  "name": "@agentskit/doc-bridge",
  "bin": {
    "ak-docs": "./dist/bin/ak-docs.js"
  }
}
```

## Commands (v1)

### Layer 0 — no API key

| Command | Description |
|---------|-------------|
| `ak-docs init` | Scaffold `doc-bridge.config.ts` + agent INDEX stub |
| `ak-docs validate-config` | Zod-validate config file |
| `ak-docs index` | Build `DocBridgeIndex` + optional `llms.txt` |
| `ak-docs query <target> [--agent]` | Resolve package/module/intent/change → handoff JSON |
| `ak-docs search <term> [--agent]` | Full-text search over index |
| `ak-docs list <kind>` | List packages, apps, intents, … |
| `ak-docs gate run [id]` | Run configured CI gates |
| `ak-docs mcp` | Start MCP server (stdio default) |

### Layer 2 — optional (`intelligence.enabled`)

| Command | Description |
|---------|-------------|
| `ak-docs chat [question]` | Grounded Q&A; `handoffFirst` before RAG |
| `ak-docs memory ingest` | Run memory adapters → `MemoryCandidate[]` |
| `ak-docs memory classify` | Route candidates to doc targets (draft only) |

## Global flags

| Flag | Description |
|------|-------------|
| `--config <path>` | Config file (default: auto-discover) |
| `--json` / `--text` | Output format (default: json) |
| `--help` | Command help |

## Examples

```bash
ak-docs index
ak-docs query ownership auth --agent
ak-docs search "sidecar transport" --agent
ak-docs gate run
ak-docs mcp
```

## MCP server config (Cursor)

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

## Programmatic API

```ts
import { buildIndex, query, defineConfig } from '@agentskit/doc-bridge'

export default defineConfig({ schemaVersion: 1, corpus: { agent: { root: 'docs' } } })
```

CLI is a thin wrapper over the same exports.

## AKOS migration alias

```bash
pnpm docs:internal:query …   # deprecated → ak-docs query …
```

`agentskit-os docs export` stays separate (runtime capability catalog).

## See also

- [config-v1.md](./config-v1.md)
- [POSITIONING.md](../POSITIONING.md)