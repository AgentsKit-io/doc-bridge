---
title: MemoryCandidate v1
description: Contract for reviewing and promoting durable agent memory into canonical documentation.
---

# MemoryCandidate v1

Zod schema: `MemoryCandidateV1Schema` in `@agentskit/doc-bridge`.

Portable JSON Schema export: `MemoryCandidateV1JsonSchema`.

This is the normalized shape for memory ingestion. The core ships deterministic
local ingest for Cursor rules and `.agent-memory/**/*.md`, classification into
`agent | human | playbook | discard`, safety scanning, draft generation, and an
optional GitHub draft PR flow. Configured repository-contained directories and
adapter selection use [config v1](../spec/config-v1.md). The candidate shape
remains unchanged; classifications may additionally carry exact
[entity relations](knowledge-entity-v1.md#memory-relations) when knowledge
entities are enabled.

```bash
ak-docs memory ingest
ak-docs memory classify
ak-docs memory promote --pr --dry-run
```

## Shape

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

`ingestMemoryCandidates(root, intelligence?)` accepts the optional parsed
`DocBridgeConfigV1.intelligence` configuration. Existing one-argument callers
retain default ingestion behavior. CLI, playbook drafts and memory MCP tools
pass the project configuration through this shared entry point.

## Validation

```ts
import { parseMemoryCandidate } from '@agentskit/doc-bridge'

const candidate = parseMemoryCandidate(JSON.parse(raw))
```
