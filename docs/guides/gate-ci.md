---
title: Gate and CI
description: Fail stale documentation context in pull requests with Doc Bridge gates and the Marketplace Action.
---

# Gate and CI

Gates keep incomplete or stale documentation context from reaching coding agents.

These recipes describe consumer repositories. In the doc-bridge repository itself,
`.doc-bridge/index.json` is ignored: generate it locally or in CI and never commit
it. Its CI checks two builds for determinism, reproducibility, and documentation
conformance rather than committed-index freshness.

## Local gate

```bash
ak-docs index
ak-docs gate run
ak-docs doctor --text
ak-docs doctor --badge
```

Typical failures:

| Symptom | Fix |
| --- | --- |
| Stale index | `ak-docs index`, review + commit generated files |
| Missing ownership | Add config ownership, frontmatter, or monorepo plugin |
| Documentation Standard gaps | Follow doctor remediations / evidence paths |

## Pull request workflow

```yaml
name: Documentation gate
on: [pull_request]

permissions:
  contents: read

jobs:
  docs:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7.0.1
      - uses: AgentsKit-io/doc-bridge@ee756a13c006c597445c31e2643c1e8cece715d7 # v1.7.45
        with:
          config-path: doc-bridge.config.json
          package-version: 1.7.45
```

This example pins the existing committed-only Action release and its matching
published package version at `v1.7.45`. Select a newer immutable release containing
the new contract before using the optional inputs below.

The composite Action verifies the **committed** index and configured gates — it does **not** silently rebuild and hide drift.

The Action runs the gates selected by the consumer's configuration. To fail on
broken human-document links, include the `human-guide-links` gate explicitly;
the minimal preset enables `index-freshness` by default, and this repository
adds `documentation-standard-v1` through `gates.include`.

If the Action fails:

1. Run `ak-docs index` locally  
2. Review the diff under `.doc-bridge/` / `llms.txt`  
3. Commit intentional updates  
4. Re-run the PR check  

## What to commit

Commit generated index artifacts your repo treats as source-of-truth (common: `.doc-bridge/index.json`, root `llms.txt`). Keep CI fail-closed when those drift from the docs corpus.

## Related

- [Marketplace details](../MARKETPLACE.md)  
- [Install and run](./install-and-run.md)  
- [Documentation Standard](../spec/documentation-standard-v1.md)  
- [Doctor / CLI](../spec/cli.md)  

## Explicit index modes and advisory results

The new Action contract defaults to `index-source: committed`. Opt into
`index-source: ci-built` only with a published Action/engine release supporting
that input. The CI artifact lives outside the checkout, carries exact-revision
provenance and is reloaded and hash-checked against a repeated build. Existing
committed drift is still reported first, and blocks when `index-freshness` is
selected. The generated artifact never replaces the checked-in index.

`advisory: 'true'` runs bounded service-profile base/head snapshots and
`ak-docs diff --advisory`. `comment: 'true'` separately requests a single updated
PR comment with `pull-requests: write`; forks and read-only tokens retain the same
report in the summary and annotations. Reference findings do not fail gates unless
`fail-on-findings: 'true'` is explicitly selected. Successful comment delivery never
clears a failed blocking gate.

Use `pull_request`, SHA-pinned trusted Action code, checkout at the declared head, and `fetch-depth: 0` with
`persist-credentials: false` so checkout supplies exact base/head objects. Analysis
makes no additional fetch. The gate stage preserves prepared ignored conformance
exports only in a clean workspace matching that exact revision; other revisions use
an isolated capture, and missing evidence remains blocking. Configure a repository/PR concurrency group with
`cancel-in-progress: false` for all publishers. Do not run untrusted head code under
`pull_request_target`, and keep write tokens out of analysis environments.

The default `engine: published` never selects checkout code automatically.
`engine: checkout` is an explicit doc-bridge self-CI exception only: it uses an
already-built engine in an unprivileged test job and forbids comment publishing.
It is not a consumer mode or a safe path for running untrusted code with privileges.

Outputs expose blocking and advisory report paths outside the checkout. Retain
those bounded artifacts only with an explicit upload/retention policy; temporary
source worktrees and runtime installs are removed. Local fixture and publisher
contract tests cannot prove live permissions, fork behavior, retries or comment
concurrency. See the [Marketplace verification matrix](../MARKETPLACE.md#verification-boundary)
for the required real PR evidence before release acceptance.

Advisory findings with verified citation-region edits in the same change are
grouped as `updated-in-this-change` for confirmation, including incomplete edits.
They remain visible but do not count as pending for `fail-on-findings`.
