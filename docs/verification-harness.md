---
title: Verification harness
description: Fail-closed, evidence-backed verification for humans and agents.
---

# Verification harness

`ak-verify` is the executable completion gate for work that must be proven, not merely compiled. Harness 1.3 also blocks failed contract outcomes and measured regressions.

```bash
ak-verify run --config .codex/verification.json --json
ak-verify status --config .codex/verification.json --json
ak-verify approve <run-id> approved --by human --config .codex/verification.json
ak-verify authorize <run-id> approved --by human --config .codex/verification.json
ak-verify baseline replace benchmarks/new.json approved --by human --config .codex/verification.json
ak-verify clean --periodic --config .codex/verification.json
```

The contract is JSON so it works without adding a YAML runtime. It declares the artifact surfaces that apply to the run, executable checks, explicit non-applicable reasons, the verification profile, and tracking policy.

## Global policy and project contract

The `ak-verify` executable is portable: any repository can run it from the
published Doc Bridge package. The verification contract remains project-local
at `.codex/verification.json` because endpoints, databases, UI flows, checks,
acceptance criteria, and tracking targets differ by repository.

The host-level agent policy is global and requires that every repository have
this project contract before implementation or verification. A repository
without it is `CLARIFYING`; agents must ask the human to define or authorize
the contract instead of selecting a default profile or inventing checks. This
combination provides one global completion rule without pretending that one
set of repository-specific checks fits every project.

Before implementation, the human intent and acceptance criteria must be explicit. Every criterion must map to an executable check and its expected evidence. If a criterion is not mapped, the run is `CLARIFYING` or `BLOCKED`; a project may not silently shrink the scope to the checks that are easiest to run.

## States

`CLARIFYING` → `PLANNED` → `VERIFYING` → `AWAITING_HUMAN_APPROVAL` / `AWAITING_AUTHORIZATION` → `COMPLETE`.

Any failed required check, unavailable required surface, or unmapped acceptance criterion produces `BLOCKED` or `CLARIFYING`. The harness never promotes a run from `BLOCKED`, `AWAITING_HUMAN_APPROVAL`, or `AWAITING_AUTHORIZATION` to `COMPLETE` without the corresponding evidence and intent. A `COMPLETE` result applies only to the declared contract and must not be described as broader product validation when the broader scope was not declared.

`default` is the low-friction profile used when `profile` is omitted. `strict` keeps fail-closed validation for the declared contract. `poc` and `custom` require explicit exemptions, which are included in the run evidence and cannot be silently hidden. `enterprise` requires all seven surfaces to be declared, requires measurement and tracking, and does not accept silent exemptions.

The seven applicability surfaces are `logic`, `cli`, `mcp`, `ui`, `docs`, `endpoint`, and `database`. A surface marked not applicable must include a reason. Endpoint and database validation remains conditional on the target: if the target uses one, declare a required real check; otherwise declare why it is not applicable.

## Evidence and recovery

Runs live under `.codex/verification/runs/<run-id>/run.json`. The latest pointer is `.codex/verification/latest.json`. Commands are captured with exit code, duration, stdout, stderr, source revision, configuration hash, and input hash. Re-running an unchanged pending or completed run is idempotent; changed source or contract creates a new run.

Checks may emit one final JSON line with `status` set to `passed`, `failed`, or `pending-human-review`. Structured `failed` evidence blocks the run even when the process exits with code 0; structured pending evidence remains explicitly awaiting human approval. This prevents a visual checker from being mistaken for a successful verification merely because it launched.

Visual checks must use a real browser or an explicitly configured equivalent. A passing build is not visual approval. Endpoint, database, CLI, and MCP checks must execute their real artifact when the contract marks that surface as required.

The final evidence ledger must distinguish `validated`, `partially validated`, `not analyzed`, `blocked`, and `not applicable`. Counts such as indexed documents, package presence, or rendered reports do not prove semantic documentation/code agreement, stale-content detection, runtime wiring, or UI behavior.

When a report is shared outside its repository, configure `report.privacy: 'anonymized'`. This is separate from `safety.redactSecrets`: secret redaction does not anonymize project names, paths, identifiers, snippets, or finding messages. The privacy check must inspect the generated HTML and all lazy chunks, not only the configuration.

When `measurement.required` is enabled, the named required check must emit structured evidence with `status: "passed"`, a numeric `metrics` object, a `baselineHash`, and an empty `regressions` array. Missing or regressed measurements block completion. Baselines are explicit, versioned artifacts and are never updated implicitly by a verification run.

Baseline replacement is an explicit, human-intended operation. `baseline replace` copies a JSON baseline into the configured target only when the source and target are inside the project root and appends a hash, actor, intent, and timestamp to `.codex/verification/baseline-audit.jsonl`.

The run JSON exposes `profile`, `profilePolicy`, `applicability`, `exemptions`, `checks`, `evidenceReferences`, `metrics`, `transitions`, `sourceRevision`, `contractHash`, `outputHash`, and the exact `runId`. Approval records are bound to the input, source, contract, and output hashes of that run.

The harness only removes paths listed as task-owned and contained by configured cleanup roots. It never performs broad workspace deletion.
