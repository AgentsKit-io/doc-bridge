---
name: doc-bridge-handoff
description: Resolve repository ownership, documentation, edit boundaries, and required checks before changing code.
---

# Doc Bridge handoff

Use this skill before editing a repository that contains `doc-bridge.config.json`.

1. Call `handoff.resolve` with the package or ownership id that best matches the requested change.
2. Read every file in `readBeforeEditing`, beginning with `startHere`.
3. Keep changes inside `editRoots`. If the requested path is not covered, stop and report the missing route instead of guessing.
4. Make the smallest change that satisfies the request.
5. Run every command in `checks` before claiming completion.
6. If documentation changed, refresh the Doc Bridge index and run its gate.

The MCP tools are read-only. They resolve project guidance but never authorize edits, publish changes, or replace repository instructions.
