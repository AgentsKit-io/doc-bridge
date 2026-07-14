---
title: Agent routing skill
description: Give coding agents a deterministic recipe for finding ownership and checks.
---

# Doc Bridge — agent routing skill

Use this skill in Cursor, Claude Code, or Codex so agents resolve ownership **before** editing packages.

## When to trigger

- User asks to change code under `packages/*`, `apps/*`, or any monorepo module
- Task mentions auth, billing, API, schema, or a package name
- Before creating or moving files in an unfamiliar area of the repo

## Required workflow

1. **Resolve handoff first** — call MCP tool `handoff.resolve` with the package id, or run:
   ```bash
   ak-docs query ownership <id> --agent
   ```
2. **Read `startHere`** — open the agent doc path from the handoff
3. **Edit only `editRoots`** — do not touch sibling packages
4. **Run `checks`** from the handoff before claiming done
5. **Bridge to humans** — if `bridge.humanDoc` is `missing`, tell the user and suggest `ak-docs bootstrap agent-docs`; if `humanDoc` is set, link it in your summary

## MCP setup (one-time)

```bash
ak-docs mcp install --cursor
```

Or paste into `.cursor/mcp.json`:

```json
{
  "mcpServers": {
    "ak-docs": {
      "command": "npx",
      "args": ["ak-docs", "mcp"],
      "cwd": "/absolute/path/to/repo"
    }
  }
}
```

## Cursor rule (paste into `.cursor/rules/doc-bridge.mdc`)

```markdown
---
description: Resolve doc-bridge handoff before editing packages
globs: packages/**/*
---

Before editing any file under packages/ or apps/:

1. Call MCP `handoff.resolve` for the owning package id
2. Read `startHere` from the handoff
3. Only modify paths under `editRoots`
4. Run every command in `checks` before finishing
5. If humanDoc is missing, surface `ak-docs bootstrap agent-docs` to the user
```

## Quick consult (no LLM)

```bash
ak-docs ask "auth is broken in staging"
ak-docs doctor --text
```
