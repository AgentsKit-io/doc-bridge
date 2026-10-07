---
title: Findings and remediation
description: Separate observed divergence, proposed correction and authenticated human decisions.
---

# Findings and remediation

Separate observed divergence, proposed correction and authenticated human decisions.

## Minimal example

Inspect an unchanged copied fixture before proposing edits; its findings are empty.
Use an installed `ak-docs`, or replace it with `node /path/to/checkout/bin/ak-docs.js` from a built checkout. The Node step unwraps the
discovery response because the CLI has no raw-snapshot export:

```bash
set -e
work=$(mktemp -d)
cp -R tests/fixtures/signature-api "$work/repo"
(cd "$work/repo" && ak-docs discover --json) > "$work/discovery.json"
node -e 'const fs = require("node:fs"); const result = JSON.parse(fs.readFileSync(process.argv[1], "utf8")); fs.writeFileSync(process.argv[2], JSON.stringify(result.snapshot))' "$work/discovery.json" "$work/base.json"
ak-docs diff --base "$work/base.json" --root "$work/repo"
rm -rf "$work"
```

A `FindingV1` records assertion identity, epistemic status, bounded evidence and
coverage. Routing policy is separate from epistemic status and is applied by default in
CLI diff/advisory output. The policy sidecar retains full records and counts;
`--no-policy` exposes raw diagnostics. `CHANGED_REFERENCE` means review-required
uncertainty, while `BROKEN_REFERENCE` requires proven removal. `findingFromChangeDiagnostic` converts
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
