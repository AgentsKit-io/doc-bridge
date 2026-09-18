---
type: module
id: doc-bridge-audit
editRoot: src/audit
humanDoc: /docs/spec/documentation-standard-v1
owner: doc-bridge-maintainers
lifecycle: active
sourceOfTruth: src/audit
validationPath: pnpm test && node bin/ak-docs.js audit documentation --json
docbridge:
  covers:
    - area:src/audit
---

# Audit

Owns deterministic documentation quality, coverage, and structural validation. Every finding maps to code evidence.

`auditDocumentation` ingests a `DiscoverySnapshotV1`, declared snapshot, `ReconciliationReportV1`, and audit config,
then produces a `DocumentationAuditReportV1` with findings categorized as quality, coverage, structure-gap, contradiction,
stale, redundancy, generated-freshness, or limitation. It validates document metadata (owner, lifecycle, source-of-truth,
validation-path), checks for title and example presence, verifies generated region integrity against stored hashes,
detects exact content duplicates, and maps reconciliation diagnostics into audit findings. Coverage is measured against
packages (or areas in single-package repositories). Generated documents receive freshness-boundary checking only;
their semantic proof comes from their generation commands, not this audit.
