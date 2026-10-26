---
type: module
id: doc-bridge-execution
editRoot: src/execution
humanDoc: /docs/spec/service-profile-v1
owner: doc-bridge-maintainers
lifecycle: active
sourceOfTruth: src/execution
validationPath: pnpm test && node bin/ak-docs.js index
docbridge:
  covers:
    - area:src/execution
---

# Execution

Owns the `local` versus `service` execution profile. `profile.ts` defines `ExecutionProfile`,
`withExecutionProfile`, `isServiceProfile` and `denyServiceOperation`, and binds configs to the
service profile (`bindServiceConfig`). `config.ts` provides `serviceConfig`, which reduces an
input config to the leaves in `SERVICE_CONFIG_LEAVES` and returns diagnostics for the rest.
`repository.ts` provides `restrictServiceRead`, which limits repository reads under that config.
