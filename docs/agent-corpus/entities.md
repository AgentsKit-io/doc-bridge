---
type: module
id: doc-bridge-entities
editRoot: src/entities
humanDoc: /docs/schemas/knowledge-entity-v1
owner: doc-bridge-maintainers
lifecycle: active
sourceOfTruth: src/entities
validationPath: pnpm test && pnpm typecheck
docbridge:
  covers:
    - area:src/entities
---

# Entities

Owns opt-in knowledge entity extraction.

`extractKnowledgeEntities` (src/entities/extract.ts) builds a `KnowledgeEntitiesV1` from an index. See the
[knowledge entity schema](../schemas/knowledge-entity-v1.md) and
[ADR 0018](../adr/0018-opt-in-knowledge-entities.md).
