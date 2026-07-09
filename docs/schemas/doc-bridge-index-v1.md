# DocBridgeIndex v1

Zod schema: `DocBridgeIndexV1Schema` in `@agentskit/doc-bridge`.

Portable JSON Schema export: `DocBridgeIndexV1JsonSchema`.

## Shape

```json
{
  "schemaVersion": 1,
  "contentHash": "df701207f5f3663d3e0a5d0e257c7ce1b8f2898ef8e1ea1fe91d5289ec74bb3c",
  "contentHashAlgo": "sha256-normalized-v1",
  "generatedAt": "2026-07-09T00:00:00.000Z",
  "project": { "name": "my-project", "root": "." },
  "knowledge": [
    {
      "id": "auth",
      "type": "agent-doc",
      "title": "Authentication",
      "path": "docs/for-agents/auth.md",
      "description": "Auth ownership and edit workflow."
    }
  ],
  "handoffs": {
    "auth": {
      "type": "agent-handoff",
      "schemaVersion": 1,
      "source": ".doc-bridge/index.json",
      "target": { "type": "package", "id": "auth", "path": "packages/auth" },
      "startHere": "docs/for-agents/auth.md",
      "readBeforeEditing": ["docs/for-agents/auth.md", "AGENTS.md"],
      "editRoots": ["packages/auth"],
      "checks": ["npm test -- auth"],
      "notes": ["Authentication package"]
    }
  },
  "lookup": {
    "packages": ["auth"],
    "ownership": {
      "auth": {
        "id": "auth",
        "path": "packages/auth",
        "checks": ["npm test -- auth"],
        "agentDoc": "docs/for-agents/auth.md"
      }
    }
  }
}
```

## Content Hash

`contentHashAlgo` is `sha256-normalized-v1`.

The hash input is deterministic JSON containing only:

- `schemaVersion`
- `knowledge`
- `handoffs`
- `lookup`

`generatedAt` is not part of the hash input. When the hash is unchanged, `ak-docs index` preserves the existing `generatedAt` so regenerated `index.json` bytes stay stable.

## Validation

```ts
import { parseDocBridgeIndex } from '@agentskit/doc-bridge'

const index = parseDocBridgeIndex(JSON.parse(raw))
```
