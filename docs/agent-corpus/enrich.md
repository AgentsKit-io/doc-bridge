---
type: module
id: doc-bridge-enrich
editRoot: src/enrich
humanDoc: /docs/spec/enrichment-overlay-v1
owner: doc-bridge-maintainers
lifecycle: active
sourceOfTruth: src/enrich
validationPath: pnpm test && pnpm typecheck
docbridge:
  covers:
    - area:src/enrich
---

# Enrich

Owns the optional, opt-in enrichment stage: proposals from curator, reviewer and adjudicator roles
are validated, approved by a human, and recorded in an overlay that never replaces observed facts.

`runEnrichment` in `src/enrich/stage.ts` resolves roles with `resolveEnrichmentRoles` and feeds each
agent the context packs built by `buildContextPacks` (`src/enrich/context-pack.ts`, bounded by
`packByteBudget` and `fitContextPack`). `validateEnrichmentProposal` and
`partitionEnrichmentProposals` (`src/enrich/validate.ts`) accept or reject raw proposals.
`readEnrichmentOverlay`, `writeEnrichmentOverlay` and `effectiveEnrichment` (`src/enrich/overlay.ts`)
persist the overlay under `.doc-bridge/enrich`. `createFileApprovalStore` and `recordApproval`
(`src/enrich/approvals.ts`) hold human decisions, and `decideEnrichment` (`src/enrich/review.ts`)
applies them. `createEnrichmentCache` (`src/enrich/cache.ts`) caches agent output, and
`enrichmentStability` and `cacheHitRate` (`src/enrich/stats.ts`) report cost and stability.
`recordDecision` in `src/enrich/settled.ts` records settled rejections.
