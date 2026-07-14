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
| `fumadocs-only.config.ts` | Human bridge via Fumadocs |
| `docusaurus-only.config.ts` | Human bridge via Docusaurus |
| `fumadocs-with-chat.config.ts` | Standard + intelligence (AgentsKit peers) |
| `docusaurus-with-memory.config.ts` | Assisted memory promotion path |

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

doc-bridge is designed to be consumed by:

- https://www.agentskit.io/docs/for-agents
- https://registry.agentskit.io/
- https://playbook.agentskit.io/llms.txt
