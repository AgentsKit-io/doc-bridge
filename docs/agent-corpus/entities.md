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

# Knowledge entities

Owns opt-in knowledge entity extraction. `extractKnowledgeEntities` in `src/entities/extract.ts`
builds a KnowledgeEntitiesV1 from the options in `ExtractKnowledgeEntitiesOptions`.
