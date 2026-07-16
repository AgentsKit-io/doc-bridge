---
title: GitHub Marketplace
description: Add the Doc Bridge freshness gate to pull requests with a reproducible composite Action.
---

# GitHub Marketplace

Doc Bridge ships one root composite Action: `doc-bridge-gate`. It verifies the committed index and configured documentation gates without rebuilding artifacts first.

## Use it in a repository

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
      - uses: AgentsKit-io/doc-bridge@v1.2.1
        with:
          config-path: doc-bridge.config.json
```

If the index is stale, run `ak-docs index`, review the generated diff, and commit it. The Action's default package version matches its immutable release tag.

## Release-owner checklist

1. Run `pnpm check:marketplace`, `pnpm test:marketplace`, and the repository release matrix.
2. Confirm the public repository contains exactly one root `action.yml` and its name is available.
3. Push the immutable semver tag. The release workflow publishes npm, uploads the artifact, and leaves a GitHub Release draft ready for review.
4. Open that draft, select **Publish this Action to the GitHub Marketplace**, choose categories, and accept the GitHub Marketplace Developer Agreement if prompted.
5. Publish the release, then verify the listing and execute the exact consumer workflow above in a clean fixture repository.

Marketplace publication is a deliberate owner action; the workflow never moves tags and does not publish the GitHub Release before the Marketplace fields are complete.
