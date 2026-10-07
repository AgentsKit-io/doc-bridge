---
title: Findings and remediation
description: Separate observed divergence, proposed correction and authenticated human decisions.
---

# Findings and remediation

Separate observed divergence, proposed correction and authenticated human decisions.

## Minimal example

Inspect fixture review impacts before proposing edits. From a built checkout:

```bash
node --input-type=module <<'JS'
import assert from 'node:assert/strict'
import { discoverRepository, diffSnapshots } from './dist/index.js'
const snapshot = discoverRepository({ root: 'tests/fixtures/signature-api' })
const result = diffSnapshots(snapshot, snapshot, { headRoot: 'tests/fixtures/signature-api' })
assert.equal(result.findings.length, 0)
console.log('Unchanged fixture: no divergence findings or automatic corrections')
JS
```

A `FindingV1` records assertion identity, epistemic status, bounded evidence and
coverage. Routing policy is separate. `findingFromChangeDiagnostic` converts
deterministic diagnostics without inventing removal proof. A `RemediationV1`
proposes bounded region edits; a `DecisionV1` records an authenticated rejection
of a finding or one remediation. Rejecting the correction leaves the finding
open; changed relevant evidence invalidates suppression. Review closure is no
decision and no acceptance.

## Limits

Region APIs are library-only. Ordinary application requires exact authenticated
human approval. Revalidation checks revision/evidence/config bindings, exact
bytes and unique bounded anchors, containment, overlap and protected generated
regions. Changed displayed patches require renewed approval; failed writes or
gates trigger rollback, with retained backups reported if rollback fails.

Review presentation may write unapproved text only in a caller-attested isolated
review workspace whose default branch requires human-approved merge. It returns
`in-review`. Merge acceptance needs authenticated human approval/acceptance and
fresh merged-revision verification. Neither an agent nor config can attest its
own authority. Service mutation remains denied. Handoff caveats require explicit
opt-in/capability negotiation; legacy strict readers receive the legacy fields.

See [FindingV1](../schemas/finding-v1.md), [RemediationV1](../schemas/remediation-v1.md),
[DecisionV1](../schemas/decision-v1.md) and
[region remediation](../spec/region-remediation-v1.md).
