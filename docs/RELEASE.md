---
title: Release checklist
description: Reproducible package, documentation, and registry checks for a Doc Bridge release.
---

# Release checklist — `@agentskit/doc-bridge`

## Pre-flight (local)

```bash
pnpm install
pnpm audit --audit-level low
pnpm typecheck
pnpm check:ecosystem-upstream
pnpm test
pnpm coverage
pnpm build
pnpm smoke:packaged
node bin/ak-docs.js index
node bin/ak-docs.js gate run
node bin/ak-docs.js conformance run documentation-standard-v1 --text
```

Expect: zero known vulnerabilities, coverage above the repository threshold, packaged smoke prints `packaged smoke passed`, and every required and recommended documentation rule passes without exceptions.

## Version

Alpha versions use Changesets:

```bash
pnpm changeset          # if new entry needed
pnpm version-packages   # bumps package.json + CHANGELOG from .changeset/*
```

Current track: **`1.7.45` stable**. The release includes the enterprise
knowledge-bridge, deterministic benchmark, scoped-package artifact fix, and
trusted-publishing workflow hardening.

## Publish (npm + GitHub)

Routine releases use `.github/workflows/changesets.yml`: merging a changeset
opens the version PR, and merging that PR publishes through npm Trusted
Publishing (GitHub OIDC) without `NPM_TOKEN`. The workflow runs audit,
typecheck, tests, and build before versioning or publishing.

The existing `.github/workflows/release.yml` remains the guarded recovery path
for an immutable semver tag. It also uses npm Trusted Publishing and re-runs
the complete security, test, coverage, packaged-smoke, dogfood,
Marketplace-contract, and conformance matrix.

Before the first publish, configure npm Trusted Publishing for package
`@agentskit/doc-bridge` with owner `AgentsKit-io`, repository `doc-bridge`,
workflow `changesets.yml`, and GitHub environment `npm`.

```bash
git tag v1.7.45
git push origin v1.7.45
```

For recovery of an existing immutable tag, use the guarded manual dispatch. Never move or recreate a release tag.

```bash
gh workflow run release.yml --ref master -f tag=v1.7.45
```

Confirm:

```bash
npm view @agentskit/doc-bridge@1.7.45 version dist.integrity
npx ak-docs@1.7.45 --version
gh release view v1.7.45 --json isDraft
```

GitHub Pages must remain configured for GitHub Actions; `.github/workflows/pages.yml` builds and deploys the Fumadocs portal from `apps/docs`.

## Publish the GitHub Action to Marketplace

Run `pnpm check:marketplace && pnpm test:marketplace`, then follow [the Marketplace guide](./MARKETPLACE.md). In the generated release draft, select the Marketplace option and categories before publishing the GitHub Release. npm success alone does not publish the listing.

## Post-publish smoke (fresh machine)

```bash
npm i -D @agentskit/doc-bridge@1.2.1
npx ak-docs init
npx ak-docs index
npx ak-docs query package example --agent
```

## Ecosystem dogfood (after npm is live)

1. **for-agents** — https://www.agentskit.io/docs/for-agents — add `doc-bridge.config` + CI gate in AgentsKit docs monorepo  
2. **Playbook** — https://playbook.agentskit.io/llms.txt — federation source already used in smoke  
3. **Registry** — https://registry.agentskit.io/ — ship `llms.txt` + link doc-bridge as onboarding companion  

## Do not claim

- Chat/RAG works without installing Layer 1 peers  
- Private monorepos as the public proof of scale  
