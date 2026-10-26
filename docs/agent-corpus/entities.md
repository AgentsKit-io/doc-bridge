---
type: module
id: doc-bridge-entities
editRoot: src/entities
humanDoc: /docs/schemas/knowledge-entity-v1
owner: doc-bridge-maintainers
lifecycle: active
sourceOfTruth: src/entities
validationPath: pnpm test && node bin/ak-docs.js index
docbridge:
  covers:
    - area:src/entities
---

# Entities

Owns opt-in knowledge-entity extraction in `extract.ts`. `extractKnowledgeEntities` takes
`ExtractKnowledgeEntitiesOptions` and returns a `KnowledgeEntitiesV1` document.
