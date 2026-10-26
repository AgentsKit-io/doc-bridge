---
type: module
id: doc-bridge-workflow
editRoot: src/workflow
humanDoc: /docs/loop-workflow
owner: doc-bridge-maintainers
lifecycle: active
sourceOfTruth: src/workflow
validationPath: pnpm test && pnpm typecheck
docbridge:
  covers:
    - area:src/workflow
---

# Workflow

Owns the staged run engine in `src/workflow/engine.ts`. `WORKFLOW_STAGES` lists the stages in order:
`collect`, `normalize`, `reconcile`, `enrich`, `evaluate`, `report`. `OPTIONAL_WORKFLOW_STAGES`
marks `enrich` as skippable.

`runWorkflow` executes the stages through `WorkflowStageHandler` functions and writes a manifest plus
one output per step keyed by input hash. `loadWorkflowManifest` and `loadWorkflowStepOutput` read a
state directory back. `readStoredWorkflowManifest`, `writeStoredWorkflowManifest`,
`readStoredWorkflowStep` and `writeStoredWorkflowStep` do the same through the storage artifact
interface.
