---
type: module
id: doc-bridge-enrich
editRoot: src/enrich
humanDoc: /docs/spec/enrichment-overlay-v1
owner: doc-bridge-maintainers
lifecycle: active
sourceOfTruth: src/enrich
validationPath: pnpm test && node bin/ak-docs.js index
docbridge:
  covers:
    - area:src/enrich
---

# Enrich

Owns the optional, reviewable enrichment stage. `runEnrichment` in `stage.ts` resolves the
curator, reviewer and adjudicator roles (`resolveEnrichmentRoles`), feeds them context packs and
collects proposals. `context-pack.ts` builds the size-bounded packs (`buildContextPacks`,
`fitContextPack`, `DEFAULT_PACK_BYTES`). `validate.ts` checks every proposal against the snapshot
(`validateEnrichmentProposal`, `partitionEnrichmentProposals`) so invented references are rejected.
`overlay.ts` reads, seals and writes the overlay under `.doc-bridge/enrich`; `cache.ts` keys cached
agent output (`enrichmentCacheKey`). `approvals.ts` stores approvals under `.doc-bridge/approvals`,
`review.ts` lists and decides pending items, `settled.ts` records decisions so rejected findings
stay suppressed, and `stats.ts` reports cache hit rate and stability.
