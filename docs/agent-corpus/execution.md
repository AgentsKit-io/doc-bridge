---
type: module
id: doc-bridge-execution
editRoot: src/execution
humanDoc: /docs/adr/0012-caller-enforced-service-profile
owner: doc-bridge-maintainers
lifecycle: active
sourceOfTruth: src/execution
validationPath: pnpm test && pnpm typecheck
docbridge:
  covers:
    - area:src/execution
---

# Execution

Owns the caller-enforced execution profile described in ADR 0012. Everything here decides what a
`local` or `service` caller may do; it adds no feature of its own.

`profile.ts` keeps the profile in an `AsyncLocalStorage`. `executionContext` only ever escalates to
`service`, so a nested call cannot restore local capabilities. `denyServiceOperation` throws a
`not-analyzed` error naming the denied operation, and `serviceCoverage` reports the scopes a service
caller does not analyze.

`config.ts` exports `serviceConfig`, which keeps only the leaves listed in `SERVICE_CONFIG_LEAVES`,
reports everything else as an ignored diagnostic, rejects paths that escape the caller's read roots,
and turns off llms.txt, capabilities, intelligence and federation. `repository.ts` exports
`restrictServiceRead`, which wraps a caller-provided `RepositoryReadV1` so repository config can only
tighten limits and add `safety.exclude` patterns.

Add a new service-visible config key by extending `SERVICE_CONFIG_LEAVES` and its tests, never by
widening a container.
