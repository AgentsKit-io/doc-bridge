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
optional GitHub draft PR flow.

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

## Validation

```ts
import { parseMemoryCandidate } from '@agentskit/doc-bridge'

const candidate = parseMemoryCandidate(JSON.parse(raw))
```
