# ak-docs CLI

Standalone command-line interface for doc-bridge. Published as the `ak-docs` binary from the `doc-bridge` npm package.

## Why a separate binary

| Choice | Rationale |
|--------|-----------|
| **`ak-docs`**, not `agentskit docs` | Any project can `npm install doc-bridge` without `@agentskit/cli` |
| **`ak-docs`**, not `agentskit-os docs` | OS CLI implies sidecar, runs, pipelines — wrong mental model for doc routing |
| Package name `doc-bridge` | Describes the library; `ak` prefix matches ecosystem shorthand without branding the whole tool as OS-only |

AgentsKit remains the **engine** for optional `ak-docs chat` and memory features (`intelligence.runtime: 'agentskit'`).

## Install

```bash
npm install doc-bridge
# or
pnpm add -D doc-bridge
```

```json
{
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
ak-docs mcp   # add to Cursor MCP config
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

Prefer the library when embedding in CI scripts:

```ts
import { buildIndex, query } from 'doc-bridge'

await buildIndex(config)
const handoff = await query(config, { kind: 'package', id: 'auth', agent: true })
```

CLI is a thin wrapper over the same functions.

## AKOS migration alias

AgentsKit OS may ship a **deprecated alias** during migration:

```bash
pnpm docs:internal:query …   # → ak-docs query … (same JSON)
```

`agentskit-os docs export` stays separate (runtime capability catalog, not doc-bridge handoff).

## See also

- [config-v1.md](./config-v1.md)
- [POSITIONING.md](../POSITIONING.md)