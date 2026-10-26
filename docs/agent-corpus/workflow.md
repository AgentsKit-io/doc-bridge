---
type: module
id: doc-bridge-workflow
editRoot: src/workflow
humanDoc: /docs/spec/storage-io-v1
owner: doc-bridge-maintainers
lifecycle: active
sourceOfTruth: src/workflow
validationPath: pnpm test && node bin/ak-docs.js index
docbridge:
  covers:
    - area:src/workflow
---

# Workflow

Owns the staged workflow engine in `engine.ts`. `WORKFLOW_STAGES` lists the stages in order:
collect, normalize, reconcile, enrich, evaluate, report; `OPTIONAL_WORKFLOW_STAGES` marks `enrich`
as skippable. `runWorkflow` executes the stage handlers and records a manifest plus one step
artifact per stage keyed by input hash. `loadWorkflowManifest` and `loadWorkflowStepOutput` read a
local state directory; `readStoredWorkflowManifest`, `writeStoredWorkflowManifest` and the
`*StoredWorkflowStep` functions do the same through injected artifact storage.
