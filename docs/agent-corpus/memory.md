---
type: module
id: doc-bridge-memory
editRoot: src/memory
humanDoc: /docs/schemas/memory-candidate-v1
owner: doc-bridge-maintainers
lifecycle: active
sourceOfTruth: src/memory
validationPath: pnpm test && pnpm typecheck
---

# Memory

Owns reviewable learning ingestion, classification, and promotion. Durable knowledge becomes a documented change, never silent state.

Configured directories and deterministic adapter selection are honored by CLI,
MCP and local opt-in entity indexing. Exact safe memory evidence can link to
knowledge entities; promotion remains draft-only. See the
[memory pipeline](../guides/memory-pipeline.md) and
[entity relation contract](../schemas/knowledge-entity-v1.md#memory-relations).
