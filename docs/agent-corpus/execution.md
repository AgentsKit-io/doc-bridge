---
type: module
id: doc-bridge-execution
editRoot: src/execution
humanDoc: /docs/spec/service-profile-v1
owner: doc-bridge-maintainers
lifecycle: active
sourceOfTruth: src/execution
validationPath: pnpm test && pnpm typecheck
docbridge:
  covers:
    - area:src/execution
---

# Execution

Owns the `local` and `service` execution profiles.

`src/execution/profile.ts` defines `ExecutionProfile`, `withExecutionProfile`, `isServiceProfile`
and `denyServiceOperation`, which refuses operations not allowed under the service profile.
`bindServiceConfig` marks a config as service-bound and `serviceCoverage` reports what the profile
leaves out. `serviceConfig` in `src/execution/config.ts` reduces an input to the keys listed in
`SERVICE_CONFIG_LEAVES`. `restrictServiceRead` in `src/execution/repository.ts` wraps a repository
reader so safety limits only tighten and excluded paths are denied.
