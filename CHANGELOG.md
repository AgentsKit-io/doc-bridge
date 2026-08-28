# Changelog

## 1.7.44

- Precompute module-to-package ownership during package-scope reconciliation to reduce repeated entity scans on large repositories.

## 1.7.43

- Add deterministic reconciliation rollups by diagnostic code and status for agent and dashboard consumption.

## 1.7.42

- Correct package documentation health classification when aggregated relations are undocumented.
- Add regression coverage so package-level reports cannot mark affected packages as fresh.

## 1.7.41

- Add configurable anonymized HTML report output that preserves topology and metrics without project-specific identity or evidence content.

## 1.7.40

- Clarify that `ak-verify` is portable while verification contracts remain project-local.
- Require a project verification contract before implementation under the global agent policy.

## 1.7.39

- Avoid recompiling the conventional agent-package path matcher for every document during reconciliation.

## 1.7.38

- Count conventional agent documents under `packages/` and `apps/` as package coverage even when they do not declare a `humanDoc` bridge.
- Preserve configurable agent roots and keep human-document linking as a separate concern.

## 1.7.37

- Keep package-frontmatter reconciliation linear in document size and avoid unnecessary package scans for direct entity references.

## 1.7.36

- Link package documentation that follows the existing `apps|packages` path convention when it declares a human documentation route.

## 1.7.35

- Reconcile existing package frontmatter (`type`, `package`, and `humanDoc`) as safe package coverage without requiring duplicate Doc Bridge declarations.

## 1.7.34

- Resolve constant-bound dynamic import and require specifiers while keeping computed and ambiguous bindings explicitly unresolved.

## 1.7.33

- Anchor dense architecture maps to the viewport so wide graph snapshots do not render as an empty centered strip.

## 1.7.32

- Balance dense graph nodes into a readable grid instead of compressing deep hierarchies into a narrow vertical strip.

## 1.7.31

- Preserve readable dense-map sizing across responsive breakpoint overrides.

## 1.7.30

- Keep dense architecture maps readable with prioritized edge rendering, explicit total-versus-visible counts, and horizontal map exploration.

## 1.7.29

- Add enterprise verification profiles with legal state transitions, content-addressed evidence, resumable workflow artifacts, and audited baseline replacement.
- Add explicit JS/TS coverage boundaries, versioned analyzer plugins, benchmark metrics, and bounded AgentsKit Registry proposals.
- Improve documentation/code reconciliation with document classification, package documentation status, and orphan-document findings.

## 1.7.28

- Keep the initial large-report payload limited to package topology while preserving compact evidence indexes for insights and risk lenses.
- Preserve module counts and relation finding health in the overview without loading module/file detail chunks.

## 1.7.27

### Patch Changes

- Exclude test and spec modules from runtime-wiring coverage by default, with an explicit opt-in for test architecture.

## 1.7.26

### Patch Changes

- Report unresolved runtime wiring only when a call contains a potential target, avoiding inline-registration and no-argument false positives.

## 1.7.25

### Patch Changes

- Remove generic `bind` and `listen` calls from default runtime-wiring detection while keeping them configurable.

## 1.7.24

### Patch Changes

- Warm the browser runtime before visual timing so cold Chromium startup does not masquerade as report latency.

## 1.7.23

### Patch Changes

- Clarify runtime-wiring coverage so resolved static targets and unresolved indirect wiring are not conflated.

## 1.7.22

### Patch Changes

- Resolve configurable runtime-wiring calls when their arguments are statically imported, while preserving unresolved calls as explicit coverage gaps.

## 1.7.21

### Patch Changes

- Preserve explicit detection metadata for literal dynamic imports and advance the JS/TS analyzer version.

## 1.7.20

### Patch Changes

- Resolve literal dynamic imports as repository relations and distinguish them from unresolved non-literal loading.

## 1.7.19

### Patch Changes

- Keep the directory report index small by describing only the findings chunk; level and detail chunks remain addressable from the overview metadata.

## 1.7.18

### Patch Changes

- Encode package chunk names as an ordered list to keep the initial report metadata compact.

## 1.7.17

### Patch Changes

- Measure double-click application response from a window-capture listener that cannot be stopped by the report event handler.

## 1.7.16

### Patch Changes

- Derive evidence chunk names from existing package level metadata and compact graph payloads further.

## 1.7.15

### Patch Changes

- Keep module and file navigation within the selected package scope after package-level hydration.

## 1.7.14

### Patch Changes

- Resolve selected package chunks before their parent group chunks during report navigation.

## 1.7.13

### Patch Changes

- Defer report evidence payloads until a graph node is selected, keeping topology navigation compact.

## 1.7.12

### Patch Changes

- Keep application/group report chunks at package level and load module/file data only for the selected package.

## 1.7.11

### Patch Changes

- Split large report level data into on-demand group and package chunks to reduce initial navigation cost.

## 1.7.10

### Patch Changes

- Remove the hidden findings DOM while navigating the architecture lens to avoid unnecessary layout work.

## 1.7.9

### Patch Changes

- Record report render phase timings in visual evidence for actionable performance diagnosis.

## 1.7.8

### Patch Changes

- Cache the graph model for the active report navigation state and invalidate it after lazy data hydration.

## 1.7.7

### Patch Changes

- Avoid recalculating hidden findings and insight dashboards during architecture navigation.

## 1.7.6

### Patch Changes

- Persist browser interaction timing markers in the report DOM so visual evidence is isolated from test-runner state.

## 1.7.5

### Patch Changes

- Distinguish real browser gesture duration from application interaction response in visual evidence.

## 1.7.4

### Patch Changes

- Avoid duplicate architecture drill-down renders when a native double-click is received.

## 1.7.3

### Patch Changes

- Measure report render and interaction latency with a high-resolution clock.

## 1.7.2

### Patch Changes

- Harden verification outcomes and add measurable report interaction timings.

## 1.7.1

### Patch Changes

- Keep verification outcomes consistent when human approval completes a run.

## 1.7.0

### Minor Changes

- Add configurable package/module reconciliation scopes while preserving raw file-level evidence for architecture exploration.
- Require verification contracts to declare intent and map every outcome to executable checks.

## 1.6.4

### Patch Changes

- Make report visual verification work with standalone reports, lazy-loaded findings, and repositories whose architecture starts at a domain or group rather than an app.

## 1.6.3

### Patch Changes

- Add configurable relation-coverage policy, invalidate workflow artifacts when analyzer logic changes, improve offline report readability on small screens, and ship the visual verification script used by the report command.

## 1.6.2

### Patch Changes

- Keep the architecture overview legible by mapping project packages first, using a scrollable deterministic canvas, and revealing external dependencies in package drill-down views.

## 1.6.1

### Patch Changes

- Index report findings by entity and relation before rendering the offline graph, keeping large reports responsive during initial load and level changes.

## 1.6.0

### Minor Changes

- Replace the offline HTML report with a progressive, read-only architecture viewer. The report now includes grouped SVG topology by level, documentation drift, risk/hotspot, and evidence lenses, deterministic heuristic signals, selected-entity evidence details, Jest-like diagnostics, and explicit analyzer coverage boundaries.

## 1.5.2

### Patch Changes

- Exclude Turbo cache files from repository discovery by default.

## 1.5.1

### Patch Changes

- Honor configured repository file limits and ignore non-package workspace directories during discovery.

## 1.5.0

### Minor Changes

- Add the canonical knowledge-engine workflow, architecture map, configurable MCP surfaces, and human-gated Registry agent proposals.

## 1.4.3

### Patch Changes

- Keep the release audit green by pinning the available `nanoid` fix and documenting
  the upstream `extract-zip` advisory exception until its patched npm release exists.

## 1.4.2

### Patch Changes

- df61b17: Accept managed ecosystem products without a public repository by supporting `repo: null` and declaration-backed claims in the canonical ecosystem contract.

## 1.4.1

### Patch Changes

- ef543f6: Publish the portable handoff skill through an Agent Plugins v1 manifest for GitHub Copilot.
- 8b07f46: Package the portable handoff skill and credential-free MCP server as a Claude Code plugin.

## 1.4.0

### Minor Changes

- 14a9075: Add a portable, fail-closed Doc Bridge handoff skill with a zero-credential resolver and synthetic compatibility fixture for Agent Skills runtimes.

### Patch Changes

- 5133bda: Expose the portable Doc Bridge handoff skill as a discoverable Pi package.
- 14a9075: Add a Cursor plugin manifest, pinned MCP configuration, and handoff skill.

## 1.3.0

### Minor Changes

- 319605e: Add read-only Nx project inference for Doc Bridge ownership, handoffs, and available test and lint checks.
- e0db193: Add first-party VitePress and Astro Starlight human-documentation adapters.
- 03c17bc: Add a first-party Nextra human-documentation adapter for deterministic content-directory routes.

## 1.2.6

### Patch Changes

- Restore the stable release security gate with patched Next.js and Sharp versions and pnpm 11-compatible dependency overrides.

## 1.2.5

### Patch Changes

- d2429f4: Add read-only MCP tool annotations, a public privacy policy, and deterministic MCPB packaging for local Claude Desktop installation.

## 1.2.4

### Patch Changes

- 8106e2e: Add the verified MCP Registry namespace to the published package metadata.

## 1.2.3

### Fixed

- Publish path for seven-product `properties[]` contract and `formatEcosystemLlmsBlock` (v1.2.2 GitHub tag/package.json were misaligned; npm still on 1.2.1)
- Marketplace Action dogfoods the local workspace package when run in this repository
- Docs site `llms.txt` renders the shared seven-product mesh with role, maturity, machine index, and **(current)**

### Changed

- Sync `ecosystem.json` upstream snapshot from AgentsKit hub main

## 1.2.1

### Fixes

- Restore the stable release audit with pnpm's bulk advisory client and pin patched transitive versions of PostCSS, tmp, and uuid.

## 1.2.0

### Minor Changes

- d4260b9: Add the production documentation portal, deterministic AgentsKit Chat knowledge surface, generated LLM and raw Markdown artifacts, and README Standard v1 quality gates.

## Unreleased

### Features

- Add read-only MCP tool annotations, a public privacy policy, and validated MCPB packaging for local Claude Desktop installation.
- Migrate the documentation portal dogfood from AgentsKit Chat 0.2 packages (`@agentskit/chat-protocol`, `@agentskit/chat-react`) to the consolidated 0.3.x surface (`@agentskit/chat/protocol`, `@agentskit/chat/react`) while keeping `@agentskit/chat` as the root package.
- Replace the legacy Pages landing with a statically exported Fumadocs portal backed directly by the canonical `docs/**` corpus.
- Generate `llms.txt`, `llms-full.txt`, raw Markdown, and a hash-verified deterministic AgentsKit Chat artifact from the repository's own Doc Bridge index.
- Add dynamic AgentsKit Chat dogfood with local exact answers, ambiguity choices, session-aware backend fallback, and explicit provenance.
- Adopt README Standard v1 for repository, package, and public-app profiles with synchronized executable examples and freshness evidence.

### Quality

- Add `pnpm check:no-legacy-chat-imports` to reject any reintroduction of `@agentskit/chat-protocol` or `@agentskit/chat-react`.
- Add desktop/mobile Playwright coverage for the landing, Fumadocs, local chat, ambiguity, and completed backend stream.
- Expand self-ownership handoffs across CLI, indexing, query, MCP, quality, memory, and intelligence modules.

## 1.1.1

### Fixes

- Publish stable packages only from immutable tags after security, test, coverage, packaged-smoke, dogfood, and Documentation Standard v1 gates pass.
- Sync the canonical ecosystem snapshot before release so conformance and cross-product navigation remain current.

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

- **Landing** — `docs/landing/index.html` deployed to GitHub Pages (`https://doc-bridge.agentskit.io/`)
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
