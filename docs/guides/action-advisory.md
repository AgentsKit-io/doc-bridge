---
title: Action advisory
description: Publish bounded reference evidence while preserving independent blocking gates.
---

# Action advisory

Publish bounded reference evidence while preserving independent blocking gates.

## Minimal example

Exercise the advisory producer locally from a built checkout. This uses a
checked-in fixture copied into a temporary Git repository, compares the same
exact revision twice and publishes no comment. Use an installed `ak-docs`, or
replace it with `node /path/to/checkout/bin/ak-docs.js` from a built checkout.
A repository needs `doc-bridge.config.json` for Action indexing; `ak-docs init` creates it before the fixture revision is committed:

```bash
set -e
work=$(mktemp -d)
cp -R tests/fixtures/sample-project "$work/repo"
(cd "$work/repo" && ak-docs init --no-demo)
git -C "$work/repo" init -q
git -C "$work/repo" add .
git -C "$work/repo" -c user.name=Fixture -c user.email=fixture@example.invalid commit -qm fixture
revision=$(git -C "$work/repo" rev-parse HEAD)
ak-docs action snapshot --root "$work/repo" --revision "$revision" --output "$work/snapshot.json"
ak-docs diff --advisory --base "$work/snapshot.json" --head "$work/snapshot.json" --root "$work/repo" --repository AgentsKit-io/doc-bridge --pr 1 --index-source ci-built --output "$work/advisory.json"
rm -rf "$work"
```

For PR use, select an audited immutable Action release containing the new inputs
and an exact engine version. `index-source: committed` remains the default:
missing/stale committed indexes fail. `ci-built` builds an isolated index when
absent, but cannot clear detected committed drift. Opt into `advisory: 'true'`
for the bounded report and separately `comment: 'true'` to create/update one
engine-owned comment. Blocking gate outcomes remain independent. CI-built generates
enabled Git-ignored exports, including `llms.txt`, with the trusted engine inside
the isolated exact-head capture before conformance checks. Committed mode requires
existing current exports. Tracked exports and a stale committed index are never
repaired by CI-built: run `ak-docs index`, review and commit regeneration when
committed freshness blocks.

## Limits and permissions

Default to `pull_request`. Keep analysis unprivileged with `contents: read`;
only an isolated trusted publisher receives `pull-requests: write`. Forks,
read-only tokens and permission failures fall back to summary/annotations.
Never execute head scripts, modules or Actions with write credentials, including
under `pull_request_target`. Both exact objects must already be available;
analysis performs no fetch. Missing/unsupported/limited analysis is unavailable,
not zero findings. The publisher checks current repository/PR/revision bindings,
author and marker; serialize publishers with the Marketplace concurrency group.

The advisory applies policy routing by default. Included `BROKEN_REFERENCE`,
`AMBIGUOUS_REFERENCE` and `CHANGED_REFERENCE` findings retain evidence/status;
changed references require review rather than prove breakage. Historical/generated
exclusions and pending version targets appear as counts. Full FindingV1 records
and routing counts remain in the `.diff.json` policy sidecar; `--no-policy`
restores raw findings. Deduplicated coverage is collapsed into counts and at most
five change-relevant gaps, with expected service denials shown once.

Index failures expose a bounded cause in logs and the job summary, including
missing/invalid configuration, the failing gate and required rule identifiers and
their short reasons (at most five gates and five rules per gate; 1,000 characters). The `index-report` output retains the failure
report outside the checkout until job cleanup; artifact upload is opt-in.
Advisory unavailability identifies the base/head object or diff evidence stage
and its bounded, redacted engine error, missing evidence or limit. These reports do not propose patches or accept
changes. The local example
proves producer execution only; real token permissions, comment delivery and
concurrency require live PR verification. Follow artifact retention and cleanup
instructions in the Marketplace guide.

See [Marketplace contract](../MARKETPLACE.md),
[Action CLI](../spec/cli.md#action-analysis-commands) and
[change sets](../spec/change-set-v1.md).
