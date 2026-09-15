---
title: AgentHandoff v1
description: Machine-readable contract for a compact, actionable coding-agent handoff.
---

# AgentHandoff v1

Zod schema: `AgentHandoffV1Schema` in `@agentskit/doc-bridge`.

Portable JSON Schema export: `AgentHandoffV1JsonSchema`.

## Shape

```json
{
  "type": "agent-handoff",
  "schemaVersion": 1,
  "source": ".doc-bridge/index.json",
  "target": { "type": "package", "id": "auth" },
  "startHere": "docs/for-agents/modules/auth.md",
  "readBeforeEditing": ["docs/for-agents/modules/auth.md", "AGENTS.md"],
  "editRoots": ["src/auth/"],
  "checks": ["npm test -- auth"],
  "humanDoc": "/docs/guides/authentication",
  "notes": ["Authentication module"]
}
```

## Optional additions

`related`, `explain`, `evidence` and `metadata` are optional, and `target.type` also accepts `area`
and `document`. A handoff written without them is still a valid handoff, and a reader that predates
them sees the same fields it always did.

```json
{
  "related": [{ "id": "area:src/ranking", "path": "src/ranking", "direction": "imports", "strength": 3, "evidence": ["src/query/search.ts → src/ranking/bm25.ts"] }],
  "explain": { "startHere": ["covers area:src/query"], "checks": ["routing.options.ownership.doc-bridge-query.checks"] },
  "evidence": [{ "source": "derived", "path": "src/query", "contentHash": "…" }],
  "metadata": { "entityId": "area:src/query", "kind": "area", "checksSource": "ownership", "confidence": "observed" }
}
```

## Legacy compatibility

Legacy `--agent` payloads may omit `schemaVersion`. Use `normalizeAgentHandoff()` or `safeParseAgentHandoff()` to upgrade.

## CLI validation

```bash
ak-docs validate-handoff ./handoff.json
```
