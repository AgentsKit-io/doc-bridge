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

Owns the opt-in enrichment stage: context packs, proposal validation, the overlay, approvals and the cache.

`buildContextPacks` and `fitContextPack` (src/enrich/context-pack.ts) assemble byte-bounded packs per target.
`runEnrichment` (src/enrich/stage.ts) runs the curator, reviewer and adjudicator roles resolved by
`resolveEnrichmentRoles`. `validateEnrichmentProposal` and `partitionEnrichmentProposals`
(src/enrich/validate.ts) accept or reject proposals. Accepted proposals are stored by `writeEnrichmentOverlay`
and read back by `readEnrichmentOverlay` (src/enrich/overlay.ts). `decideEnrichment` and `listEnrichment`
(src/enrich/review.ts) drive review, `createFileApprovalStore` (src/enrich/approvals.ts) records approvals, and
`createEnrichmentCache` (src/enrich/cache.ts) caches agent output. See the
[enrichment overlay contract](../spec/enrichment-overlay-v1.md).
