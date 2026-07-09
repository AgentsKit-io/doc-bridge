# Ecosystem dogfood — `@agentskit/doc-bridge`

Validated **2026-07-09** against four consumers (local `file:` install of `0.1.0-alpha.1` while npm scope visibility was flaky).

## Standard integration (all repos)

| Artifact | Purpose |
|----------|---------|
| `doc-bridge.config.json` | Layer 0 config (schemaVersion 1) |
| `docs:bridge:index` | `ak-docs index` |
| `docs:bridge:gate` | `ak-docs gate run` |
| `docs:bridge:query` | `ak-docs query` |
| `.doc-bridge/` | Generated index (gitignored) |
| `devDependency` | `@agentskit/doc-bridge` (`file:` or `0.1.0-alpha.1` / `@alpha` when npm resolves) |

### MCP (optional, same in each repo)

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

## Results

| Repo | Knowledge | Handoffs | Gate | Sample handoff |
|------|-----------|----------|------|----------------|
| **agentskit** | 25 | 24 | ✅ freshness + 24 humanDoc | `core` → `packages/core` + for-agents MDX |
| **agentskit-os** | 170 | 82 | ✅ freshness + 2 humanDoc | `os-core` → for-agents package doc |
| **agents-playbook** | 127 | 81 patterns | ✅ freshness + okf-type | `open-knowledge-format-pattern` |
| **agentskit-registry** | 36 | 36 | ✅ freshness | `docs-chat` → `registry/docs-chat` |

## Findings / improvements for doc-bridge

### P0 product feedback
1. **Default checks are npm-centric** (`npm test` / `npm run lint`) even in pnpm monorepos. Prefer detecting `packageManager` or `pnpm --filter <id> test`.
2. **Git install lacks `dist/`** — `github:…#tag` installs source only; need `prepare`/`prepack` that builds, or document npm-only install.
3. **`docs-style` gate is too strict** for playbook OKF (expects purpose/owner-source on every page). Make playbook profile softer or map to existing `check:okf-type`.
4. **HumanDoc join rate low on AKOS** (2/82) — product Fumadocs tree is thin vs package atlas; support multi-human corpora (product + `docs/adr`) and/or ownership `humanDoc` from for-agents frontmatter.

### P1 DX
5. **Nested agent corpus inside human tree** (agentskit for-agents under `content/docs`) double-counts unless human meta exclude — works but humanDoc points at `/docs/for-agents/core` which is correct for that site.
6. **Playbook is pattern-owned, not package-owned** — ownership generation from filenames works; first-class `routing.plugin: pattern-files` would help.
7. **Registry human plain-markdown** + URL prefix `/agents/:id` works; committed `public/llms.txt` must stay owner of site discovery (`llmsTxt.enabled: false`).
8. **AKOS pnpm store mismatch** can block `pnpm add` — dogfood via absolute `ak-docs` still validates; install needs store alignment.

### P2 ecosystem
9. Ship **npm package** publicly (`@agentskit/doc-bridge@alpha`) so consumers drop `file:`.
10. Wire `docs:bridge:gate` into each CI (`check:quality-gates` / registry verify / new playbook workflow).
11. Federation: registry `llms.txt` still 404 online — dogfood configs already list it; fix registry publish of Self-Describe artifact.

## Per-repo config notes

### agentskit
- Agent: `apps/docs-next/content/docs/for-agents`
- Human: Fumadocs same docs tree
- Routing: `pnpm-monorepo` `packages/*`
- Best fit: clean monorepo + for-agents coverage already exists

### agentskit-os
- Agent: `docs/for-agents` (canonical)
- Human: product Fumadocs only (`apps/web/content/docs`) — dual human later
- `llmsTxt.enabled: false` (keep `gen-self-describe`)
- Dual-run with `docs:internal` — do not delete internal generators yet

### agents-playbook
- Agent = human = `content/docs` (OKF)
- Ownership: generated per pattern file under pillars
- Gates: `index-freshness` + `okf-type` only (not docs-style)

### agentskit-registry
- Agent root: `registry/**/README.md`
- Ownership: one entry per agent id
- npm package (not pnpm workspace)
- `llmsTxt.enabled: false`

## Commands used to validate

```bash
ak-docs index
ak-docs gate run
ak-docs query package <id> --agent
ak-docs list packages --text
```
