---
title: Token efficiency improvement plan
description: A versioned, evidence-driven plan for reducing agent token consumption without reducing correctness.
---

# Token efficiency improvement plan

Status: `phase-2-in-progress`

## Objective

Reduce the amount of agent context and provider usage required to complete a
correct, evidence-backed repository task. The study must distinguish payload
reduction from useful token reduction and must never trade correctness, safety,
or evidence quality for a smaller response.

The primary product metric is:

> **Tokens to correct action** — provider input and output tokens consumed from
> the start of a controlled task until the agent produces a correct,
> evidence-backed result and passes the task's applicable acceptance checks.

If a task does not reach a correct action, this metric is `null`. It must not be
estimated from an unsuccessful or merely plausible response.

## What existing evidence means

The existing study remains immutable historical evidence. It currently shows a
directional reduction in provider-token-equivalent units for one controlled
comparison, and a much larger reduction in serialized context payload for a
bounded retrieval fixture. These are different measurements.

The existing evidence does **not** yet prove a reduction in tokens to a correct
action because the independent adjudication sample recorded no semantic
successes in either comparison arm. A new protocol and a fresh baseline are
required before making a stronger claim.

## Scope

In scope:

- deterministic CLI, MCP, and retriever context delivery;
- provider token and latency attribution;
- tool calls, clarification requests, and rework;
- evidence retrieval and task acceptance;
- optional Registry-agent assistance as a separate scenario;
- anonymized, reproducible study artifacts;
- regression gates for context size, correctness, safety, and total cost.

Out of scope for this plan:

- a universal token-saving guarantee for every model or repository;
- replacing deterministic evidence with an LLM-generated summary;
- publishing raw prompts, repository content, private paths, or raw responses;
- optimizing a single model at the expense of portability;
- changing historical results to make them comparable with the new protocol.

## North-star and supporting metrics

| Metric | Definition | Direction | Evidence class |
| --- | --- | --- | --- |
| `tokens-to-correct-action` | Provider input + output tokens until a correct action passes acceptance checks | lower | controlled |
| `correct-action-rate` | Tasks with correct evidence and passing acceptance checks / eligible tasks | higher | controlled |
| `context-tokens-p95` | P95 tokens in the context supplied by Doc Bridge before task execution | lower | deterministic/provider |
| `time-to-first-evidence` | Time until the first required evidence item is found | lower | runner |
| `time-to-correct-action-p95` | P95 time among tasks reaching a correct action | lower | runner |
| `tool-calls-per-correct-action` | Tool calls used by successful tasks | lower | provider/runner |
| `clarification-rate` | Tasks requiring human clarification | lower, unless ambiguity is real | runner |
| `rework-rate` | Tasks requiring a corrective second attempt | lower | runner |
| `evidence-precision` | Returned evidence that is relevant to the declared task | higher | adjudicator |
| `evidence-recall` | Required evidence found by the workflow | higher | adjudicator |
| `safety-rate` | Tasks with no unsafe or unauthorized action | higher | acceptance |
| `total-cost-per-correct-action` | Doc Bridge + agent + adjudicator cost for successful tasks | lower | controlled |

Provider token counts and estimates are separate dimensions. A report must
label the token method for every observation and must not combine provider and
estimated values in one aggregate.

## Controlled scenarios

Every comparison uses the same task, repository snapshot, model, prompt
contract, tool configuration, and acceptance contract where applicable.

1. `repository-only`: the agent receives the repository through the declared
   baseline workflow.
2. `deterministic-doc-bridge`: the agent receives the deterministic Doc Bridge
   handoff and progressive evidence retrieval.
3. `registry-assisted`: the deterministic workflow may receive a separately
   attributed proposal from the configured Registry agent.

The Registry-assisted scenario is never merged into the deterministic result.
Its tokens, latency, cost, and failures remain separately attributable.

## Phase plan

### Phase 0 — Measurement contract and baseline hygiene

Purpose: make the study able to reject attractive but invalid token claims.

Deliverables:

- this plan, versioned and linked from the study index;
- a machine-readable `token-efficiency-v2` protocol derived from the existing
  study contract without changing historical artifacts;
- a frozen baseline manifest with source revision, protocol hash, task-suite
  hash, model configuration hashes, and run budget;
- an acceptance matrix mapping every metric to a real executable check;
- explicit rules for missing data, retries, timeouts, estimates, and baseline
  replacement;
- an anonymization review record for publication-bound artifacts.

Phase 0 acceptance criteria:

- every required metric has one collection method and one evidence location;
- `tokens-to-correct-action` is unavailable when correctness or acceptance is
  unavailable;
- provider and estimated tokens cannot be aggregated together;
- a failed, timed-out, or retried task remains visible and cannot be silently
  replaced;
- the baseline cannot be replaced by an ordinary study run;
- all public artifacts contain identifiers, hashes, counts, and classifications
  only;
- the protocol, task suite, and baseline are content-addressed;
- all criteria are executable through the repository verification contract.

### Phase 1 — End-to-end instrumentation

Add bounded telemetry at CLI, MCP, retriever, provider, and adjudicator
boundaries. Capture context bytes/tokens by layer, provider usage, cache usage,
tool calls, first useful evidence, clarification, rework, latency, and cost.

Do not optimize the retrieval algorithm until this phase can explain where
tokens are spent.

The runner now persists `contextBytes` together with `contextTokens` and an
explicit `contextTokenMethod` (`provider` or `estimate`). When the provider can
measure it, `firstEvidenceLatencyMs` is retained beside execution latency.
Provider and adjudicator token methods remain separate from byte-based context
estimates and configured USD cost. Missing fields remain missing data; they are
never reconstructed from an unsuccessful response.

### Phase 2 — Deterministic context reduction

Optimize the smallest useful context path:

- package/module routing before broad search;
- progressive disclosure from route to evidence to full source;
- explicit per-query context budgets;
- deduplicated summaries and stable evidence identifiers;
- task-specific retrieval modes for discovery, editing, debugging, and
  documentation review;
- fail-closed behavior when confidence or evidence coverage is insufficient;
- precomputed search structures where full-body scans affect latency;
- measured expansion only when the previous layer is insufficient.

Every optimization must be compared against the Phase 0 baseline and must
preserve correctness and safety.

The deterministic agent-search path now accepts a task mode and an explicit
context-token budget. It removes summaries and follow-up commands before
dropping grounded matches, reports whether truncation occurred, and fails
closed when the minimum grounded result cannot fit. The fixture benchmark keeps
the same four expected matches while reducing estimated context from 51 to 28
tokens at a 32-token budget (45.1% on that fixture only). This is a bounded
engineering signal, not a repository-wide or provider-token claim.

### Phase 3 — Correctness-valid task suite

Expand the fixed task suite so each task has:

- an expected evidence set;
- a real acceptance command or endpoint/CLI/MCP check;
- a defined safe outcome;
- success, partial, blocked, and incorrect classifications;
- a bounded recovery path.

The suite must cover discovery, architecture, documentation freshness,
documentation/code contradiction, missing documentation, and implementation.

### Phase 4 — Controlled improvement rounds

Run paired, clean-session comparisons with the low-cost and reference models.
Use fresh samples, randomized arm order, at least two replicates in the pilot,
and three replicates for confirmation when the pilot has valid semantic
successes. Report paired medians, P95 values, confidence intervals, subgroup
results, missing data, and total cost.

### Phase 5 — Product and publication gate

Expose the useful efficiency measurements through the CLI/report without
exposing private data. Publish only claims supported by the controlled results.
The report must separate payload reduction, provider-token reduction, and
tokens-to-correct-action.

## Initial success thresholds

These are guardrails, not promises:

- 100% of included observations have a valid token method or an explicit
  missing-data classification;
- no provider/estimate mixing;
- at least 90% evidence precision and recall on the fixed task suite;
- no regression in correctness, safety, or acceptance rate;
- at least 25% lower median `tokens-to-correct-action` after semantic success
  is measurable;
- at least 20% lower P95 context tokens without a quality regression;
- lower or equal total cost per correct action;
- three consecutive controlled rounds without a material regression.

If the baseline has zero correct actions, the next milestone is to repair the
task acceptance contract and evidence completeness. A token reduction claim is
not valid until successful tasks exist in both comparison arms.

## Evidence and privacy rules

Each run records source revision, protocol hash, task-suite hash, model and tool
configuration hashes, run ID, artifact hashes, budget, and validation state.

Publication-bound artifacts may contain only anonymized identifiers, metric
values, hashes, counts, timings, classifications, and limitations. They must
not contain repository contents, private paths, prompts, credentials, or raw
agent responses. Human approval remains required before publication.

## Phase 0 execution checklist

- [x] Register this plan in the study documentation.
- [x] Create and validate `token-efficiency-v2` without modifying historical
  protocol or result artifacts.
- [x] Define and hash the fresh baseline manifest.
- [x] Map each Phase 0 criterion to the verification contract.
- [x] Run deterministic protocol, privacy, documentation, and repository
  verification checks.
- [x] Record the Phase 0 run ID and unresolved limitations.

Phase 0 is complete only when every unchecked item has current evidence tied to
the same source revision and protocol hash.

Phase 0 evidence: run `1789248412380-77131-6xxoie`, source revision
`978642d64d18d39cafd920345bcb1b71b288c4f3`, and verification digest
`13a7c518d879dfdc8738df897e489a37b467aa7b4017bf52ebe458ffb9a67f0`.

## Phase 1 execution checklist

- [x] Persist a labeled context-token value without mixing it with provider
  input/output tokens.
- [x] Preserve first-evidence latency when the provider reports it.
- [x] Preserve adjudicator token provenance independently from the candidate
  provider.
- [x] Cover the new telemetry fields with executable runner tests.
- [x] Run the complete repository verification contract against the Phase 1
  source revision.

Phase 1 evidence: run `1789254057078-3613-646ec3`, source revision
`9b30fc32737316fc09d7ced0fe9b9f0953f88bf7`, and verification digest
`1043fb367e857c54ec977b6172068bdfb9f374fb9b95c9829fe0c900d35eb02a`.

Phase 1 is complete only after the final unchecked item has current evidence.

## Phase 2 execution checklist

- [x] Add task-specific deterministic search modes.
- [x] Add an explicit per-query context budget for CLI and MCP agent search.
- [x] Preserve the best grounded match while truncating lower-value context.
- [x] Fail closed when the minimum grounded result cannot fit the budget.
- [x] Measure correctness and baseline-versus-budgeted context on the public
  fixture.
- [ ] Run the complete repository verification contract against the Phase 2
  source revision.

Phase 2 is complete only after the final unchecked item has current evidence.
