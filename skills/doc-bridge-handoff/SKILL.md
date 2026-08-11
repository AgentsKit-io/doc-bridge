---
name: doc-bridge-handoff
description: Resolve Doc Bridge boundaries before changing code.
version: 1.0.0
author: AgentsKit
license: MIT
platforms:
  - darwin
  - linux
  - windows
metadata:
  hermes:
    tags:
      - documentation
      - coding-agents
      - repository-routing
---

# Doc Bridge handoff

Use this skill before editing a repository that contains `doc-bridge.config.json`.

1. Resolve the package or ownership id that best matches the requested change:
   - Prefer the read-only MCP tool `handoff.resolve` when it is available.
   - Otherwise run `node <skill-directory>/scripts/resolve-handoff.mjs <id>` from the repository.
2. Read every file in `readBeforeEditing`, beginning with `startHere`.
3. Keep changes inside `editRoots`. If the requested path is not covered, stop and report the missing route instead of guessing.
4. Make the smallest change that satisfies the request.
5. Run every command in `checks` before claiming completion.
6. If documentation changed, refresh the Doc Bridge index and run its gate.

If resolution fails, returns incomplete fields, or names an unknown target, stop. Do not infer edit permission from repository layout.

The resolver and MCP tools are read-only. They resolve project guidance but never authorize edits, publish changes, execute returned checks, or replace repository instructions. The skill uses no credentials and has no provider, hosted service, or AKOS dependency.

## Portable runtimes

This directory follows the open Agent Skills layout: one `SKILL.md` plus optional scripts and fixtures. It can be loaded as a local skill by OpenClaw-compatible clients, Hermes Agent, Pi, Cursor, or another runtime that supports Agent Skills and shell execution. Runtime-specific publication metadata is intentionally kept outside the skill.
