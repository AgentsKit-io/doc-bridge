---
type: module
id: doc-bridge-enrichment
editRoot: src/enrich
humanDoc: /docs/adr/0018-opt-in-knowledge-entities
owner: doc-bridge-maintainers
lifecycle: active
sourceOfTruth: src/enrich
validationPath: pnpm test && pnpm typecheck
docbridge:
  covers:
    - area:src/enrich
    - area:src/entities
---

# Enrichment and entities

Owns the opt-in, human-reviewed enrichment layer and the knowledge entities it validates against.

## Enrichment (`src/enrich`)

- `context-pack.ts` — `buildContextPacks` builds bounded packs (`packByteBudget`, `fitContextPack`,
  `batchContextPacks`) for the curator, reviewer and adjudicator roles.
- `stage.ts` — `runEnrichment` runs those roles through a caller-supplied `EnrichmentAgent`;
  `resolveEnrichmentRoles` reads the roles from config.
- `validate.ts` — `validateEnrichmentProposal` and `partitionEnrichmentProposals` accept or reject raw
  proposals against the snapshot; `applyEnrichmentAdjudication` applies an adjudicator verdict.
- `overlay.ts` — the sealed overlay stored under `.doc-bridge/enrich`; `effectiveEnrichment` drops
  accepted entries whose target changed, and `withAcceptedRelations` projects the rest.
- `approvals.ts`, `review.ts`, `settled.ts` — persisted human decisions: `recordApproval`,
  `decideEnrichment`, `listEnrichment`, and `recordDecision` for settled rejections.
- `cache.ts`, `stats.ts` — the enrichment cache keyed by `enrichmentCacheKey`, and cost and stability
  statistics.

## Entities (`src/entities`)

`extract.ts` exports `extractKnowledgeEntities`, which produces the `KnowledgeEntitiesV1` the
enrichment validators bind to (ADR 0018).
