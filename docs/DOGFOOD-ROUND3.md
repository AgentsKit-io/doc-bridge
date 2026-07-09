# Dogfood round 3 — `@agentskit/doc-bridge@0.1.0-alpha.3`

**Date:** 2026-07-09  
**npm:** `alpha` → `0.1.0-alpha.3` · `latest` still `0.1.0-alpha.1`

## Scoreboard

| Repo | Install | Ver | K | Handoffs | Gate | Ranking | Ask | Retrieve |
|------|---------|-----|---|----------|------|---------|-----|----------|
| **agentskit** | `pnpm add -Dw` ✅ | 0.1.0-alpha.3 | 25 | 24 | ✅ 24 humanDoc | `core` #1 (683) ✅ | ownership core ✅ | ✅ soft, 8 chunks |
| **agentskit-os** | `npx` (store issue) ✅ | 0.1.0-alpha.3 | 170 | 92 | ✅ | `os-core` #1 (689) ✅ | ownership os-core ✅ | ✅ 8 chunks |
| **playbook** | `pnpm add -D` ✅ | 0.1.0-alpha.3 | 127 | 81 | ✅ okf | OKF pattern #1 ✅ | pattern ownership ✅ | ✅ |
| **registry** | `--legacy-peer-deps` ⚠️ | 0.1.0-alpha.3 | 36 | 36 | ✅ | `docs-chat` #1 (593) ✅ | docs-chat ✅ | ✅ |

## Round-2 issues — validation

| Item (R2) | Status | Evidence |
|-----------|--------|----------|
| Exact id ranking | **Fixed** | agentskit `search core` → best=`core` not angular |
| ask wrong package | **Fixed** | “change the core package?” → ownership core |
| Notes truncated | **Fixed** | full purpose sentences on core / os-core |
| Full-text search | **Improved** | `search documentation` → 20 matches (was 0) |
| Federation 404 hard-fail | **Fixed** | retrieve exit 0, no error, local chunks only |
| Peer install friction | **Improved** | no peer warning on agentskit; registry still needs legacy-peer-deps |
| Text UX | **Fixed** | multi-line `[ownership] id score=` format |
| Path dedupe | **OK** | top lists are unique ownership rows |
| AKOS humanDoc sparse | **Still open** | os-core handoff has no `humanDoc` (product docs thin) |
| pnpm store AKOS | **Still open** | environment; npx works |
| `latest` on old alpha | **Still open** | publish hygiene |

## Sample outputs (alpha.3)

### agentskit — ranking

```json
{ "term": "core", "best": "core", "top": ["core:683", "angular:27", "ink:27"] }
```

### agentskit — handoff

```json
{
  "startHere": "apps/docs-next/content/docs/for-agents/core.mdx",
  "editRoots": ["packages/core"],
  "checks": ["pnpm --filter @agentskit/core test", "pnpm --filter @agentskit/core lint"],
  "humanDoc": "/docs/reference/packages/core",
  "notes": ["Stable TypeScript contracts (Adapter, Tool, Memory, Retriever, Skill, Runtime) + `createChatController` + primitives. Target: <10 KB gzipped, zero runtime deps."]
}
```

### agentskit-os — ranking

```json
{ "best": "os-core", "top": ["os-core:689", "command-palette:36", "os-blob:36"] }
```

### registry — ranking

```json
{ "best": "docs-chat", "top": ["docs-chat:593", "agency-brief-generator:15"] }
```

## Remaining improvements (lower urgency)

1. **AKOS humanDoc coverage** — enrich for-agents frontmatter `humanDoc` or map product Fumadocs more densely (content work more than code).
2. **npm install without legacy-peer-deps** on registry — may still need peerOptional tuning vs npm ERESOLVE; document install flags.
3. **HTML entities in notes** — `&lt;10 KB` from source MD; optional decode on index.
4. **AKOS lockfile install path** — fix local pnpm store / commit published dep version.
5. **CI wire-up** — `docs:bridge:gate` on each consumer after merge of dogfood branches.
6. **Publish tags** — keep `latest` free of prereleases or retag intentionally.

## Verdict

**alpha.3 is a successful dogfood pass.** P0/P1 product issues from round 2 are validated fixed on published package across monorepo + playbook + registry. Remaining items are polish, content, or consumer-side install/CI.
