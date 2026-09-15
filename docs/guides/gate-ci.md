---
title: Gate and CI
description: Fail stale documentation context in pull requests with Doc Bridge gates and the Marketplace Action.
---

# Gate and CI

Gates keep incomplete or stale documentation context from reaching coding agents.

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
      - uses: actions/checkout@v4
      - uses: AgentsKit-io/doc-bridge@ee756a13c006c597445c31e2643c1e8cece715d7 # v1.7.45
        with:
          config-path: doc-bridge.config.json
          package-version: 1.7.45
```

This example pins both the published stable Action release and its matching
published package version at `v1.7.45`; the checked-in package version is
`1.8.0` and is intentionally not used by this published-release example.

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
