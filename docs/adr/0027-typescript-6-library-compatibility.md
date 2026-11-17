---
title: Stay on TypeScript 6 for the library
authority: maintainer decision
status: accepted
date: 2026-11-17
---

# Stay on TypeScript 6 for the library

## Context

The repository standard pins TypeScript 7 (native `tsc`) or asks for an explicit compatibility decision for a library. TypeScript 7 does not ship the JavaScript compiler API that `@agentskit/doc-bridge` loads at runtime (`import ... from 'typescript'` in `src/`) to analyze TypeScript sources. Porting the analyzers to another parser is a larger change than this standardization ticket and is outside the current MVP.

## Decision

Keep `typescript` on the 6.x line (`package.json` `dependencies`, currently `^6.0.3`) for the library, its runtime analyzers and the typecheck (`pnpm typecheck`). Do not move to TypeScript 7 until the analyzers no longer depend on the compiler API. This is the explicit compatibility decision the `ts7` readiness item asks for.

## Consequences

- `pnpm typecheck` keeps using TypeScript 6.
- Revisit when TypeScript 7 exposes a stable programmatic API, or when the analyzers move to a parser that does not need it.
