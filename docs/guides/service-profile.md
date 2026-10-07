---
title: Service profile
description: Restrict engine capabilities for trusted hosted callers.
---

# Service profile

Restrict engine capabilities for trusted hosted callers.

## Minimal example

Use an installed `ak-docs`, or replace it with `node /path/to/checkout/bin/ak-docs.js` from a built checkout.

The trusted caller chooses the service ceiling before loading repository config.
From a built checkout, read a fixture without source execution:

```bash
set -e
work=$(mktemp -d)
cp -R tests/fixtures/sample-project "$work/repo"
(cd "$work/repo" && ak-docs discover --profile service --json)
rm -rf "$work"
```

Ignored config keys are path-only diagnostics; unavailable analysis stays in
coverage. Repository config cannot select or widen the profile. Nested local
calls cannot widen it either. Library callers supply exact repository/revision
`RepositoryReadV1` and separate `ArtifactIOV1` capabilities; register trusted
adapters directly rather than importing repository-selected modules.

## Limits

This is an engine restriction, not an OS sandbox. Callers authorize partitions,
freeze inventories, impose budgets/cancellation and isolate untrusted code.
Service denies subprocesses, agent/provider activation, federation, watchers,
legacy filesystem writes and repository-selected runtime imports. CLI index
writes require an explicit caller artifact root; ordinary service diff is
unavailable. The Action advisory uses its separate restricted acquisition path.
MCP requires injected index/document readers; unavailable tools report limits.
No profile grants publishing authority. Index/handoff wire schemas stay compatible.

See [service profile](../spec/service-profile-v1.md),
[storage I/O](../spec/storage-io-v1.md) and
[injected storage](./injected-storage.md).
