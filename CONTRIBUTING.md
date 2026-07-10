# Contributing

Thanks for helping improve `@agentskit/doc-bridge`.

## Setup

```bash
pnpm install
pnpm typecheck
pnpm test
pnpm build
```

## Development rules

- Keep Layer 0 deterministic: no LLM/API key required for `init`, `index`, `query`, `list`, gates, or MCP handoff tools.
- Do not add private-repo assumptions to public docs, examples, defaults, or tests.
- Prefer existing helpers and Node APIs before adding dependencies.
- Add or update the smallest test that would fail if the behavior regresses.
- Public contract changes must update the relevant docs under `docs/spec/` or `docs/schemas/`.

## Pull request checklist

- Run `pnpm typecheck && pnpm test && pnpm build`.
- Run `npm pack --dry-run` for package or README changes.
- Update docs and `CHANGELOG.md` when behavior changes.
- Keep examples public and reproducible.

## Releases

Use Changesets for versioned changes:

```bash
pnpm changeset
pnpm version-packages
pnpm release
```

Do not publish from a dirty worktree.
