---
type: module
id: doc-bridge-doctor
editRoot: src/doctor
humanDoc: /docs/spec/documentation-standard-v1
owner: doc-bridge-maintainers
lifecycle: active
sourceOfTruth: src/doctor
validationPath: pnpm test && node bin/ak-docs.js doctor --text
---

# Doctor

Owns health scoring and remediation guidance. Every point must trace to meaningful repository evidence.

Reachability, connectivity and the retrieval benchmark are measured from the snapshot, the
projection and the golden suite, never declared; a missing suite is `not-analyzed`, not omitted.
An A requires all three, and the grade must fall while any document is outside the projection.
