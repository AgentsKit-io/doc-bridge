---
type: module
id: doc-bridge-stages
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

# Stage engine

Owns the staged pipeline engine, `engine.ts` in the edit root.

The stage order is fixed: `collect`, `normalize`, `reconcile`, `enrich`, `evaluate`, `report`. Only
`enrich` may be skipped. `runWorkflow` executes the stages through caller-supplied handlers and returns
the execution result.

Each run saves a manifest plus one output per stage, keyed by the stage and its input hash. Both can be
read back from a state directory, or through caller-provided artifact storage, where an expected previous
byte hash guards the manifest write.
