---
type: module
id: doc-bridge-workflow
editRoot: src/workflow
humanDoc: /docs/PRD-doc-bridge-knowledge-engine
owner: doc-bridge-maintainers
lifecycle: active
sourceOfTruth: src/workflow
validationPath: pnpm test && pnpm typecheck
docbridge:
  covers:
    - area:src/workflow
---

# Workflow

Owns the staged knowledge workflow engine in `src/workflow/engine.ts`.

`WORKFLOW_STAGES` fixes the order `collect`, `normalize`, `reconcile`, `enrich`, `evaluate`, `report`;
`OPTIONAL_WORKFLOW_STAGES` marks `enrich` as the only stage that may be skipped. `runWorkflow` executes
the stages through caller-supplied `WorkflowStageHandler`s and returns a `WorkflowExecutionResult`.

Progress is persisted as a manifest plus one output per stage, keyed by the stage and its input hash.
`loadWorkflowManifest` and `loadWorkflowStepOutput` read them from a state directory; the
`readStoredWorkflow*` / `writeStoredWorkflow*` functions do the same through caller-provided artifact
storage, with an expected previous byte hash guarding the manifest write.
