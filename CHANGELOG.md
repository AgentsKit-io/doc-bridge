# Changelog

## 1.1.0

### Minor Changes

- Add the stable, HITL-approved Documentation Standard v1 deterministic conformance profile, CLI command, reports, remediation, explicit approved exceptions, generated llms.txt freshness checks, and canonical ecosystem manifest/claims validation.

## 1.0.2

### Fixes

- Sync `ak-docs --version`, MCP `serverInfo.version`, and capabilities version from `package.json` during build/release.
- Allow `ak-docs query <id> --agent` as a shortcut for package/ownership handoff lookup.
- Packaged smoke now verifies installed CLI version.

## 1.0.1

### Fixes

- Hardened release validation with coverage for Layer 1 CLI, RAG/chat wrappers, MCP install, package-manager checks, watcher, markdown/glob helpers, and packaged/docsite smoke paths.
- Fixed provider API-key defaults for optional AgentsKit intelligence adapters.
- Replaced publish-time `pnpm build` hooks with `npm run build` for npm-friendly packing.

## 1.0.0

**Stable** — doctor, CI gate, MCP install, and agent skill are boring-reliable. Tier C polish ships.

### Features

- **Landing** — `docs/landing/index.html` deployed to GitHub Pages (`https://agentskit-io.github.io/doc-bridge/`)
- **Playbook pattern** — published `docs/playbook/doc-bridge-pattern.md` + `ak-docs playbook pattern [--text]`
- **Used by** — public AgentsKit surfaces cited on landing (for-agents, Registry, Playbook)

### Stable criteria met

- 60s demo path (`ak-docs demo`)
- Doctor coverage score + badges
- GitHub Action `doc-bridge-gate` + repo dogfood CI
- Cursor skill + `mcp install --cursor`
- Memory promote → draft PR, index `--watch`, Ollama smoke (optional)

### Breaking changes from alpha

- None intended for Layer 0 config/handoff schemas (still `schemaVersion: 1`)
- Pin `@v1.0.0` for GitHub Action instead of alpha tags

## 0.1.0-alpha.5

Tier B — power-user workflows and production pipeline polish.

### Features

- **`ak-docs memory promote --pr`** — draft file + `gh pr create --draft` (with `--dry-run`, `--force`)
- **`ak-docs index --watch`** — debounced rebuild on agent/human doc changes
- **`ak-docs doctor --badge`** / **`--write-badge`** — shields.io markdown + `.doc-bridge/coverage-badge.json`
- **Ollama demo** — `examples/ollama-chat.config.ts`, `docs/ollama-demo.md`, `pnpm smoke:ollama`
- **Index pipeline recipes** — pre-commit, Turborepo, CI (`docs/recipes/index-pipeline.md`)
- **`pnpm coverage:badge`** — CI-friendly badge updater script

## 0.1.0-alpha.4

Activation and agent-adoption polish — from "works" to "wow in 60s".

### Features

- **`ak-docs demo`** — bundled example/monorepo fixtures; before/after handoff, gate red→green, MCP snippet (no local config)
- **`ak-docs doctor`** — coverage score 0–100, missing agentDoc/humanDoc, gate status, next actions
- **`ak-docs mcp install --cursor | --claude`** — writes MCP server config
- **Handoff `bridge`** — `linked` / `missing` / `external` humanDoc status with bootstrap action
- **`ak-docs ask`** — handoff preview (start, edit, checks, bridge) when ownership matches
- **GitHub Action** — `action.yml` (`doc-bridge-gate`) for PR gates + doctor annotation
- **Agent skill** — `docs/skills/doc-bridge.md` for Cursor/Claude one-shot routing rules
- **Demo fixtures** — `examples/demo-example`, `examples/demo-monorepo` (auth + billing)

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
