---
title: FindingV1
description: Evidence-backed assertion identity, epistemic status and independent routing policy.
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

`changed-reference` is produced for a cited fact's before/after value-hash
change. It remains stale-or-unverified and routes to Layer 2 review, with no
automatic remediation. Relevant identity includes the cited target and both
value hashes, not revision or line position. Before/head evidence contexts
retain those hashes; available codec summaries may describe the values, while
hash-only codecs do not invent summaries.

Default diff policy emits these unchanged strict records in a policy sidecar.
ADR/CHANGELOG references are historical; migration markers near citation
locations require interpretation. Same-repository implicit targets track the
analyzed branch; explicit or resolved another-package dependency targets keep version
eligibility. Generator references remain excluded and identify their generator.

## Optional review metadata (2.0)

`documentationUpdate` accepts only `updated-in-this-change`; absence means the
citation has no proven same-change region update. It does not resolve a finding.
`priority` optionally accepts `low` for containing-key fallback findings, with
`changedDescendantPaths` (at most 64 nonempty paths, each at most 512 characters).
The same optional fields exist on diff diagnostics. See
[attribution and region evidence](../spec/change-set-v1.md#nested-configuration-attribution-and-same-change-updates).
Legacy payloads remain accepted by new readers; older strict readers must upgrade
for new optional fields. The full findings list retains updated candidates while
separate pending and updated groups support review counts.
