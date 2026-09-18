---
type: module
id: doc-bridge-scripts
editRoot: scripts
humanDoc: /docs/RELEASE
owner: doc-bridge-maintainers
lifecycle: active
sourceOfTruth: scripts
validationPath: pnpm test && pnpm check:ecosystem-upstream
docbridge:
  covers:
    - area:scripts
---

# Scripts

Owns the repository's build, release and verification tasks — the checks that cannot live in the test
suite because they reach outside the process: a packed tarball, a built docsite, an upstream digest.

`prepare.mjs` builds when `dist/cli/program.js` is missing, so a git install works; a published tarball
already ships `dist` and it no-ops. `sync-version.mjs` propagates one version across `package.json`,
`action.yml`, and the plugin, MCP and manifest files, so the published surfaces cannot disagree about
which release they are. `check-ecosystem-upstream.mjs` compares `ecosystem.json` and
`ecosystem-claims.json` against their upstream digests, failing when this repository has drifted from
the contract it claims to implement.

The `smoke-*.mjs` scripts exercise what is actually shipped — the packed tarball, the docsite builds,
the MCP bundle — and the `*-contract.test.mjs` scripts assert the artifact shapes consumers depend on.
A check belongs here when passing it requires the real thing, and in `tests/` otherwise.
