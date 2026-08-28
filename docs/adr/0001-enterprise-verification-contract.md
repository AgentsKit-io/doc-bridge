# ADR 0001: Enterprise verification contract

- Status: Accepted
- Date: 2026-08-28
- Decision owners: Doc Bridge maintainers

## Context

Doc Bridge needs one completion contract for local development, proof-of-concept work, and enterprise validation. The contract must be machine-readable, resumable, auditable, and fail closed when a surface, metric, approval, or applicability decision is missing. It must also remain low-friction for a new repository.

## Decision

Keep the verification engine as a versioned, dependency-free module in the existing CLI harness. Add named profiles, explicit surface applicability, a validated state-transition graph, and immutable baseline metadata to the existing JSON run record. Use atomic JSON files under `.codex/verification` for recovery and audit; do not introduce a database or a separate service for this contract. Enforce the policy globally, but keep the verification contract project-local because acceptance criteria and runtime surfaces are repository-specific.

The profiles are:

- `default`: low-friction local validation with conservative defaults and no hidden surface decisions.
- `strict`: the existing fail-closed behavior for declared checks.
- `poc`: allowed only with explicit, reasoned exemptions.
- `custom`: allowed only with explicit, reasoned exemptions and project-owned policy.
- `enterprise`: every surface is declared, every applicable surface has a required real check, measurement and tracking are required, and every exemption has a reason.

Applicability is declared independently for logic, CLI, MCP, UI, documentation, endpoint, and database. A surface marked not applicable must include a reason. Endpoint and database are conditional: a target that uses either must declare and execute its real check; a target that does not use it must document why it is not applicable.

The legal lifecycle is `CLARIFYING` → `PLANNED` → `VERIFYING` → a required approval/authorization state → `COMPLETE`, with `BLOCKED` and `FAILED` terminal outcomes for the current run. Runs are never promoted by a failed or stale artifact. Re-running an unchanged pending or completed input is idempotent; a changed source revision, contract, or harness version creates a new run.

## Alternatives considered

- A database-backed workflow: rejected because it adds operational cost and a new failure surface to a local CLI problem; atomic JSON already provides the required recovery and audit trail.
- A single `enterprise` boolean: rejected because named profiles make policy visible, composable, and testable.
- Inferring endpoint/database applicability from package metadata: rejected as unsafe; metadata cannot prove runtime behavior, so the decision remains explicit and is verified by real checks.

## Consequences

The JSON contract gains strict validation and some existing configs will need explicit profile or surface reasons. Repositories without a contract must stop in `CLARIFYING` until a human defines one. In return, agents and humans receive the same policy, state, evidence, and run ID, and completion cannot be claimed from compilation or unit tests alone.
