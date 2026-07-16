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

Current track: **`1.1.1` stable** (alpha series ended at `0.1.0-alpha.5`).

## Publish (npm + GitHub)

Stable packages are published only by `.github/workflows/release.yml` from an immutable semver tag. The workflow re-runs the complete security, test, coverage, packaged-smoke, dogfood, Marketplace-contract, and conformance matrix, publishes npm with provenance, verifies the registry result, uploads the tarball to a GitHub Release draft, and leaves final publication to the owner so the Marketplace fields can be completed first.

```bash
git tag v1.1.1
git push origin v1.1.1
```

For recovery of an existing immutable tag, use the guarded manual dispatch. Never move or recreate a release tag.

```bash
gh workflow run release.yml --ref master -f tag=v1.1.1
```

Confirm:

```bash
npm view @agentskit/doc-bridge@1.1.1 version dist.integrity
npx ak-docs@1.1.1 --version
gh release view v1.1.1 --json isDraft
```

GitHub Pages must remain configured for GitHub Actions; `.github/workflows/pages.yml` builds and deploys the Fumadocs portal from `apps/docs`.

## Publish the GitHub Action to Marketplace

Run `pnpm check:marketplace && pnpm test:marketplace`, then follow [the Marketplace guide](./MARKETPLACE.md). In the generated release draft, select the Marketplace option and categories before publishing the GitHub Release. npm success alone does not publish the listing.

## Post-publish smoke (fresh machine)

```bash
npm i -D @agentskit/doc-bridge@1.1.1
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
