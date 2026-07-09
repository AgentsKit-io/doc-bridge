# Changelog

## 0.1.0-alpha.2

Dogfood-driven polish after ecosystem install on agentskit, agentskit-os, playbook, and registry.

### Fixes / features
- **Package-manager-aware checks** — pnpm/yarn/npm/bun; `pnpm --filter <pkg>` in workspaces
- **Corpus ownership inference** — `packages/<id>.md`, pillars patterns, registry READMEs (toggle `routing.options.ownershipFromCorpus`)
- **Richer `guessAgentDocForPackage`** — packages/id, index.md, mdx, for-agents top-level
- **humanDoc aliases** — scoped names, common id variants
- **Fumadocs** excludes nested `for-agents/` from human corpus by default
- **plain-markdown** accepts `contentDir` (alias of `root`)
- **Gates:** preset `playbook`; docs-style profiles `playbook-okf-soft`, `title-only`; strict includes docs-style
- **Git install:** `prepare` via `scripts/prepare.mjs` builds `dist/` when missing; `prepack` builds; source included for rebuilds
- Default agent include `**/*.{md,mdx}`

## 0.1.0-alpha.1

Initial alpha — human↔agent documentation bridge.

### Layer 0 (no API key)

- Versioned Zod schemas for AgentHandoff, AgentSearch, DocBridgeIndex, config, and MemoryCandidate.
- `ak-docs init` (demo ownership by default, `--no-demo` available), `index`, `query`, `search`, `list`, `gate run`, `mcp`, `ask`.
- Ownership handoffs from **config**, **agent-doc frontmatter** (`package` + `editRoot`), or monorepo discovery.
- `--config` resolves project root from the config file directory.
- MCP: `handoff.resolve`, `doc.search`, `doc.get`, `gate.status`, memory + retriever tools.
- Human adapters: plain markdown, Fumadocs, Docusaurus; gates for freshness, human links, OKF style.
- Memory pipeline: ingest → classify → promote drafts (HITL).
- Progressive CLI help (Core / Intelligence / Advanced).

### Layer 1 (optional AgentsKit peers)

- `ak-docs rag ingest|search` via `@agentskit/rag` + `@agentskit/memory`.
- `ak-docs chat` and `ask --chat` via `@agentskit/ink` + adapters (`handoffFirst`).
- Optional peerDependencies — Layer 0 install stays lean.

### Docs / packaging

- Positioning as human↔agent bridge; public consumers: for-agents, Registry, Playbook.
- Getting started, MCP, examples, chat-and-rag guides.
- Fixed package `main`/`types` exports for publish.
