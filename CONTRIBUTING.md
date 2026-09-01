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
- Dogfood AgentsKit Chat 0.4.x only: `@agentskit/chat`, `@agentskit/chat/protocol`, and `@agentskit/chat/react`. Never reintroduce `@agentskit/chat-protocol` or `@agentskit/chat-react` (`pnpm check:no-legacy-chat-imports`).
- Never commit API keys, tokens, secrets, or private repository content.

## Pull request checklist

- Run `pnpm typecheck && pnpm test && pnpm build`.
- Run `npm pack --dry-run` for package or README changes.
- Update docs and `CHANGELOG.md` when behavior changes.
- Keep examples public and reproducible.

## Why contribute?

Doc Bridge helps humans and coding agents navigate large repositories with less context and stronger evidence. The study is intentionally open and anonymized so contributors can improve the measurement surface as well as the product.

High-impact contribution areas:

- language and framework analyzers;
- documentation quality rules and contradiction detectors;
- architecture relation extraction;
- CLI, MCP, and documentation adapters;
- executable acceptance checks;
- anonymized benchmark tasks and replications;
- accessibility and report improvements.

Start with the [study overview](docs/study/README.md), run the chart check, and use the smallest reproducible example for a proposed change.

## Releases

Use Changesets for versioned changes. A merged changeset on `master` starts the
version workflow, which opens a version PR and publishes the merged version
through npm Trusted Publishing (GitHub OIDC). No npm token is stored in GitHub.

```bash
pnpm changeset
```

The npm package must have a GitHub Actions trusted publisher configured for
`AgentsKit-io/doc-bridge`, workflow `changesets.yml`, and environment `npm`.
Do not publish from a dirty worktree or run `pnpm release` locally.

Project decisions and maintainer responsibilities are documented in
[GOVERNANCE.md](GOVERNANCE.md). By participating, you agree to follow the
[Code of Conduct](CODE_OF_CONDUCT.md). Report vulnerabilities through the
private process in [SECURITY.md](SECURITY.md).
