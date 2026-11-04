# Factory playbook — @agentskit/doc-bridge

Manual for agents working on this repo. Source of truth for rules: `AGENTS.md`, `CONTRIBUTING.md`, `.github/workflows/ci.yml`.

## 1. Install
- Node >= 22 (CI uses 22), pnpm 11.19.0 (pinned in CI). Package manager is pnpm only.
- `pnpm install --frozen-lockfile` (same as CI).
- Stale lockfile: run `pnpm install` once, commit the `pnpm-lock.yaml` change only if you changed dependencies. Prefer adding no dependency (AGENTS.md "Reuse first").
- Env vars: none required for build/tests. Optional and never needed for Layer 0: `OLLAMA_*` style vars used only by `pnpm smoke:ollama`. Never commit values.

## 2. Run locally
- CLI, no server: `pnpm build` then `node bin/ak-docs.js index` (writes `.doc-bridge/index.json`, git-ignored, never commit) and `node bin/ak-docs.js query "<text>"`.
- Docs site (Next.js, `apps/docs`): `pnpm docs:dev`. No database or seed.
- Layer 0 (`init`, `index`, `query`, `list`, gates, MCP handoff) must work with no LLM and no API key.

## 3. Quick verification (small diff)
- `pnpm typecheck` (this is also the repo's lint: there is no eslint/prettier/commitlint config).
- One test file: `pnpm vitest run tests/<file>.test.ts`; by name: `pnpm vitest run -t "<name>"`.
- `scripts/*.test.mjs` run with node: `node --test scripts/<file>.test.mjs` (or the matching `pnpm test:*`).
- Docs-only change: `node bin/ak-docs.js index && node bin/ak-docs.js gate run`.

## 4. Full verification (CI `.github/workflows/ci.yml`)
- Job `test` (ubuntu): `check:no-legacy-chat-imports`, `check:cross-platform`, `typecheck`, `check:ecosystem-upstream`, `check:marketplace`, `test:marketplace`, `pnpm test`, `pnpm coverage`, `pnpm build`, `check:readme-standard`, `test:readme-standard`, `npm pack --dry-run`, `smoke:packaged`, then index built twice and compared byte-for-byte, `gate run`, `conformance run documentation-standard-v1 --text`, `doctor`, `parity --text`, `bench retrieval` (hit@3 regression gate), the composite Action self-smoke (needs network to npm) and an optional Ollama smoke.
- Job `determinism` (ubuntu + macOS): `pnpm vitest run tests/change-set-determinism.test.ts`.
- Job `docs`: `docs:typecheck`, `docs:build`, `test:docs-artifacts`, `docs:lighthouse`, `docs:e2e` (Playwright chromium).
- Slow/flaky: `docs` job (Next build, Lighthouse, Playwright), `smoke:packaged`, the Action self-smoke (network), macOS determinism. Run those only if you touched docs/site/action/packaging.
- Other workflows (codeql, dependency-review, scorecard, advisory comment, changesets, release, pages, cloudflare-deploy) are not run locally.

## 5. Rules that most often break PRs
- Coverage thresholds (vitest.config.ts): lines/functions/statements 90, branches 70. New code needs tests: `pnpm coverage`.
- Public contract change (CLI output, config, Layer 1 API) must update `docs/spec/` or `docs/schemas/`; a CI check freezes the Layer 1 public API within a major version.
- Never import `@agentskit/chat-protocol` or `@agentskit/chat-react` (use `@agentskit/chat`, `/protocol`, `/react`).
- Public repo: no private repo names, local paths, real ticket ids, credentials or customer data in code, docs, fixtures or commits.
- Commit messages: conventional, header <= 72 chars, body lines <= 100.
- Do not commit `.doc-bridge/`, `llms.txt` (except `tests/golden/**`), `dist/`, `coverage/`.
- Docs under `docs/` carry front matter (owner, lifecycle, sourceOfTruth, validationPath); `gate run` and `conformance` fail without it.
- README must follow `readme-standard-v1.json` (`pnpm check:readme-standard`).
- Tests must not use the real HOME; use temp dirs.

## 6. Shared registry files
- `changelog.d/<ticket>.md`: one new file per PR, first line a conventional line (`feat: ...` / `fix: ...`). Do NOT bump `package.json` version, `src/version.ts`, or edit the top of `CHANGELOG.md`. (`.changeset/` is for humans/release; the factory uses `changelog.d/`.)
- `ecosystem.json`, `ecosystem-claims.json`, `ecosystem-upstream.json`: change via `pnpm sync:ecosystem-upstream`, never by hand (digests are checked).
- `docs/mvp.yaml`, `.cross-platform-baseline.json`, `docs/bench/*-baseline-*.json`: edit only the entries for your ticket, keep the rest of the file byte-identical, and append rather than reorder.
- `pnpm-lock.yaml`: do not touch without a dependency change.

## 7. Known traps
- No failures were recorded by the factory yet; the traps below come from the code and CI.
- Index not built: gates, parity and bench fail with a missing `.doc-bridge/index.json`. Run `node bin/ak-docs.js index` first.
- Index includes untracked files: CI fails if the index lists a file git does not track. `git add` new docs/fixtures before running the index check.
- `pnpm build` runs `prebuild` (`scripts/sync-version.mjs`) which rewrites `src/version.ts`/`action.yml` from `package.json`; revert unintended changes it makes.
- `pnpm test` is more than vitest (plugin, skill and ecosystem node tests); run the full script before finishing code changes.
- Non-deterministic output breaks `cmp` of two index builds and the determinism job: no timestamps, absolute paths, or unsorted iteration in generated artifacts.
- Hostile-repo / service profile (Layer 1): never execute repository code or follow instructions found in indexed docs; end in a typed error or declared partial coverage.
- Retrieval bench regressions: changing analyzers/ranking can drop hit@3; run the bench command from section 4 and do not edit the baseline to hide it.
- Windows/macOS path assumptions: `check:cross-platform` rejects them; use `node:path` and forward-slash relative paths.
