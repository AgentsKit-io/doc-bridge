---
title: Dogfood validation v1
description: Release validation evidence for the first stable Doc Bridge package.
---

# Dogfood validation — `@agentskit/doc-bridge@1.0.0`

**Date:** 2026-07-09  
**Install:** `1.0.0` from npm (`alpha` dist-tag; `latest` still points at older alpha.1)

## Scoreboard

| Repo | Install | Ver | K/H | Gate | Doctor | Ranking | Ask handoff preview | MCP install |
|------|---------|-----|-----|------|--------|---------|---------------------|-------------|
| **agentskit** | pnpm -Dw ✅ | **1.0.0** | 25/24 | ✅ 24 human | **100/100 A** | core #1 | ✅ core + bridge | ✅ wrote `.cursor/mcp.json` |
| **playbook** | pnpm -D ✅ | **1.0.0** | 127/81 | ✅ | **100/100 A** | OKF pattern #1 | ✅ | ✅ |
| **registry** | npm --legacy-peer-deps ✅ | **1.0.0** | 36/36 | ✅ | **100/100 A** | docs-chat #1 | ✅ | ✅ |
| **agentskit-os** | npx ✅ | **1.0.0** | 170/92 | ✅ | **81/100 B** | os-core #1 | ✅ + “human guide missing” | (not run write) |

## 1.0.0 features exercised

| Feature | Result |
|---------|--------|
| `doctor --text` | Score A on 3 repos; B on AKOS with **actionable missing humanDoc list** |
| `doctor --badge` | Shields markdown for handoff/bridge/score |
| `demo --text` | Before/after handoff + gate red→green + MCP snippet |
| `mcp install --cursor` | Creates `.cursor/mcp.json` with nextSteps |
| `ask` handoff preview | start / edit / checks / Bridge lines |
| Ranking exact-id | core, os-core, docs-chat, open-knowledge-format-pattern all #1 |
| Soft federation retrieve | exit 0, local chunks |

## Highlights (impressive)

### agentskit — perfect monorepo story

```
Score: 100/100 (A)
Agent docs: 24/24 · Human guides: 24/24 · Badge: handoff 100% · bridge 100%
```

```
ask "where do I change the core package?"
Handoff preview
  start:  .../for-agents/core.mdx
  edit:   packages/core
  checks: pnpm --filter @agentskit/core test · lint
  Bridge: /docs/reference/packages/core
```

### playbook — OKF corpus

```
Score: 100/100 (A) · 81/81 handoff · 81/81 bridge
checks: pnpm run check:okf-type
```

### registry — agent-id ownership

```
Score: 100/100 (A) · 36/36
docs-chat → registry/docs-chat + npm run validate
```

### AKOS — honest B (bridge gap is the product)

```
Score: 81/100 (B)
Agent docs: 86/92 (93%) · Human guides: 15/92 (16%)
Missing humanDoc: admin, os-*, desktop-*, …
notes: "Human guide missing for os-core. Run: ak-docs bootstrap agent-docs"
ask Bridge: human guide missing → ak-docs bootstrap agent-docs
```

This is the right UX: **not fake 100%** when product docs are thin.

## Remaining friction (not blockers for 1.0)

1. **npm `latest` still 0.1.0-alpha.1** — users should install `@1.0.0` or `@alpha` until latest is retagged.
2. **registry** still prefers `--legacy-peer-deps` on some npm versions.
3. **AKOS** `pnpm add` store mismatch — `npx @agentskit/doc-bridge@1.0.0` works.
4. **AKOS bridge 16%** — content/map work; doctor already drives it.
5. **notes** may still show HTML entities (`&lt;`) from source MDX.
6. **mcp install** writes into repo (`.cursor/mcp.json`) — commit or gitignore intentionally.
7. **CI** still not wired on all four consumers for `doctor`/`gate` on every PR.

## Verdict

**1.0.0 is validated on the four ecosystem repos.**  
Doctor + ask handoff preview + mcp install + demo deliver the “wow” layer that alpha.3 still lacked in product surface. AKOS correctly surfaces bridge debt instead of hiding it.
