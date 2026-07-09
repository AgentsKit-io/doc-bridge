# Release checklist — `@agentskit/doc-bridge`

## Pre-flight (local)

```bash
pnpm install
pnpm typecheck
pnpm test
pnpm build
pnpm smoke:packaged
```

Expect: packaged smoke prints `packaged smoke passed` and includes demo `query package example --agent`.

## Version

Alpha versions use Changesets:

```bash
pnpm changeset          # if new entry needed
pnpm version-packages   # bumps package.json + CHANGELOG from .changeset/*
```

Current track: **`1.0.0` stable** (alpha series ended at `0.1.0-alpha.5`).

## Publish (npm)

Requires npm auth for the `@agentskit` org (`npm whoami` / `NPM_TOKEN`).

```bash
pnpm release
# equivalent:
# pnpm build && pnpm test && changeset publish
```

Or one-shot after version bump:

```bash
npm publish --access public
```

Confirm:

```bash
npm view @agentskit/doc-bridge version
npx ak-docs@0.1.0-alpha.x --version
```

## GitHub

```bash
git tag v1.0.0
git push origin master --tags
gh release create v1.0.0 --title "v1.0.0 — AgentHandoff stable" --notes-file CHANGELOG.md
```

Enable GitHub Pages (Settings → Pages → GitHub Actions) for landing deploy from `.github/workflows/pages.yml`.

## Post-publish smoke (fresh machine)

```bash
npm i -D @agentskit/doc-bridge@0.1.0-alpha.x
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
