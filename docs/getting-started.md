---
title: Getting started
description: Install, index and query repository documentation without an API key.
---

# Getting started

doc-bridge provides deterministic proof of documentation drift and turns your existing docs into an **AgentHandoff** index:

- `startHere` — what the agent reads first
- `editRoots` — where the agent is allowed to work
- `checks` — what proves the edit
- `humanDoc` — the human-facing guide for the same area

It also runs the inverse loop: local agent memory becomes a classified,
reviewable documentation draft. Start with CLI. Add MCP when agents should call
it automatically. Add CI when the bridge becomes part of review.

## Install

```bash
npm i -D @agentskit/doc-bridge
# or
pnpm add -D @agentskit/doc-bridge
```

CLI binary: **`ak-docs`**.

For the canonical zero-setup proof, see the [README's 60-second proof](../README.md#60-second-proof).

## Two-minute path (no API key)

Run local binaries through `npx` (or `pnpm exec`); a development dependency does
not put `ak-docs` on your shell PATH. Node 22 or newer is required.

```bash
npx ak-docs init
npx ak-docs index
npx ak-docs query package example --agent
```

This starter handoff proves wiring, not real ownership. Replace the generated
example with your repository's edit roots and checks using the
[config selection table](./examples.md), reindex, then query your actual package.
The two-minute target depends on clone/install speed and repository size; it is
not a universal latency guarantee. Watch mode and MCP installation are follow-ups.

You should see an **AgentHandoff** with `startHere`, `editRoots`, `checks`, and optional `bridge`.

Use `npx ak-docs` (or `pnpm exec ak-docs`) for the remaining CLI examples too.

Useful follow-ups:

```bash
ak-docs list packages --text
ak-docs ask "where do I change example?"
ak-docs gate run
ak-docs mcp
```

`init --no-demo` skips the starter module if you want an empty corpus.

## Configuration

Configuration is discovered in the order defined by the configuration specification; `doc-bridge.config.json` is the simplest supported fallback (along with `.ts`, `.js`, and `package.json#docBridge`).

**Required:** `schemaVersion: 1` + `corpus.agent.root`.

Ownership (any one of these):

1. `routing.options.ownership`
2. Frontmatter on agent docs: `package` + `editRoot`
3. Monorepo plugin (`pnpm-monorepo` + workspace discovery)

Project root for `--config path/to/doc-bridge.config.json` is the **directory of that file**.

See [config-v1](./spec/config-v1.md) and [examples](./examples.md).

## Use surfaces

| Surface | When to use | Command |
|---------|-------------|---------|
| CLI | You want to inspect or debug the bridge yourself | `ak-docs query package <id> --agent` |
| MCP | You want coding agents to resolve handoffs before editing | `ak-docs mcp install --cursor` |
| CI | You want stale indexes and explicitly configured documentation gates to fail PRs | `ak-docs gate run` (the PR action can build the index in CI with `index-source: ci-built`, or check a committed one) |
| Adapters | You already have Fumadocs, Docusaurus, Markdown docs, or an Obsidian-style vault | configure `corpus.human` (the `obsidian` plugin is opt-in) |
| Memory pipeline | You want agent notes turned into reviewable docs | `ak-docs memory promote --pr --dry-run` |
| Optional RAG/chat | You want a terminal assistant grounded in the same index | `ak-docs rag ingest && ak-docs chat` |

## MCP (Cursor / Claude)

```json
{
  "mcpServers": {
    "ak-docs": {
      "command": "npx",
      "args": ["ak-docs", "mcp"]
    }
  }
}
```

Tools: `handoff.resolve`, `doc.search`, `doc.get`, `gate.status`, …

## Human ↔ agent bridge

```bash
# After configuring corpus.human (fumadocs | docusaurus | vitepress | starlight | nextra | plain-markdown)
ak-docs index
ak-docs query package <id> --agent   # includes humanDoc when linked
ak-docs gate run human-guide-links
ak-docs bootstrap agent-docs         # draft agent docs from human site
```

## Memory → project docs

```bash
ak-docs memory ingest
ak-docs memory classify
ak-docs memory promote              # prints a safe draft body
ak-docs memory promote --pr --dry-run  # writes a local draft and prints commands only
ak-docs memory promote --pr         # opens a GitHub draft PR via gh
```

Sources include `.agent-memory/**` and `.cursor/rules/*.mdc`. Promotion is
draft-only and never auto-merges.

## 2.0: inspect drift and rationale

Use [diff and findings](./guides/diff-and-findings.md) to compare captured revisions.
The [Action advisory](./guides/action-advisory.md) separates claims about changed
aspects from bare mentions; `CHANGED_REFERENCE` requests review, not automatic
correction. Removal requires evidence and unsupported analysis stays visible.

Enable knowledge entities in your existing config, then rebuild:

```json
{ "index": { "knowledgeEntities": { "enabled": true } } }
```

```bash
npx ak-docs index
npx ak-docs why src/auth.ts
```

Decisions, concepts and changes retain indexed evidence. No match is not proof
that rationale does not exist. MCP adds `knowledge.decision`, `knowledge.concept`
and `knowledge.whyChanged`; see [knowledge query](./spec/knowledge-query-v1.md).

## Obsidian discovery, export and review

Configure the opt-in `obsidian` human adapter for committed notes. Run
`npx ak-docs vault export --text` for generated navigation and
`npx ak-docs vault diff --text` to capture edited generated notes as pending
proposals. Keep generated output ignored and human notes committed. Export
refuses to overwrite edits. Follow the [vault guide](./guides/vault.md).

## Optional LLM remediation

The [key-free remediation guide](./guides/llm-remediation.md) uses a scripted fake
provider via `--responses`; it reads no API key. Start with
`npx ak-docs fix --llm --base base.json --dry-run`. Real providers are explicitly
configured under `intelligence`; omit `--responses` only for an intended provider
run. Deterministic rechecking gates proposals, and human review still decides
correctness. Core init/index/query/handoff never requires that provider.
Optional chat/RAG setup remains in [chat and RAG](./chat-and-rag.md).

## Upgrade and measured limits

Read [1.x → 2.0 migration](./migration/1.x-to-2.0.md) before regenerating old
artifacts. Studio is coming with its final design; it is not shipped here.
The [latest benchmark and method](./bench/layer1-results-v2.md) report native
precision 100% (15/15 findings), historical precision 83.3% (10/12 findings),
and historical negative-case false-positive rate 6.25% (2/32 cases).
These sample results do not prove arbitrary prose correctness.

## Related

- [Install and run](./guides/install-and-run.md) — guided path with tables  
- [CLI map](./guides/cli-map.md) — every command with copy-paste examples  
- [Memory pipeline](./guides/memory-pipeline.md) — digest · classify · promote  
- [Index and query](./guides/index-and-query.md) · [MCP for agents](./guides/mcp-agents.md)  
- [Gate and CI](./guides/gate-ci.md) · [Marketplace](./MARKETPLACE.md)  
- [CLI reference](./spec/cli.md) · [Config](./spec/config-v1.md)  
- [Positioning](./POSITIONING.md)
