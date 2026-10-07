---
title: DecisionV1
description: Authenticated finding or remediation rejection bound to relevant evidence.
owner: maintainers
lifecycle: active
sourceOfTruth: src/schemas/findings.ts
validationPath: pnpm vitest run tests/finding-contracts.test.ts tests/region-remediation.test.ts --maxWorkers=2
---

# DecisionV1

Strict fields: `type: decision`, `schemaVersion: 1`, `target: {kind,id}` where kind
is finding or remediation, caller-authenticated human `by`, `evidenceHash` and reason
`not-a-divergence | wrong-fix | code-should-change | out-of-scope`.

`recordDecision` requires a trusted authentication callback and exact target/evidence
binding. It persists through the existing enrichment overlay's settled rejection
records, rather than a second replay authority. A valid overlay must exist; missing
or corrupt persistence fails closed. Existing enrichment decisions remain readable.

`findingSuppressed` suppresses only matching finding/evidence. A remediation decision
marks that correction rejected through `replayRemediation`, leaving the finding open
and permitting alternate corrections. Changed relevant evidence invalidates suppression.
`code-should-change` records a disposition only; no external issue is created.
Closing a review produces no Decision and cannot approve or reject either target.
