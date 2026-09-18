---
type: module
id: doc-bridge-bin
editRoot: bin
humanDoc: /docs/spec/cli
owner: doc-bridge-maintainers
lifecycle: active
sourceOfTruth: bin
validationPath: pnpm test && pnpm smoke:packaged
docbridge:
  covers:
    - area:bin
---

# Entry points

Owns the two executables `package.json` publishes, and nothing else. Both are deliberately thin: logic
belongs in `src`, where it is typechecked and tested.

`ak-docs.js` imports `runCli` from **`../dist/cli/program.js`** — the built output, not the source — and
sets `process.exitCode` from what it returns, awaiting it when it is a promise. Running from `dist` is
why `scripts/prepare.mjs` has to build on a git install; a change here that reaches into `src` would
break the published package.

`ak-verify.js` resolves the `@agentskit/harness` CLI through `import.meta.resolve` and spawns it as a
child process with inherited stdio, so the harness owns its own output and exit code.
