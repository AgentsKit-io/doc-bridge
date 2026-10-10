---
title: Examples
description: Ready-to-run Doc Bridge configurations and integration examples.
---

# Examples

Config sketches under [`examples/`](../examples/):

| File | Profile |
|------|---------|
| `minimal-plain-markdown.config.ts` | Solo markdown, Layer 0 only |
| `pnpm-monorepo.config.ts` | Workspace discovery + ownership |
| `nx-monorepo.config.ts` | Static Nx project discovery + inferred checks |
| `fumadocs-only.config.ts` | Human bridge via Fumadocs |
| `docusaurus-only.config.ts` | Human bridge via Docusaurus |
| `vitepress-only.config.ts` | Human bridge via VitePress |
| `starlight-only.config.ts` | Human bridge via Astro Starlight |
| `nextra-only.config.ts` | Human bridge via Nextra |
| `fumadocs-with-chat.config.ts` | Standard + intelligence (AgentsKit peers) |
| `docusaurus-with-memory.config.ts` | Assisted memory promotion path |

## Choose your configuration

| Repository shape / goal | Start here | Add only when needed |
| --- | --- | --- |
| One package with Markdown | `minimal-plain-markdown.config.ts` | Explicit ownership below |
| pnpm workspaces | `pnpm-monorepo.config.ts` | Human adapter matching your site |
| Existing Fumadocs site | `fumadocs-only.config.ts` | Ownership or workspace routing |
| Existing Docusaurus site | `docusaurus-only.config.ts` | Ownership or workspace routing |
| Committed Obsidian notes | [Vault config](./guides/vault.md) | Ignored generated export; `vault diff` review |
| Decisions / concepts / changes | Existing config + `index.knowledgeEntities.enabled: true` | [CLI why and MCP rationale](./spec/knowledge-query-v1.md) |
| Local agent memory | Existing config + memory paths | [Memory pipeline](./guides/memory-pipeline.md); no provider needed for ingest/classify |
| Optional region rewrite | Existing config + scripted responses first | [Fake-provider guide](./guides/llm-remediation.md); real providers via intelligence config |

Examples are config sketches, not assertions that the example paths exist in
your repo. Replace roots, package IDs and checks, then index and query your real
package. Core ownership, query and handoff require no optional peers.

## Ownership without monorepo

```json
{
  "schemaVersion": 1,
  "corpus": { "agent": { "root": "docs/for-agents" } },
  "routing": {
    "options": {
      "ownership": {
        "auth": {
          "path": "src/auth",
          "purpose": "Authentication",
          "checks": ["npm test -- auth"]
        }
      }
    }
  }
}
```

Or frontmatter on an agent doc:

```md
---
package: auth
editRoot: src/auth
checks: [npm test -- auth]
---
```

## Public ecosystem surfaces

Doc Bridge is designed to be consumed by:

- https://www.agentskit.io/docs/for-agents
- https://registry.agentskit.io/
- https://playbook.agentskit.io/llms.txt
- https://chat.agentskit.io/docs
- https://doc-bridge.agentskit.io/

## Related

- [Install and run](./guides/install-and-run.md)
- [Config reference](./spec/config-v1.md)
- [Getting started](./getting-started.md)
