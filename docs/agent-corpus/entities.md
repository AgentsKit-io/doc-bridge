---
type: module
id: doc-bridge-entities
editRoot: src/entities
humanDoc: /docs/adr/0018-opt-in-knowledge-entities
owner: doc-bridge-maintainers
lifecycle: active
sourceOfTruth: src/entities
validationPath: pnpm test && pnpm typecheck
docbridge:
  covers:
    - area:src/entities
---

# Entities

Owns opt-in knowledge entity extraction. `extractKnowledgeEntities` in `src/entities/extract.ts`
takes `ExtractKnowledgeEntitiesOptions` and returns `KnowledgeEntitiesV1`. Extraction is opt-in; see
ADR 0018.
