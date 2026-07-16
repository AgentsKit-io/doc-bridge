---
title: Memory pipeline
description: Digest agent notes, classify them, and promote reviewable documentation drafts — never silent auto-merge.
---

# Memory pipeline

Agent sessions leave durable learnings in local files. Doc Bridge **ingests**, **classifies**, and **promotes** them into draft documentation that humans review. Nothing lands in the corpus without a PR.

## Sources (Layer 0)

| Source | Path pattern |
| --- | --- |
| Agent memory notes | `.agent-memory/**/*.md` |
| Cursor rules | `.cursor/rules/*.mdc` |

No API key. Classification is deterministic.

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
