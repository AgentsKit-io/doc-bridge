# doc-bridge

**Agent-first documentation for any project** — not a wiki, not a framework doc site.

doc-bridge helps coding agents (Cursor, Claude Code, Codex, Copilot, …) **find the right file, run the right checks, and bridge agent docs to human docs** — with a deterministic layer that works **without any LLM or API key**.

[AgentsKit](https://www.agentskit.io) powers the optional intelligence layer (Retriever, Runtime, Adapters). [AgentsKit OS](https://akos.agentskit.io) is the **first production consumer**, not the only audience.

## Why not another wiki?

LangChain, LangGraph, and most frameworks ship **human browsing docs** + optional RAG chat. That optimizes reading, not **task completion**:

| Wiki + RAG | doc-bridge |
|------------|------------|
| Embed search → hope for the right chunk | Deterministic **AgentHandoff** → exact `startHere`, `editRoots`, `checks` |
| High token cost per question | Progressive disclosure: index → one target → one handoff |
| No proof docs match code | `contentHash` + CI freshness gates |
| Often vendor-hosted chat | Local CLI + MCP; any provider you choose |

Human wikis and doc sites **still exist** — Fumadocs, Docusaurus, MkDocs, Confluence, whatever you use. doc-bridge **connects** them to agent-readable knowledge; it does not replace your site.

## Who this is for

- **Any repo** with markdown knowledge and something worth owning (packages, modules, services, domains)
- **Monorepos** first — ownership routing, workspace discovery, gate lists (the sharp edge wiki+RAG misses)
- **Solo projects** — plain `docs/` + `AGENTS.md` + optional human site
- **Teams** that want one agent contract across Cursor, Claude, MCP clients, and CI

Not aimed at teaching one framework. Aimed at **making agents productive in your codebase**.

## Three artifacts (open, vendor-neutral)

Aligned with the [Agents Playbook](https://playbook.agentskit.io) (OKF + Self-Describe); doc-bridge adds routing:

| Artifact | What it carries |
|----------|-----------------|
| **OKF knowledge** | What things *mean* — markdown + frontmatter, one concept per file |
| **Self-Describe** | What the system *can do* — `llms.txt`, capability manifest |
| **AgentHandoff** | Where to *act* — start file, edit roots, checks to run, human doc link |

## Surfaces (all optional except core)

Install only what you need. **No feature requires a paid provider.**

### Core — no LLM required

| Surface | Purpose |
|---------|---------|
| **Index builder** | `DocBridgeIndex` + `contentHash` from your repo layout |
| **CLI** | `doc-bridge query`, `search`, `list` — `--agent` emits JSON handoff |
| **MCP** | `handoff.resolve`, `doc.search`, `doc.get` for IDE agents |
| **Gates** | Link rot, index freshness, human-guide validation (CI) |

### Plugins — doc sites & layouts

| Plugin | Reads |
|--------|-------|
| `pnpm-monorepo` | workspaces, packages, apps, ownership groups |
| `fumadocs` | `content/docs/**`, `meta.json` |
| `docusaurus` | `docs/**`, `sidebars.js` |
| `plain-markdown` | OKF tree + `INDEX.md` |
| `langchain-docs` | *(planned)* import existing framework doc trees |

Plugins emit resolvable `humanDoc` URLs in handoffs and keep agent ↔ human links validated.

### Optional intelligence — any provider

| Surface | Purpose | Requires LLM |
|---------|---------|--------------|
| **Chat search** | Grounded Q&A over your corpus | Yes — **your** adapter (OpenAI, Anthropic, Ollama, OpenRouter, …) |
| **Memory ingest** | Cursor / Claude / Codex memory files → normalized candidates | No for ingest; yes for classification |
| **Auto-document** | Classify memory → draft doc PRs | Yes — opt-in; HITL + gates always |

AgentsKit is the **reference runtime** for chat, classification, and Retriever — swap the adapter, keep the index.

## Architecture

```
Your repo
├── docs/for-agents/     (or .agent-docs/)   ← agent corpus (OKF)
├── docs/ or content/    ← human wiki / MDX   ← doc plugin
├── AGENTS.md            ← routing
└── doc-bridge.config.ts

        │
        ▼
┌───────────────────────────────────────┐
│  Layer 0 — Deterministic (always on)  │
│  Index · CLI · MCP · Gates            │
└───────────────────────────────────────┘
        │
        ▼ optional
┌───────────────────────────────────────┐
│  Layer 1 — Intelligence (your choice) │
│  Adapter · Retriever · Chat · Memory  │  ← AgentsKit engine
└───────────────────────────────────────┘
```

**Trust model:** Layer 0 is merge-blocking truth. Layer 1 proposes drafts; CI gates decide.

## Quick start (sketch)

```bash
npm install doc-bridge
npx doc-bridge init          # config + INDEX stub
npx doc-bridge index         # build DocBridgeIndex
npx doc-bridge query module auth --agent
```

```json
{
  "type": "agent-handoff",
  "startHere": "docs/for-agents/modules/auth.md",
  "editRoots": ["src/auth/"],
  "checks": ["npm test -- auth"],
  "humanDoc": "/docs/guides/authentication"
}
```

MCP: add `doc-bridge mcp` to Cursor / Claude Desktop — same index, no cloud.

## Profiles

| Profile | Includes |
|---------|----------|
| **minimal** | Index + CLI + MCP + gates |
| **standard** | + doc site plugin + chat search |
| **assisted** | + memory ingest + classification + draft PRs |

## AgentsKit relationship

| Role | What it means |
|------|----------------|
| **Engine** | Retriever, Tool, Runtime, Adapter contracts — implementation detail, swappable over time |
| **First consumer** | AgentsKit OS dogfoods doc-bridge at scale (76 packages, Fumadocs, gates) |
| **Not the product** | Docs, examples, and defaults speak **your project**, not AgentsKit marketing |

Ecosystem extras (Playbook patterns, Registry agents like `docs-chat` and `knowledge-promoter`) are **optional accelerators**, not requirements.

## Status

Early design. Track work in [Issues](https://github.com/AgentsKit-io/doc-bridge/issues) · Epic [#1](https://github.com/AgentsKit-io/doc-bridge/issues/1).

Reference architecture: [AgentsKit OS RFC-0056](https://github.com/AgentsKit-io/agentskit-os/blob/main/docs/rfc/0056-doc-bridge-ecosystem-dogfood.md).

## License

MIT