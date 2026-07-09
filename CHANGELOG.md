# Changelog

## 0.1.0-alpha.3

Dogfood round-2 fixes (search ranking, full-text body, peers, federation soft-fail).

### Fixes
- **Search ranking:** exact id / basename boost; ownership preferred for routing questions; path dedupe
- **Full-text search:** knowledge entries store `body` excerpt; descriptions prefer frontmatter `purpose` and complete sentences
- **ask:** next command prefers ownership match over knowledge-only
- **Text UX:** multi-line search/ask matches (`[type] id`, path, summary)
- **Federation:** missing/404 remote `llms.txt` soft-skipped (no hard fail)
- **Peers:** optional peer ranges widened (`@agentskit/core` `>=1.0`, adapters `>=0.12`) so Layer 0 install is not blocked
- **humanDoc:** more aliases (`packages/id`, `reference/packages/id`, path suffixes)

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
