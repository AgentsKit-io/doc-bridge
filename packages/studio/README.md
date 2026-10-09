# @agentskit/doc-bridge-studio

Optional local knowledge graph, drift inbox and search/why workspace for
`@agentskit/doc-bridge`. The engine does not depend on this package's UI runtime.

Build the engine, then `pnpm --filter @agentskit/doc-bridge-studio build` and run
`ak-docs studio`. See [Local Studio](../../docs/guides/studio.md) for installation,
review workflows, samples and security. The server listens on 127.0.0.1 only;
keep its token-bearing session URL private. Draft previews never execute remote
operations. This package is a functional foundation with isolated neutral styling.
