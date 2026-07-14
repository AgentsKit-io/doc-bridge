---
title: Dogfood round 2
description: Validation evidence from the second published Doc Bridge alpha.
---

# Dogfood round 2 — published `@agentskit/doc-bridge@0.1.0-alpha.2`

**Date:** 2026-07-09  
**Install:** npm registry tag `alpha` → `0.1.0-alpha.2`  
**Consumers:** agentskit · agentskit-os · agents-playbook · agentskit-registry  

## Scoreboard

| Repo | Install | Version | Knowledge | Handoffs | Gate | Sample handoff quality |
|------|---------|---------|-----------|----------|------|------------------------|
| **agentskit** | `pnpm add -Dw @0.1.0-alpha.2` ✅ | 0.1.0-alpha.2 | 25 | 24 | ✅ freshness + 23 humanDoc | Excellent: pnpm filter checks + humanDoc `/docs/reference/packages/core` |
| **agentskit-os** | pnpm store conflict; used **`npx`** ✅ | 0.1.0-alpha.2 | 170 | 92 | ✅ freshness + 9 humanDoc | Good act path; weak human bridge (9/92) |
| **agents-playbook** | `pnpm add -D` ✅ | 0.1.0-alpha.2 | 127 | 81 | ✅ freshness + okf-type | Pattern ownership + `check:okf-type` ✅ |
| **agentskit-registry** | needs `--legacy-peer-deps` ⚠️ | 0.1.0-alpha.2 | 36 | 36 | ✅ freshness | Full agent ownership + humanDoc ✅ |

### npm dist-tags (observed)

| Tag | Version |
|-----|---------|
| `latest` | `0.1.0-alpha.1` |
| `alpha` | `0.1.0-alpha.2` |

**Recommendation:** keep prereleases only on `alpha` until stable; document `npm i -D @agentskit/doc-bridge@alpha`.

---

## What works well (validated)

1. **Published binary works** — `ak-docs 0.1.0-alpha.2` from registry / npx.
2. **Monorepo handoffs** — `editRoots` + `pnpm --filter @agentskit/<pkg> test|lint` on agentskit and AKOS.
3. **Playbook preset** — gates green without crushing large OKF corpus.
4. **Registry ownership** — all 36 agents resolve; checks use `npm run validate`.
5. **Fumadocs humanDoc** on agentskit points at **reference** docs, not nested for-agents.
6. **Pattern checks** — playbook patterns emit `pnpm run check:okf-type`.

---

## Issues found (prioritized)

### P0 — correctness / ranking (agents will take wrong action)

| ID | Issue | Evidence | Suggested fix |
|----|--------|----------|----------------|
| **R2-1** | **Search/ask ranking ignores exact package id** | `search core --agent` bestMatch = **angular** (score 8) tied with **core** (score 8) because summary contains `@agentskit/core` | Boost exact `id` / path segment matches; prefer ownership id === term before body mentions |
| **R2-2** | **`ask` suggests wrong handoff** | “where do I change the **core** package?” → best match **angular**, next `query ownership angular` | Same ranking fix; optional: prefer ownership over knowledge for “package/module” language |
| **R2-3** | **Purpose/notes truncated mid-sentence** | core notes: `"Stable TypeScript contracts (Adapter, Tool, Memory, Retriever, Skill,"` | Raise firstParagraph budget; strip trailing incomplete commas; prefer frontmatter `purpose` full line |

### P1 — install / peer DX

| ID | Issue | Evidence | Suggested fix |
|----|--------|----------|----------------|
| **R2-4** | **Optional peers still break npm install** | registry: `ERESOLVE` with optional peers vs `@agentskit/adapters@0.12.x` | Peer ranges more permissive (`>=0.12` / `>=1.0`); document `--legacy-peer-deps`; ensure optional peers never hard-fail Layer 0 |
| **R2-5** | **Peer `@agentskit/core@^1.10.0` vs monorepo 1.9.0** | pnpm warning on agentskit install | Align peer to `^1.9.0 \|\| ^1.10.0` or `>=1.9.0 <2` for dogfood until monorepo bumps |
| **R2-6** | **`latest` still points at alpha.1** | `npm view` latest=alpha.1, alpha=alpha.2 | Publish hygiene: don’t put prereleases on `latest`, or retag after publish |
| **R2-7** | **AKOS cannot `pnpm add` (store v10 vs v11)** | `ERR_PNPM_UNEXPECTED_STORE` | Docs: use npx / align store; not a doc-bridge bug but dogfood friction |

### P2 — search / retrieval quality

| ID | Issue | Evidence | Suggested fix |
|----|--------|----------|----------------|
| **R2-8** | **Search miss on common English** | agentskit `search documentation` → **0 matches** | Index more body text / titles; lower threshold; BM25 over full file not only description |
| **R2-9** | **Playbook `search handoff` → 0** | term may only appear deep in body | Same as R2-8; chunk full markdown into search corpus |
| **R2-10** | **Federation hard-fail noise** | `retrieve` → `Failed to fetch https://registry.agentskit.io/llms.txt: 404` | Soft-fail federation sources; warn once; don’t fail command |
| **R2-11** | **Text search UX** | tab-separated dense lines | Columnar/TTY formatting (`type  id  path  summary`) |

### P3 — bridge coverage & product polish

| ID | Issue | Evidence | Suggested fix |
|----|--------|----------|----------------|
| **R2-12** | **AKOS humanDoc still sparse** | 9/92 handoffs with humanDoc | Map for-agents frontmatter `humanDoc`; product Fumadocs catalog; optional plain-markdown `docs/errors` etc. |
| **R2-13** | **Duplicate knowledge+ownership rows in search** | same path appears as ownership + knowledge | Deduplicate by path; show ownership preferred |
| **R2-14** | **Default checks for patterns without okf script** | N/A playbook ok | Fine; document convention |
| **R2-15** | **MCP not re-smoked this round** | — | Keep in CI smoke; optional round 3 |

---

## Sample outputs (good)

### agentskit — `query package core --agent`

```json
{
  "startHere": "apps/docs-next/content/docs/for-agents/core.mdx",
  "editRoots": ["packages/core"],
  "checks": [
    "pnpm --filter @agentskit/core test",
    "pnpm --filter @agentskit/core lint"
  ],
  "humanDoc": "/docs/reference/packages/core"
}
```

### playbook — pattern handoff

```json
{
  "startHere": "content/docs/pillars/ai-collaboration/open-knowledge-format-pattern.md",
  "checks": ["pnpm run check:okf-type"],
  "humanDoc": "/docs/pillars/ai-collaboration/open-knowledge-format-pattern"
}
```

### registry — `docs-chat`

```json
{
  "startHere": "registry/docs-chat/README.md",
  "editRoots": ["registry/docs-chat"],
  "checks": ["npm run validate", "npm test"],
  "humanDoc": "/agents/docs-chat"
}
```

---

## Recommended next alpha (0.1.0-alpha.3) scope

1. **Ranking:** exact id / basename boost; package-intent heuristics for `ask`
2. **Search corpus:** full-text over body (not only description); dedupe paths
3. **Descriptions:** full purpose from frontmatter or first complete paragraph
4. **Peers:** widen optional peer ranges; Layer 0 install never requires AgentsKit packages
5. **Federation:** soft-fail missing `llms.txt` sources
6. **Publish:** keep `latest` free of broken prereleases; doc install as `@alpha`

---

## Consumer follow-ups (not doc-bridge code)

| Repo | Action |
|------|--------|
| agentskit | Bump `@agentskit/core` to 1.10+ or live with peer warning |
| agentskit-os | Align pnpm store / commit lock with published dep; add CI `docs:bridge:gate` |
| agents-playbook | Optional CI workflow for gate |
| agentskit-registry | Publish `public/llms.txt` at site root (404 today); use `--legacy-peer-deps` until peer ranges loosen |
| all | After alpha.3: switch dep to `@agentskit/doc-bridge@alpha` only |

---

## Conclusion

**Round 2 proves Layer 0 is useful on real monorepos and OKF/registry corpora with the published package.**  
The biggest remaining gap for “agents do the right thing” is **discovery ranking (R2-1/R2-2)** and **search body coverage (R2-8/R2-9)** — not indexing or handoff structure.
