# doc-bridge

**npm:** [`@agentskit/doc-bridge`](https://www.npmjs.com/package/@agentskit/doc-bridge) · **CLI:** `ak-docs`

**Human↔agent documentation bridge** for any project — not a wiki, not a hosted RAG chat.

doc-bridge helps coding agents **find the right file, edit the right roots, run the right checks**, keeps **agent docs linked to human docs**, and turns **agent memory into project documentation** (with human approval). The core is deterministic and works **without any LLM or API key**.

Optional intelligence (RAG + terminal chat) uses public AgentsKit packages — install only when you want them.

## Why this exists

| Pattern | Gap |
|---------|-----|
| Wiki + RAG | Explains; weak on *where to act* and proof docs match code |
| AGENTS.md alone | Great static rules; no ownership index, gates, or human bridge |
| Context7-class tools | Library docs for the model; not *your* monorepo routing |

doc-bridge ships **AgentHandoff** JSON:

```json
{
  "type": "agent-handoff",
  "startHere": "docs/for-agents/packages/example.md",
  "editRoots": ["src"],
  "checks": ["npm test"],
  "humanDoc": "/docs/guides/example"
}
```

## Four loops

| Loop | What you get |
|------|----------------|
| **Act** | CLI + MCP handoffs (`query`, `handoff.resolve`) |
| **Bridge** | Fumadocs / Docusaurus / plain-markdown ↔ agent corpus + gates |
| **Learn** | `memory ingest → classify → promote` drafts (HITL) |
| **Explain** | Optional `@agentskit/rag` + `@agentskit/ink` chat (`handoffFirst`) |

## Quick start (&lt; 2 minutes, no key)

```bash
npm i -D @agentskit/doc-bridge
npx ak-docs init
npx ak-docs index
npx ak-docs query package example --agent
```

`init` scaffolds config, a demo ownership target, and an `AGENTS.md` snippet.

```bash
npx ak-docs list packages --text
npx ak-docs ask "where do I change example?"
npx ak-docs gate run
npx ak-docs mcp
```

Full guide: **[docs/getting-started.md](docs/getting-started.md)**.

## Surfaces

### Layer 0 — always (no LLM)

| Surface | Purpose |
|---------|---------|
| **Index** | `DocBridgeIndex` + `contentHash` + `llms.txt` + capabilities |
| **CLI** | `query` / `search` / `list` / `ask` / `gate` / `memory` / `bootstrap` |
| **MCP** | `handoff.resolve`, `doc.search`, `doc.get`, … |
| **Gates** | Freshness, human-link validation, optional OKF style |
| **Plugins** | `pnpm-monorepo`, `fumadocs`, `docusaurus`, `plain-markdown` |

Ownership can come from **config**, **frontmatter** (`package` + `editRoot`), or **workspace discovery**.

### Layer 1 — optional AgentsKit peers

```bash
npm i -D @agentskit/rag @agentskit/ink @agentskit/adapters @agentskit/memory react
```

```bash
ak-docs rag ingest
ak-docs chat
ak-docs ask "how does auth work?" --chat
```

See **[docs/chat-and-rag.md](docs/chat-and-rag.md)**.

## Architecture

```
Your repo
├── docs/for-agents/     agent corpus
├── docs/ or content/    human site (plugin)
├── AGENTS.md
└── doc-bridge.config.*

Layer 0 — Index · CLI · MCP · Gates · Memory pipeline
Layer 1 — @agentskit/rag · adapters · ink chat   (opt-in)
```

**Trust model:** Layer 0 is merge-blocking truth. Layer 1 explains and drafts; humans and gates decide.

## Who uses it (public)

Designed for and dogfooded on open AgentsKit surfaces:

- [for-agents docs](https://www.agentskit.io/docs/for-agents)
- [Registry](https://registry.agentskit.io/)
- [Playbook `llms.txt`](https://playbook.agentskit.io/llms.txt)

## Configuration examples

| Profile | Example |
|---------|---------|
| Solo markdown | [`examples/minimal-plain-markdown.config.ts`](examples/minimal-plain-markdown.config.ts) |
| pnpm monorepo | [`examples/pnpm-monorepo.config.ts`](examples/pnpm-monorepo.config.ts) |
| Fumadocs + chat | [`examples/fumadocs-with-chat.config.ts`](examples/fumadocs-with-chat.config.ts) |
| Docusaurus + memory | [`examples/docusaurus-with-memory.config.ts`](examples/docusaurus-with-memory.config.ts) |

Contract: [`docs/spec/config-v1.md`](docs/spec/config-v1.md) · CLI: [`docs/spec/cli.md`](docs/spec/cli.md) · MCP: [`docs/mcp.md`](docs/mcp.md)

## Status

**v0.1.0-alpha.3** — Dogfood polish (pnpm-aware checks, corpus ownership inference, playbook gate preset, git prepare build). Layer 1 RAG/chat via optional peers.

```bash
pnpm install && pnpm build && pnpm test
```

## Contributing

- [CONTRIBUTING.md](CONTRIBUTING.md) · [SECURITY.md](SECURITY.md) · [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md) · [CHANGELOG.md](CHANGELOG.md)
- Positioning: [`docs/POSITIONING.md`](docs/POSITIONING.md)

## License

MIT
