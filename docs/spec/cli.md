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
| **`ak-docs`**, not an OS subcommand | OS CLIs imply sidecar / runs / pipelines |
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
    "ak-docs": "./bin/ak-docs.js"
  }
}
```

## Commands (v1)

### Layer 0 — no API key

| Command | Description |
|---------|-------------|
| `ak-docs init` | Scaffold `doc-bridge.config.json` + agent INDEX stub |
| `ak-docs init --scaffold-workspaces` | Also create draft `docs/for-agents/packages/*.md` from discovered pnpm workspaces; never overwrites existing docs |
| `ak-docs bootstrap agent-docs` | Create draft `docs/for-agents/human/*.md` from configured human-doc adapters; never overwrites existing docs |
| `ak-docs validate-config` | Zod-validate config file |
| `ak-docs demo [--fixture example\|monorepo] [--text]` | Bundled 60s wow path: handoff, gate red→green, MCP snippet |
| `ak-docs doctor [--text] [--badge] [--write-badge]` | Coverage score, gaps, gates, shields.io badge |
| `ak-docs index` | Build `DocBridgeIndex` + optional `llms.txt` |
| `ak-docs index --watch` | Debounced rebuild on agent/human doc changes |
| `ak-docs query <target> [--agent] [--text]` | Resolve package/module/intent/change → handoff JSON or text |
| `ak-docs search <term> [--agent] [--text]` | Full-text search over index |
| `ak-docs ask <question>` | Human-readable local consult mode: search + best match + next handoff commands; no LLM |
| `ak-docs ask` | Interactive local REPL in a TTY; commands: `search <term>`, `read <id-or-path>`, `open <id-or-path>`, `resolve <id>`, `gate [id]`, `exit` |
| `ak-docs retrieve <query>` | Hybrid local/federated retriever chunks; deterministic local first |
| `ak-docs init --demo` / default | Scaffold demo ownership (`example`) + `AGENTS.md` snippet so `query --agent` works immediately |
| `ak-docs init --no-demo` | Config + empty INDEX only |
| `ak-docs memory ingest` | Normalize local memory files (`.agent-memory/**/*.md`, `.cursor/rules/*.mdc`) into `MemoryCandidate[]` |
| `ak-docs memory classify` | Deterministically route candidates to agent/human/playbook/discard |
| `ak-docs memory promote` | Build draft-only promotion body with safety scan; never auto-merges |
| `ak-docs memory promote --pr [--dry-run] [--force]` | Write draft + open GitHub draft PR via `gh` |
| `ak-docs registry topology` | Print the `doc-curator` topology for AgentsKit/Registry composition |
| `ak-docs playbook draft` | Build a draft Playbook feedback payload from local memory candidates |
| `ak-docs playbook pattern [--text]` | Export published Doc Bridge Playbook pattern (OKF markdown / JSON) |
| `ak-docs list <kind> [--text]` | List packages, apps, intents, … |
| `ak-docs gate run [index-freshness]` | Check generated index freshness |
| `ak-docs mcp` | Start MCP server (stdio default) |
| `ak-docs mcp install --cursor \| --claude` | Write MCP server config for Cursor or Claude Desktop |

### Layer 1 — optional AgentsKit peers (`intelligence.enabled`)

| Command | Description |
|---------|-------------|
| `ak-docs rag ingest` | Ingest agent corpus into `@agentskit/rag` + file vector store |
| `ak-docs rag search <query>` | Semantic search over ingested vectors |
| `ak-docs chat` | Interactive terminal chat (`@agentskit/ink` + retriever + adapter) |
| `ak-docs ask <question> --chat` | One-shot grounded answer (`handoffFirst` when possible) |

Peers: `@agentskit/rag`, `@agentskit/ink`, `@agentskit/adapters`, `@agentskit/memory`, `react`.

## Global flags

| Flag | Description |
|------|-------------|
| `--config <path>` | Config file (default: auto-discover) |
| `--json` / `--text` | Output format for non-agent commands (default: json); `--agent` always emits agent JSON |
| `--chat` | Request planned intelligence-backed ask mode; errors clearly until `intelligence.adapter` and RAG/chat support are configured |
| `--help` | Command help |

## Examples

```bash
ak-docs index
ak-docs query ownership auth --agent
ak-docs query ownership auth --text
ak-docs search "sidecar transport" --agent
ak-docs list packages --text
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

`MCP_TOOLS` exports the static tool descriptors used by `tools/list`.

## Private Dogfood Alias

```bash
pnpm docs:internal:query …   # private dogfood wrapper → ak-docs query …
```

Private repo wrappers stay private. `ak-docs` is the only public binary.

## See also

- [config-v1.md](./config-v1.md)
- [POSITIONING.md](../POSITIONING.md)
