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

# Enrichment

Owns the opt-in enrichment stage: context packs, proposal validation, the approval gate and the
reviewable overlay.

`buildContextPacks` and `fitContextPack` in `src/enrich/context-pack.ts` assemble bounded packs
for curator, reviewer and adjudicator roles. `runEnrichment` in `src/enrich/stage.ts` runs the
resolved roles and `validateEnrichmentProposal` in `src/enrich/validate.ts` rejects invented
references. `createFileApprovalStore` in `src/enrich/approvals.ts` records approvals under
`.doc-bridge/approvals`. `writeEnrichmentOverlay` and `effectiveEnrichment` in
`src/enrich/overlay.ts` persist and project accepted proposals, `decideEnrichment` in
`src/enrich/review.ts` applies a human decision, and `enrichmentCacheKey` in
`src/enrich/cache.ts` keys the run cache. `src/enrich/stats.ts` computes cache-hit and
stability figures, and `src/enrich/settled.ts` replays settled rejections.
