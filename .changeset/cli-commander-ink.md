---
"@agentskit/doc-bridge": minor
---

The CLI looks like an app at a terminal. Help is generated per command by commander, and `ask`, `gate run`, `index`, `doctor` and `vault export` render rich Ink views (status header, ✓/✗ steps, coloured `path:line`, amber reference findings, red "Publication blocked") when stdout is a TTY. Pipes, CI, agents, `--json`, `--text`, `NO_COLOR` and `AK_DOCS_PLAIN=1` keep the plain output unchanged, and Ink is only loaded for rich output. New `ak-docs ui` opens an interactive app with Ask, Findings, Publish and Doctor tabs. `ask`, `search` and `query` answer from a rebuilt index when the published one is stale (`--no-refresh` keeps the strict behaviour), `gate run --text` prints a short report, and text output shows repository-relative paths.
