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

## Legacy compatibility

Legacy `--agent` payloads may omit `schemaVersion`. Use `normalizeAgentHandoff()` or `safeParseAgentHandoff()` to upgrade.

## CLI validation

```bash
ak-docs validate-handoff ./handoff.json
```
