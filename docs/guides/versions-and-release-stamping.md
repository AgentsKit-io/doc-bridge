---
title: Versions and release stamping
description: Route caller-supplied release evidence with ecosystem-owned version comparisons.
---

# Versions and release stamping

Route caller-supplied release evidence with ecosystem-owned version comparisons.

## Minimal example

Release stamping and eligibility have no CLI commands, so this library-only
example shows default eligibility on a copied package fixture from a built checkout:

```bash
set -e
work=$(mktemp -d)
cp -R tests/fixtures/signature-api "$work/repo"
DOC_BRIDGE_EXAMPLE="$work/repo" node --input-type=module <<'JS'
import assert from 'node:assert/strict'
import { discoverRepository, diffSnapshots, changeSetEligibility } from './dist/index.js'
const snapshot = discoverRepository({ root: process.env.DOC_BRIDGE_EXAMPLE })
const delta = diffSnapshots(snapshot, snapshot).changeSet
const result = changeSetEligibility(delta, {
  state: 'latest-released', source: 'implicit', evidence: [],
})
assert.equal(result.status, 'resolved')
assert.equal(result.value, false)
console.log('Unreleased delta is ineligible for latest-released documentation')
JS
rm -rf "$work"
```

Declare independent package purls in frontmatter `docbridge.targets`, with an
adapter-native/vers range, `default-branch`, or null. Explicit declarations win;
null resolves the owning dependency's lockfile version, then manifest range.
Invalid higher-priority data stays unresolved instead of falling through.
Undeclared targets follow released deltas. Workspace/default-branch targets
receive matching unreleased deltas; resolved ranges require a matching stamped
purl and an adapter comparator. Multiple targets retain independent outcomes.

## Limits

`stampChangeSet` consumes a caller event (`eventId`, tag, exact head revision,
evidence) and adapter mapping to one present purl/version. It never fetches
releases or infers release from a branch/manifest. Duplicate stamps are
idempotent; conflicting stamps require review. Ambiguous/unmatched mappings
stay unresolved. Stamping changes semantic routing identity, never approval.
The core does not assume every ecosystem uses semver. Eligibility is separate
from a finding's evidence status. Default diff/advisory
policy routes ineligible targets to `pending-version`; advisory Markdown shows
counts and the diff policy sidecar retains complete records. `--no-policy`
disables routing without changing evidence.

See [release stamping and eligibility](../spec/change-set-v1.md#release-stamping-and-eligibility),
[document targets](../spec/markdown-analyzer-v1.md#document-package-targets) and
[discovery plugins](../spec/discovery-plugin-v2.md).
