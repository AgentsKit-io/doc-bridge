# Rich terminal output and `ak-docs ui`

Human-facing output for a person at a terminal. Agents and CI keep the plain
JSON and text output; `richOutput` (`mode.ts`) is true only on a TTY with no
`--json`, `--text`, `--agent`, `CI`, `NO_COLOR` or `AK_DOCS_PLAIN=1`.

| File | Role |
| --- | --- |
| `mode.ts` | `richOutput({ stdout, flags, env })`, the single switch |
| `render.tsx` | One pure view per command result, `RICH_VIEWS` keyed by command id, `printRich` |
| `ask.ts` | `buildAskResult`: the ranked matches, best match, handoff and next commands |
| `services.ts` | The library calls the interactive app makes (gate, index, doctor, ask) |
| `app.tsx` | `ak-docs ui` (`runUi`): Ask, Findings, Publish and Doctor sections |

A command wires its view in after it has its result:

```ts
if (richOutput({ stdout: process.stdout, flags, env: process.env })) await printRich(RICH_VIEWS.gate(result))
else writeJson(result)
```

Each view takes the result object the command already writes as JSON
(`runGates`, the `index` payload, `runDoctor`, the diff change set, the
`exportVault` result, and `AskResult` for `ask`).

## Why `ink`, `react` and `@agentskit/ink` are regular dependencies

AGENTS.md says to reuse ecosystem packages before writing new code. The
AgentsKit Ink kit already provides the terminal chrome (`StatusHeader`,
`InkThemeProvider`, its theme colours and ✓/✗ conventions), so these views reuse
it instead of building a second terminal UI. They were optional peers while only
the Layer 1 chat used them. `ak-docs` now renders them for every human run of
`ask`, `gate`, `index`, `diff`, `doctor` and `vault`, and `ak-docs ui` needs them
to start, so an optional peer would leave the default experience failing with an
install hint. The versions are the ones already resolved in the lockfile.
