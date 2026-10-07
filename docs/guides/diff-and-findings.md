---
title: Diff and findings
description: Compare snapshots and inspect evidence-backed documentation divergence.
---

# Diff and findings

Compare snapshots and inspect evidence-backed documentation divergence.

## Minimal example

Compare two raw snapshots from the same project. From a built repository checkout,
this example removes a cited export in a temporary signature fixture copy.
Use an installed `ak-docs`, or replace it with
`node /path/to/checkout/bin/ak-docs.js` from a built checkout. The Node step unwraps the discovery response;
there is no raw-snapshot CLI export:

```bash
set -e
work=$(mktemp -d)
cp -R tests/fixtures/signature-api "$work/repo"
(cd "$work/repo" && ak-docs discover --json) > "$work/discovery.json"
node -e 'const fs = require("node:fs"); const result = JSON.parse(fs.readFileSync(process.argv[1], "utf8")); fs.writeFileSync(process.argv[2], JSON.stringify(result.snapshot))' "$work/discovery.json" "$work/base.json"
sed '/^export const describeThing/d' "$work/repo/api.ts" > "$work/api.ts"
mv "$work/api.ts" "$work/repo/api.ts"
ak-docs diff --base "$work/base.json" --root "$work/repo"
ak-docs diff --base "$work/base.json" --root "$work/repo" --no-policy
rm -rf "$work"
```

For a real comparison, capture base and head independently from their respective
revisions; supply the matching head checkout with `--root`. The JSON contains
`changeSet`, `impact` and `findings`. Historical and current relations both
contribute review impact. Changed documentation is listed separately and may
still contain a residual divergence. Findings are deduplicated by assertion and
evidence. Policy routing is on by default: the JSON `policy` sidecar retains
complete FindingV1 records and routing counts while `findings` keeps its
diagnostic shape. Historical/generated exclusions and pending version targets
remain visible in that sidecar. `--no-policy` returns raw findings.

## Limits

`BROKEN_REFERENCE` requires a removal delta and verified surviving head citation;
missing resolution alone is uncertainty. `CHANGED_REFERENCE` records a surviving
citation to a changed target as review-required uncertainty, not proven breakage. Incomplete extraction or unavailable,
drifting head text gives `stale-or-unverified`. Competing owners produce
`AMBIGUOUS_REFERENCE`, never an arbitrary owner. Evidence includes bounded base
and verified head locations. Similarity does not prove renames. Unsupported
analysis is coverage, not an empty successful delta. Findings are advisory;
exit zero does not approve a correction.

See [change sets](../spec/change-set-v1.md), [ChangeSetV1](../schemas/change-set-v1.md)
and [CLI](../spec/cli.md#snapshot-diff).
