---
title: Optional local Studio workspace
description: Keep the interactive graph and review transport outside the core runtime.
status: proposed
owner: maintainers
lifecycle: active
sourceOfTruth: packages/studio/package.json
validationPath: pnpm vitest run tests/studio-server.test.ts --maxWorkers=2
---

# Optional local Studio workspace

## Context

The StudioGraphV1 contract already provides bounded graph, search and why data.
The core must remain deterministic and free of UI dependencies. Interactive
review needs an authenticated local transport and a built browser application,
while existing engine operations remain the single mutation authority.

## Decision

Add one `packages/studio` workspace named `@agentskit/doc-bridge-studio`, with
React, sigma.js and graphology dependencies. Core dynamically imports its package
name only for `ak-docs studio`; optional-package installation is explicit. The
core checkout uses a development-only workspace link to exercise that command;
no runtime dependency or bundled UI enters the core package. The Studio package
peers with the engine and builds its server/SPA independently using existing tools.

Use the platform HTTP server, fixed routes, loopback binding, a per-session token,
strict same-origin checks and CSP. A serialized append-only local journal binds
request IDs to payloads and records results. Interrupted decisions fail closed;
engine approval persistence remains authoritative. Reuse graph/export/search/why,
freshness, discovery, proposal decisions and local draft writing. There is
no remote push transport in this foundation.

## Alternatives and consequences

Embedding a SPA in the core would add UI runtime and distribution weight to all
users. A separate repository would make contract/sample parity harder to test.
The workspace requires its own build and package installation, but keeps both
release and runtime boundaries explicit. Neutral theme files remain replaceable
for the later visual design. Maintainer review of this structural decision and
human visual approval are pending; passing tests cannot supply that approval.
