---
title: Query
description: Deterministic ownership and documentation lookup — no model, no re-scan of the repo.
---

# Query

The query layer reads `.doc-bridge/index.json` and performs a deterministic freshness check against the current repository inputs. It does **not** call a model. CLI and MCP query surfaces reject stale indexes before returning results; when it is stale, run `ak-docs index` first.

## Commands

```bash
# Machine-readable handoff (for agents / MCP)
ak-docs query package auth --agent
ak-docs query ownership auth --agent

# Human-readable
ak-docs query package auth --text

# Discovery
ak-docs list packages --text
ak-docs ask "where do I change billing?"
```

## What you get

An **AgentHandoff** (v1) with stable fields:

| Field | Use |
| --- | --- |
| `startHere` | First file the agent should open |
| `editRoots` | Allowed write paths |
| `checks` | Verification commands |
| `humanDoc` | Parallel human documentation |

Schema: [AgentHandoff v1](./schemas/agent-handoff-v1.md) · Index: [DocBridgeIndex v1](./schemas/doc-bridge-index-v1.md)

`ak-docs search <term> --agent` returns a bounded **AgentSearch** payload. The
default discovery mode keeps up to eight matches; task-specific modes reduce
that ceiling further:

```bash
ak-docs search "authentication" --agent --mode=editing --context-budget=128
```

Supported modes are `discovery`, `editing`, `debugging`, and `documentation`.
`context-budget` is measured in estimated tokens for the selected matches and
next commands. Summaries and follow-up commands are removed before matches are
dropped. If even the minimum grounded result does not fit, the command fails
closed instead of exceeding the budget. The response telemetry reports
`contextBudgetTokens`, `mode`, and `truncated` so a benchmark can distinguish
an intentionally bounded result from a complete result.

The agent shape omits ranking scores because they are diagnostic, not routing
instructions. `telemetry.contextBytes` and `telemetry.estimatedTokens` measure
only the selected context fields; `tokenMethod: "estimate"` is explicit and
must not be reported as provider usage.

Natural-language discovery is deterministic as well: terms such as `find package`
can resolve a declared intent route, while change-oriented queries such as
`change zod schema` can resolve a declared change route. When one of these
routes is the best match, the agent payload is focused on up to three routes of
that type and provides the corresponding follow-up command. Unrelated change
routes are not included in ordinary queries, which keeps the handoff bounded.

## When to use which surface

| Need | Surface |
| --- | --- |
| Agent about to edit a module | `query … --agent` or MCP `handoff.resolve` |
| Human browsing ownership | `query … --text` / `list packages` |
| Free-form question with known docs | `ask "…"` (local first) |
| Unresolved semantic question | Optional [Chat and RAG](./chat-and-rag.md) backend |

## Guarantees

- Same inputs → same handoff JSON (deterministic)  
- Breaking field meaning requires a **new schema version**, not silent reinterpretation of v1  
- Query surfaces and Gate/CI require a fresh index so agents never receive stale ownership

## Related

- [Guide: Index and query](./guides/index-and-query.md)  
- [For agents](./for-agents.md)  
- [CLI reference](./spec/cli.md)  
- [MCP](./mcp.md)  
