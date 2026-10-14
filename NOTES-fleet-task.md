# Notes: opt-in publication gate (phase 1)

## Verification not run

The task environment had no `pnpm` on `PATH` (every `pnpm` invocation exited 127), and the
checkout had no `node_modules`. Installing dependencies through `npm`, `npx pnpm` or `corepack`
was refused by the environment's command allowlist. As a result, **none of the required checks
ran**:

- `pnpm typecheck`
- `pnpm test` (with `--maxWorkers=2`)
- `pnpm build`
- the "new tests fail when the implementation is reverted" check
- the retrieval benchmark comparison

The code was reviewed by reading only. Before merging, run in order:

```bash
pnpm install
pnpm typecheck
pnpm vitest run tests/publication-gate.test.ts tests/publication-gate-mcp.test.ts tests/cli-controls.test.ts tests/gates.test.ts --maxWorkers=2
pnpm test -- --maxWorkers=2
pnpm build
pnpm bench:retrieval
```

To check that the tests depend on the implementation, check out the `src/` tree from the commit
before `feat(gates): add opt-in reference-findings publication gate` and run the two new test
files: they should fail. On that tree the config schema rejects `reference-findings` and `index`
has no gate.

## Points for the reviewer to watch

- **Head analysis.** The gate uses the synchronous `diffSnapshots(base, head, { headRoot })` over
  a local `discoverRepository` head, because `runGate` is synchronous. The advisory uses
  `diffSnapshotsWithRead` over a service-profile capture. Both select pending findings with the
  shared `referenceFindingGroups`. The test `counts exactly what the advisory fail-on-findings
  counts` checks that the two counts match on a fixture.
- **Project identity.** A base taken with `ak-docs action snapshot` must share its project identity
  with local discovery, or the diff refuses it and the gate fails closed. In practice that means
  the root `package.json` names the project.
- **Out of scope.** `ak-docs action index --index-source ci-built` still writes its ephemeral
  exports before it runs the selected gates, as before. It reports `reference-findings` like any
  other gate.
- **Hash exclusion.** `publication` is excluded from `contentHashForVersionedArtifact`. No other
  artifact has that key, so existing hashes and benchmarks should not change. The benchmark run
  above is what confirms it.
