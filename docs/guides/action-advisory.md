---
title: Action advisory
description: Publish bounded reference evidence while preserving independent blocking gates.
---

# Action advisory

Publish bounded reference evidence while preserving independent blocking gates.

## Minimal example

Exercise the advisory producer locally from a built checkout. This uses a
checked-in fixture copied into a temporary Git repository, compares the same
exact revision twice and publishes no comment:

```bash
set -e
work=$(mktemp -d)
cp -R tests/fixtures/sample-project "$work/repo"
git -C "$work/repo" init -q
git -C "$work/repo" add .
git -C "$work/repo" -c user.name=Fixture -c user.email=fixture@example.invalid commit -qm fixture
revision=$(git -C "$work/repo" rev-parse HEAD)
node bin/ak-docs.js action snapshot --root "$work/repo" --revision "$revision" --output "$work/snapshot.json"
node bin/ak-docs.js diff --advisory --base "$work/snapshot.json" --head "$work/snapshot.json" --root "$work/repo" --repository AgentsKit-io/doc-bridge --pr 1 --index-source ci-built --output "$work/advisory.json"
rm -rf "$work"
```

For PR use, select an audited immutable Action release containing the new inputs
and an exact engine version. `index-source: committed` remains the default:
missing/stale committed indexes fail. `ci-built` builds an isolated index when
absent, but cannot clear detected committed drift. Opt into `advisory: 'true'`
for the bounded report and separately `comment: 'true'` to create/update one
engine-owned comment. Blocking gate outcomes remain independent.

## Limits and permissions

Default to `pull_request`. Keep analysis unprivileged with `contents: read`;
only an isolated trusted publisher receives `pull-requests: write`. Forks,
read-only tokens and permission failures fall back to summary/annotations.
Never execute head scripts, modules or Actions with write credentials, including
under `pull_request_target`. Both exact objects must already be available;
analysis performs no fetch. Missing/unsupported/limited analysis is unavailable,
not zero findings. The publisher checks current repository/PR/revision bindings,
author and marker; serialize publishers with the Marketplace concurrency group.

The advisory includes historical/generated findings but does not apply policy
or version exclusions, propose patches or accept changes. The local example
proves producer execution only; real token permissions, comment delivery and
concurrency require live PR verification. Follow artifact retention and cleanup
instructions in the Marketplace guide.

See [Marketplace contract](../MARKETPLACE.md),
[Action CLI](../spec/cli.md#action-analysis-commands) and
[change sets](../spec/change-set-v1.md).
