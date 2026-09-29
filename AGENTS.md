---
owner: maintainers
lifecycle: active
sourceOfTruth: AGENTS.md
validationPath: pnpm typecheck && pnpm test
---

# AGENTS.md

Instructions for coding agents working in `@agentskit/doc-bridge`. Human
contributor rules live in [CONTRIBUTING.md](CONTRIBUTING.md) and apply here too.

## Before changing code

1. Read the issue and identify its acceptance criteria.
2. Keep Layer 0 deterministic: no LLM or API key for `init`, `index`, `query`,
   `list`, gates, or MCP handoff tools.
3. Public contract changes update `docs/spec/` or `docs/schemas/`.

## Reuse first

Before adding a package or dependency, check existing AgentsKit ecosystem
packages first, then established libraries or services. Write new code only
when neither fits, and justify it in the PR's **Reuse** section.

## Verification

Run the narrowest check for what you touched (`pnpm vitest run <file>`, a
`test:*` script); run `pnpm typecheck && pnpm test && pnpm build` before the PR
is ready. CI is the merge gate.

## Boundaries

- Public repository: no private repository names, local machine paths, real
  tracker ticket ids, credentials, or private product details in code, docs,
  fixtures, or commit messages.
- Missing evidence is not success; a failing gate is not bypassed.
