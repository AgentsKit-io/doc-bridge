---
title: Memory pipeline
description: Digest agent notes, classify them, and promote reviewable documentation drafts — never silent auto-merge.
---

# Memory pipeline

Agent sessions leave durable learnings in local files. Doc Bridge **ingests**, **classifies**, and **promotes** them into draft documentation that humans review. Nothing lands in the corpus without a PR.

## Sources (Layer 0)

| Source | Path pattern |
| --- | --- |
| Agent memory notes | `.agent-memory/**/*.{md,mdc}` |
| Cursor rules | `.cursor/rules/**/*.{md,mdc}` |

No API key. Classification is deterministic. Configure sources under
`intelligence.memory`:

```json
{
  "memory": {
    "ingestDir": ["notes/memory", "notes/rules"],
    "adapters": ["playbook-memory"]
  }
}
```

`ingestDir` accepts one directory or an ordered list inside the repository.
`ingestDir` overrides generic `playbook-memory` notes only; `cursor-rules` keeps
its conventional `.cursor/rules` location. `playbook-memory` emits
`agent-memory` candidates; `cursor-rules` emits `cursor` candidates. Both read
`.md` and `.mdc` recursively, including ignored notes. Defaults retain the two
sources above. Missing directories contribute no candidates, duplicate
source/path pairs are emitted once, and symlink escapes are rejected. Reads are
bounded to 4 MiB/file, 64 MiB/run and 10,000 files/directory.

`session-export` and `bootstrap-delta` currently fail with a clear unsupported
adapter error. They have no deterministic input format yet. `enabled: false`
disables ingestion; `adapters: []` selects no sources.

## End-to-end commands

```bash
# 1) Normalize raw notes → MemoryCandidate[]
ak-docs memory ingest

# 2) Route each candidate: agent | human | playbook | discard
ak-docs memory classify

# 3) Build a safe draft body (safety scan; never auto-merges)
ak-docs memory promote

# 4) Optional: open a GitHub draft PR via `gh`
ak-docs memory promote --pr --dry-run
ak-docs memory promote --pr
```

## What a candidate looks like

```json
{
  "schemaVersion": 1,
  "id": "auth-abort-signal",
  "source": "agent-memory",
  "rawPath": ".agent-memory/auth.md",
  "fact": "Auth handlers must forward AbortSignal.",
  "why": "Run cancellation must stop network work.",
  "howToApply": "Use AbortSignal.any([caller, AbortSignal.timeout(ms)]).",
  "suggestedType": "project",
  "confidence": 0.8,
  "references": ["docs/for-agents/auth.md"]
}
```

Schema: [MemoryCandidate v1](../schemas/memory-candidate-v1.md)

## Digest mental model

```text
.agent-memory / .cursor/rules
        │
        ▼
  memory ingest     →  normalized candidates
        │
        ▼
  memory classify   →  agent | human | playbook | discard
        │
        ▼
  memory promote    →  draft markdown (+ optional draft PR)
        │
        ▼
  Human review / merge   (never silent)
```

## Memory evidence in knowledge entities

With `index.knowledgeEntities.enabled: true`, local index builds add optional
`knowledgeEntities.memoryRelations`. Each `memory-supports` relation binds a
classified candidate ID to a decision, concept or change, with an exact ID,
declared alias or source document path and a SHA-256 hash of the memory fact.
Use explicit backtick references or candidate `references`, for example:

```markdown
Follow `docs/adr/0001-storage.md` when changing persistence.
```

Matching is case-sensitive and exact. Shared aliases or paths produce no
arbitrary link; fuzzy similarity and entity titles do not create evidence.
Discarded and unsafe candidates never link. Classification and promotion draft
JSON include `entityRelations` when matches exist. These are observations, not
human approval or proof that the fact is true. Promotion still writes only a
draft. Captured builds report memory as not analyzed and never consult unrelated
local notes. Default-off indexes and handoffs retain their existing shape.

Query `why` and knowledge MCP consumption of these relations is a subsequent
integration; this change establishes the typed index contract only.

## Safety guarantees

| Guarantee | Behavior |
| --- | --- |
| Draft-only | Promotion never writes the canonical corpus directly |
| Safety scan | Risky content is flagged before draft output |
| HITL | `--pr` opens a **draft** GitHub PR via `gh` |
| Deterministic | Same inputs → same classify/promote routing |

## MCP tools

When MCP is running (`ak-docs mcp`):

| Tool | Role |
| --- | --- |
| `memory.classify` | Classify candidates |
| `memory.promoteDraft` | Produce a draft promotion body |

See [MCP for agents](./mcp-agents.md).

## Playbook feedback

```bash
ak-docs playbook draft      # payload from classified memory
ak-docs playbook pattern    # published Doc Bridge pattern (OKF)
```

## Related

- [CLI map](./cli-map.md) — every command  
- [MemoryCandidate schema](../schemas/memory-candidate-v1.md)  
- [Chat and RAG](../chat-and-rag.md) — optional Layer 1 after handoffs  
- [Getting started](../getting-started.md)  
