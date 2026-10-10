---
title: Local Studio
description: Navigate the knowledge graph and review drift on your own machine.
owner: maintainers
lifecycle: active
sourceOfTruth: docs/spec/studio-server-v1.md
validationPath: pnpm vitest run tests/studio-server.test.ts --maxWorkers=2
---

# Local Studio

Install the optional workspace alongside the engine in your project:

```bash
pnpm add -D @agentskit/doc-bridge @agentskit/doc-bridge-studio
pnpm exec ak-docs index
pnpm exec ak-docs studio
```

Open the printed local URL. Its session token grants review access: keep the
complete URL private. Studio binds only to 127.0.0.1, chooses an available port
and stays running until Ctrl-C. Restarting creates a new token. Missing optional
package errors explain installation; missing/stale index errors ask you to run
`ak-docs index`, then Refresh. Use `--config <path>` to select a project config.

Knowledge graph offers kind, area, relation and label/path filters, a frozen
layout with zoom/reset, focus on a selected entity's neighbors, and an accessible
list. Selecting an entity opens its source path, metrics, relationships and
bounded evidence references. Escape closes the pane and returns focus. Missing
metrics mean unavailable; canonicality and centrality are review signals.
Omitted counts and analysis limitations are always visible.

Drift inbox separates reference findings from correction proposals. Supply
current findings with `--findings <file>`; without an input, findings are explicitly
not analyzed. Existing enrichment/vault proposals appear from the local overlay.
Enter your reviewer identity and reason before approving, rejecting or preparing
a draft preview. The engine validates current bindings; a stale proposal cannot
be decided. Approval does not edit source files or declare findings resolved.
Rejection concerns that correction. Review errors preserve the reason text.

Prepare draft PR preview writes a local draft and prints suggested commands;
it does not execute them or contact a remote. Inspect the returned draft and
explicitly run commands only when you intend to open a draft PR. There is no
server push option. For interrupted actions, inspect approval and overlay records
before refreshing and making a new decision; retain the action journal on restart.

Search and why uses engine ranking and shows exact index hash, matched terms and
scoring components. Use the graph label filter for history entities. Previous
results stay visible while searching; Cancel stops the request. Source paths can
be copied for navigation in your editor.

## Develop with committed samples

From a repository checkout:

```bash
pnpm install
pnpm build
pnpm --filter @agentskit/doc-bridge-studio build
node bin/ak-docs.js studio --sample synthetic
```

Choose `synthetic`, `doc-bridge` or `agentskit`; all are committed contract fixtures.
Samples are read-only and lack a matching ranked search index; review and search
controls are disabled with informational guidance. Synthetic proposal
states never authorize actions. UI styling lives in `packages/studio/src/theme.css`
and canvas tokens in `theme.ts`; this foundation intentionally uses neutral styling.

```bash
pnpm --filter @agentskit/doc-bridge-studio typecheck
pnpm vitest run tests/studio-server.test.ts --maxWorkers=2
pnpm --filter @agentskit/doc-bridge-studio test:browser
```

Browser checks use the existing headless browser setup; screenshots and criterion
results go outside the repository. Human visual review is still required.
See the [security and transport contract](../spec/studio-server-v1.md) and
[design brief](../design/studio-brief.md) for limits and intended review behavior.
