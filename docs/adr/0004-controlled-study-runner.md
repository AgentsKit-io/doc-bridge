# ADR 0004: Controlled study runner and observation ledger

- Status: Accepted
- Date: 2026-08-30

## Context

The controlled study needs to compare the same bounded tasks across three scenarios and two pinned model configurations. A pass/fail result is insufficient: each observation must retain provenance, cost, timing, tool use, agent status, and adjudication state without publishing raw prompts or responses.

## Decision

Use a content-addressed run-plan, observation, and ledger contract in the existing Doc Bridge study module. Execute scenario commands as fresh non-shell child processes with per-attempt session identifiers, explicit timeout/output/token budgets, and bounded retries. Persist metadata and hashes only; keep semantic adjudication separate and pending until a human review. Registry-agent identity and failures are recorded as scenario metadata, never as deterministic evidence.

The initial plan is 24 tasks × 3 scenarios × 2 models × 2 replicates = 288 executions. Baseline collection is not implicit in plan creation or task selection.

## Alternatives considered

- Allow each model or agent to emit the final outcome: rejected because agents cannot approve their own work.
- Persist raw model transcripts in the public ledger: rejected because it violates the anonymization boundary and increases retention cost.
- Use a shell command string: rejected because shell interpretation weakens isolation and makes argument provenance ambiguous.
- Add a database before baseline collection: rejected because content-addressed JSON is sufficient for the first bounded study phase and is easier to audit/replay.

## Consequences

The runner is deterministic about scheduling and evidence shape, while model output and semantic correctness remain explicitly adjudicated. A future execution backend can replace the child-process adapter without changing the public ledger contract, provided it preserves the same budgets and provenance.
