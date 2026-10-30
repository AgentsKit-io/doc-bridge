---
type: module
id: doc-bridge-execution
title: Execution and service profiles
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

Owns the execution profile under `src/execution`.

`executionContext` and `withExecutionProfile` in `src/execution/profile.ts` set a local or service profile, and `denyServiceOperation` rejects operations a service profile does not allow. `serviceCoverage` reports the scopes left not-analyzed. `serviceConfig` in `src/execution/config.ts` and `restrictServiceRead` in `src/execution/repository.ts` restrict configuration and repository reads for service callers.
