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

# Execution profile

Owns the local versus service execution profile.

`withExecutionProfile`, `isServiceProfile` and `denyServiceOperation` in
`src/execution/profile.ts` scope and enforce the profile. `serviceConfig` and
`SERVICE_CONFIG_LEAVES` in `src/execution/config.ts` reduce a config to the leaves a service may
set, and `restrictServiceRead` in `src/execution/repository.ts` limits repository reads under
that profile.
