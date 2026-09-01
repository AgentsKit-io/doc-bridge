---
title: Controlled study runner v1
description: Isolated, bounded, provenance-preserving execution for the controlled study baseline.
---

# Controlled study runner v1

`ControlledStudyRunPlanV1` binds a task suite to one source revision, protocol hash, configuration hash, Doc Bridge version, two pinned model configurations, the three study scenarios, and a deterministic sampling policy. A plan is content-addressed and cannot be treated as a baseline merely because it parses.

The default `balanced-task-strata` strategy preserves the original study sample. The `pairwise-task-strata` strategy selects exactly two declared scenarios for every selected task/model combination. It is intended for A/B comparisons such as `repository-only` versus `deterministic-doc-bridge`; the task, model, repository, and replicate remain constant across both arms.

`runControlledCommand` starts a fresh child process for each attempt with `shell: false`, a unique session identifier, bounded runtime, bounded output, and an explicit retry limit. It records only status, exit metadata, timing, byte counts, hashes, labeled token counts, and tool-call counts. Raw stdout, stderr, prompts, repository content, and credentials are never persisted in an observation.

The standard provider process contract is documented in [Study provider CLI contract v1](./study-provider-cli-v1.md). Provider selection is intentionally external to the core runner, so a hosted model CLI or an AgentsKit Registry agent can be used without bundling a local model runtime.

The runner recognizes `completed`, `failed`, `timed-out`, `unavailable`, `invalid-output`, and `budget-exceeded` outcomes. An unavailable or invalid Registry agent is evidence of a failed/blocked scenario, never a successful task result. Provider token counts are labeled `provider`; calculated counts must be labeled `estimate`.

When a provider reports labeled input and output usage and its configuration contains `pricing`, the runner also records `agentCostUsd` using the configured USD rates. Missing pricing or missing usage remains missing data. Independent adjudication is a separate `study adjudicate` command and records its own actor, method, token usage, and optional `adjudicatorCostUsd`; provider output is never used as its own approval.

The current Codex plan uses a calibrated ceiling of `400000` tokens per task. This ceiling was raised only after a real pilot measured `331325` input tokens for a repository-only discovery task; the pilot remains a budget finding and is not counted as a successful observation. The ceiling is a safety bound, not a target, and the study still reports the measured token distribution. The current run selects 24 tasks, one per task, balanced across the six model×scenario strata (four tasks per stratum), and permits one attempt per task to avoid duplicate spend after the pilot showed the cost of retries.

`ControlledStudyObservationV1` keeps model, scenario, task, variant, replicate, source, plan, and run provenance together with an automated deterministic or human adjudication state. The runner does not approve semantic results. `upsertControlledStudyObservation` is idempotent for the same run/task and rejects conflicting replacements; ledger hashes make changes detectable. Provider token usage also produces the explicit `providerTokenCostUnits` measurement: one unit is one provider-reported input or output token, not a currency claim.

An observation may also record `round`, `taskOutcome`, `evidenceQuality`, `safetyOutcome`, `clarificationRequests`, `reworkCount`, and bounded numeric `measurements`. The measurement envelope is extensible; the v1 metrics calculator reserves names for search hit rate, acceptance checks, errors, documentation findings/examples/freshness/quality, and analysis or Registry-agent cost. Unknown measurements are preserved for future metric versions but are not interpreted automatically.

Validate and inspect the committed plan and ledger with:

```bash
ak-docs study plan docs/study/run-plan-v1.json --text
ak-docs study ledger docs/study/observation-ledger-v1.json --text
```

Use `ak-docs study run ... --dry-run` with a provider CLI configuration and six local repository roots to validate the planned sample before execution. A real run requires those explicit operational inputs and persists the ledger after each observation for recovery. For a pairwise run, set `sampling.strategy` to `pairwise-task-strata`, list two `sampling.scenarioIds`, and set `sampling.sampleSize` to a multiple of the model/scenario stratum count. The full pairwise matrix for 24 tasks and two models is 96 observations; it must use a separately hashed run plan and run ID.

The committed ledger contains pilot, reduced-sample, and failed structured-provider observations. Failed observations remain immutable evidence; a recovered provider run must use a new run identifier and must not overwrite them. Use a new round identifier when the recovery is a separate experimental round; same-round recovery is valid only when the report explicitly selects the run IDs.
