ci: split the `test` job into parallel `unit` and `package` jobs so the longest CI job stays under 9 min

`unit` runs typecheck, `pnpm coverage` (the vitest suite, once) and the contract tests that `pnpm test` ran; `package` runs the marketplace checks, build, packaging smoke, repository gates and the Action contract. The required `test` check now waits for both and passes only when both pass. No test or coverage threshold changed.
