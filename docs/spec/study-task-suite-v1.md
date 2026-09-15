---
title: Study task suite v1
description: A fixed, anonymization-safe task and adjudication contract for controlled study baselines.
---

# Study task suite v1

`docs/study/task-suite-v1.json` is the canonical Phase 1 controlled task contract. It contains exactly four bounded tasks (discovery, architecture, documentation, and implementation) for each population identifier. The checked-in canonical artifact uses six stable anonymized consumer identifiers and therefore contains 24 tasks; reduced public pilots may declare a smaller population without changing the canonical artifact.

The suite is a definition, not evidence that a task was executed. Execution records belong to a later observation ledger and must retain the suite hash, protocol hash, source revision, model, scenario, replicate, and verification run ID.

## Required task fields

Every task declares:

- objective and initial context;
- allowed tools and forbidden actions;
- expected outcome, evidence requirements, and acceptance commands;
- task-specific token/runtime budget;
- every logical, endpoint, database, CLI, MCP, UI, and documentation surface, with a reason for each non-applicable surface;
- separate `success`, `partial`, `incorrect`, `incomplete`, and `blocked` rubric criteria;
- two distinguishable equivalent variants in its own variant group.

The schema rejects unknown repositories, missing categories, budget overruns, duplicate identifiers, unsafe public text, and tasks without a complete rubric. It also rejects suites whose planned execution count exceeds `maxRuns`.

## Execution plan

The canonical plan is 24 tasks × 3 scenarios × 2 model slots × 2 replicates = 288 planned executions. `selectTaskExecutions` produces a deterministic ordering from the declared seed and assigns executions of each variant to every task. Scenario order, model identity, and replicate remain explicit in each selected execution. A pilot must publish its population, task count, replicate count, and sampling plan; it must not be presented as six-repository evidence.

Run the contract through the packaged CLI:

```bash
ak-docs study tasks docs/study/task-suite-v1.json --text
ak-docs study select docs/study/task-suite-v1.json --json
```

## Adjudication

Agent output is never the adjudication result. During a real run, the deterministic evaluator receives the execution status, the bounded acceptance-check measurements (`acceptanceChecksPassed`, `acceptanceChecksTotal`, and `acceptanceChecksExecuted`), and the number of evidence items, then records an `automated` adjudication with method `deterministic-rubric-v1`. A success requires every declared check to be observed as executed and passed; missing execution telemetry is blocked rather than inferred. The evaluator returns one of the five rubric statuses without reading the provider's self-reported `taskOutcome`. Human adjudication remains required for semantic correctness, documentation quality, and any claim that cannot be proven by the declared artifact checks.

No baseline is approved by creating or selecting the suite. Baseline execution, comparison, and immutable approval are separate phases.
