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

`ak-docs search <term> --agent` returns up to eight bounded matches and optional `telemetry` as an **AgentSearch** payload. The agent shape omits ranking scores because they are diagnostic, not routing instructions. `telemetry.contextBytes` and `telemetry.estimatedTokens` measure only the selected matches and next commands; `tokenMethod: "estimate"` is explicit and must not be reported as provider usage.

Natural-language discovery is deterministic as well: terms such as `find package`
can resolve a declared intent route, while change-oriented queries such as
`change zod schema` can resolve a declared change route. When one of these
routes is the best match, the agent payload is focused on up to three routes of
that type and provides the corresponding follow-up command. A change route is
demoted when the query expresses no change intent, so it stays reachable when
nothing better matches without crowding an ordinary question.

## How results are ranked

Ranking is deterministic — no model, no embeddings — and has three parts.

**Evidence** is field-weighted BM25 over each record's id, exported symbols, title, path, tags,
description and body. BM25 is what makes a term appearing in nearly every document worth almost
nothing, and a term in a short title worth more than the same term buried in a long body. Weights
and parameters are [configuration](./spec/config-v1.md#retrieval-optional), recorded in the index
so a retuned ranking is a visibly different artifact.

**Identity** boosts a record the query names rather than describes: an exact id, an exact file
path, a directory, or an exported symbol. This is why `reconcileKnowledge` resolves to the module
that exports it and `src/mcp/server.ts` resolves to that file, instead of to whichever document
mentions them most often.

**Priors** nudge toward the kind of record the query shape asks for — an ownership route for a
routing question, a module for a symbol or path, a document for a sentence. They multiply the
evidence rather than adding to it, so a favoured record still needs a real match: a prior can
never invent an answer, only order the ones that exist.

Results below a third of the best score are dropped. Retrieval exists to spend fewer tokens, and
a list of weak matches spends them for nothing.

### What the lexicon does

Queries and indexed text go through one tokenizer, so a term can never be present on one side and
absent on the other:

- English and Portuguese stopwords are dropped, which is why `search and` returns nothing at all
- `reconcileKnowledge` also indexes `reconcile` and `knowledge`; `src/mcp/server.ts` also indexes
  its segments
- accents fold, so `reconciliação` and `reconciliacao` are the same term
- plurals collapse, so `schema` finds `schemas`
- CJK text, which has no spaces, is indexed by character and character bigram

The lexicon's version is recorded in `index.retrieval.lexiconVersion` and is part of the index
content hash, so changing it is a new artifact rather than a silent change of behaviour.

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

- [Retrieval benchmark](./bench/README.md) — what "the right result" measures, and the gate  
- [Guide: Index and query](./guides/index-and-query.md)  
- [For agents](./for-agents.md)  
- [CLI reference](./spec/cli.md)  
- [MCP](./mcp.md)  
