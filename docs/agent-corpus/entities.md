---
type: module
id: doc-bridge-entities
title: Knowledge entity extraction
editRoot: src/entities
humanDoc: /docs/spec/knowledge-query-v1
owner: doc-bridge-maintainers
lifecycle: active
sourceOfTruth: src/entities
validationPath: pnpm test && pnpm typecheck
docbridge:
  covers:
    - area:src/entities
---

# Entities

Owns knowledge-entity extraction in `src/entities/extract.ts`.

`extractKnowledgeEntities` reads a discovery snapshot and document text and records observations of exact names and cited paths, without fuzzy owner selection.
