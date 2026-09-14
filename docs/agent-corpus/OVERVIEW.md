---
type: index
purpose: Route coding agents to Doc Bridge ownership sidecars.
owner: maintainers
lifecycle: active
sourceOfTruth: doc-bridge.config.json
validationPath: node bin/ak-docs.js query ownership doc-bridge --agent
---

# Doc Bridge agent corpus

Resolve the requested ownership ID with `ak-docs query ownership <id> --agent`. Read the returned sidecar and its linked human guide before editing.

## Example

```bash
ak-docs query ownership doc-bridge --agent
```

The command returns a bounded handoff similar to:

```json
{
  "target": { "type": "package", "id": "doc-bridge", "path": "src" },
  "startHere": "docs/agent-corpus/doc-bridge.md",
  "readBeforeEditing": ["docs/agent-corpus/doc-bridge.md", "AGENTS.md"],
  "editRoots": ["src"],
  "checks": ["pnpm test", "pnpm typecheck"],
  "humanDoc": "/docs/POSITIONING"
}
```

Use `startHere` and `readBeforeEditing` first, edit only within `editRoots`,
then run the declared `checks`.
