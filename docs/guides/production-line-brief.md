---
title: Context brief for a production line
description: Generate the doc-bridge handoff for a ticket, attach it to the agent brief, and record its time and cost.
---

# Context brief for a production line

`ak-docs brief` is the production-stage step that gives an agent repository
context for one ticket. It is Layer 0: deterministic, no model and no API key.

```bash
ak-docs brief --ticket-file ticket.md --title "Fix checkout receipt" \
  --out brief.md --record brief-record.json
```

It does three things:

1. Searches the index for the ticket text (building it in memory when the
   checkout has no published index) and resolves up to three matching units to
   handoffs: where to start, what to read, edit roots, and checks.
2. Quotes product context files, each bounded to 4,000 characters, at most 12.
3. Writes the brief Markdown (stdout, or `--out`) for the line to append to the
   agent's brief, and a run record (`--record`, or stdout with `--out`).

## The run record

```json
{
  "type": "doc-bridge-brief-record",
  "schemaVersion": 1,
  "ticket": "Fix checkout receipt",
  "durationMs": 42,
  "cost": { "llmCalls": 0, "tokens": 0, "usd": 0 },
  "handoffs": ["checkout"],
  "contextFiles": [{ "path": "docs/mvp.yaml", "bytes": 120, "truncated": false }],
  "briefBytes": 1830
}
```

The line copies `durationMs` and `cost` into its run registry. Generation never
calls a model, so the cost is always zero; the fields exist so the registry
shows it rather than leaving it blank.

## Onboarding a new product

A product enters with three steps, no paid tier:

1. Add `doc-bridge.config.json` (`ak-docs init`), and commit `AGENTS.md`.
2. Put the product's finishing docs and scope where the brief finds them. By
   default it quotes `docs/finalizacao/` (Markdown, YAML, JSON, text) and
   `docs/mvp.yaml`, which is the NoxCode layout. A repo with another layout
   passes `--context <path>` (repeatable; files or directories inside the
   repository, anything outside is ignored).
3. Call `ak-docs brief` from the line's production stage with the ticket text,
   append the output to the agent brief, and store the record.

Use `--no-refresh` to answer strictly from a published index instead of the
current docs.
