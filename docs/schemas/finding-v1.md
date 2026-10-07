---
owner: maintainers
lifecycle: active
sourceOfTruth: src/schemas/findings.ts
validationPath: pnpm vitest run tests/finding-contracts.test.ts tests/region-remediation.test.ts --maxWorkers=2
---

# FindingV1

A strict `FindingV1Schema` record separates epistemic status from policy. Fields:
`type: finding`, `schemaVersion: 1`, `id`, `category`, `assertion: {document, key}`,
`evidenceHash`, knowledge `status`, `layer: L0|L1|L2`, confidence in [0,1], diagnostic
severity, up to 64 entities and bounded evidence items, routing, coverage and
`provenance: {repository, revision, configurationHash}`.

`createFinding` hashes category, assertion locator and caller-supplied relevant
content, using the change-set category/assertion/target projection rule. Relevant
content must describe the cited assertion and removed target or ambiguous candidate
set; a whole-file hash or line position is not relevant assertion content. Revisions
and timestamps never enter identity. Evidence hash binds that same relevant content.
`findingFromChangeDiagnostic` converts deterministic diagnostics without inferring
removals or selecting an ambiguous owner. Existing diagnostic payloads remain readable.

`routeFinding` records evidence first, then applies document classification, preserving
frontmatter overrides. Historical/archived documents remain visible as `excluded`
coverage; suspicious migration context is `routed-to-L2`; generated content is excluded
and names its generator; adapter-owned version eligibility produces `pending-version`
for ineligible or unresolved targets. Routing never changes knowledge status.
