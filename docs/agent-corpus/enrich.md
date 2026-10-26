---
type: module
id: doc-bridge-enrich
title: Enrichment overlay, context packs and approvals
editRoot: src/enrich
humanDoc: /docs/PRD-knowledge-retrieval-and-enrichment
owner: doc-bridge-maintainers
lifecycle: active
sourceOfTruth: src/enrich
validationPath: pnpm test && pnpm typecheck
docbridge:
  covers:
    - area:src/enrich
---

# Enrichment

Owns the opt-in enrichment pipeline under `src/enrich`: proposals from an agent are validated against the index, stored in an overlay, and only take effect once approved.

`runEnrichment` in `src/enrich/stage.ts` runs the stage with roles resolved by `resolveEnrichmentRoles`. `buildContextPacks` and `fitContextPack` in `src/enrich/context-pack.ts` build bounded context for a proposal task. `validateEnrichmentProposal` and `partitionEnrichmentProposals` in `src/enrich/validate.ts` check proposals. `readEnrichmentOverlay`, `writeEnrichmentOverlay` and `effectiveEnrichment` in `src/enrich/overlay.ts` manage the overlay. `createFileApprovalStore` and `recordApproval` in `src/enrich/approvals.ts` hold approval decisions, `listEnrichment` and `decideEnrichment` in `src/enrich/review.ts` expose review, and `createEnrichmentCache` in `src/enrich/cache.ts` caches results. `src/enrich/stats.ts` reports stability and cost.
