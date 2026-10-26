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

Owns the local and service execution profiles.

`withExecutionProfile`, `isServiceProfile` and `denyServiceOperation` (src/execution/profile.ts) gate operations
by profile. `serviceConfig` (src/execution/config.ts) normalizes configuration for the service profile and
`restrictServiceRead` (src/execution/repository.ts) restricts repository reads. See the
[service profile contract](../spec/service-profile-v1.md).
