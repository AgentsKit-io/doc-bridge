---
title: Minimal study runner v1
description: Separate optional execution contract for a six-task paired pilot and full study.
---

# Minimal study runner v1

`scripts/study-minimal.mjs` is an optional research runner, separate from the
Layer 0 CLI and existing controlled-study schemas. Its complete method, pinned
corpus, rubric, operational prerequisites and privacy rules are in
[minimal-study-v1](../study/minimal-study-v1.md). The JSON manifest is authoritative
for task wording, expected propositions, revisions and scenario/repetition counts.

`--dry-run` validates the matrix without network, credentials or Claude processes;
optional roots add clean pinned-corpus/source checks. `--pilot` selects two paired
observations; `--run` selects 36. Execution additionally requires `--approve-budget`,
the model, a positive cumulative USD cap, required corpus roots and a new private
outside-checkout output path.

`--transport` selects the provider path:

- `cli` (the documented pilot transport, decided 2026-10-09; pass it explicitly): one fresh
  headless Claude Code child per attempt, authenticated by the CLI's own login. The
  child never receives `ANTHROPIC_API_KEY`, and the runner never reads or requires it.
  Requires `STUDY_MODEL` and `STUDY_BUDGET_USD`; optional `--claude-bin` (default
  `claude`) and `--attempt-budget-usd` (default `0.25`). Prices are not needed.
- `http` (option, kept and tested): Messages API over built-in `fetch`. Requires the
  environment-only `ANTHROPIC_API_KEY`, positive upper input/output prices, and the
  cumulative cap.

The default when `--transport` is omitted is `http`, so existing invocations keep
their behaviour.

The private JSON ledger records protocol/runner hashes, corpus pins, engine
revision/CLI bundle hash, model/prices, pilot/full mode, reserved/measured budget,
observations and run status. Its `adjudication` field declares `method: "agent"`
and `humanReview: false`. Each observation records task/scenario/repetition,
provider input/output tokens, usage completeness, tool-call count, elapsed milliseconds, terminal
status, private answer, `correctness: null` and `adjudication: pending`.
Adjudication is performed by a separate agent run that is blind to scenario
identity, as defined in the protocol.
Run status is `running`, `blocked`, or `awaiting-adjudication`; none is approval.
Failures preserve conservative reservations; no automatic retry/resume is allowed.
An observation with `usageComplete: false` contains only known prior-turn tokens;
the failed request's usage is missing, and its reservation remains charged.

The stdout summary contains counts, usage, spend and a pilot-only extrapolated
cost, never answers or credentials. Completed means an answer returned, not that
it was correct. Correctness is agent-adjudicated; there is no human rubric review,
and every published report must say so. Publication approval by the maintainer
remains external. The model (`claude-haiku-5-5`), upper prices and pilot cap are
decided in the protocol, not in this runner. Existing `DocBridgeIndexV1`,
`AgentHandoffV1`, study schemas and hash algorithms do not change.

## CLI transport contract

`runCliAttempt` spawns the configured executable with an argument array, never a
shell string, `cwd` set to the frozen checkout, `stdin` closed, an allowlisted
environment without `ANTHROPIC_API_KEY`, a five-minute timeout and a 256,000-byte stdout
bound. The prompt is limited to 8 KiB. The arguments are built by `cliArguments`:
they are the same for both scenarios except the `--mcp-config` value and the three
`mcp__doc-bridge__*` names appended to `--allowedTools`. The flag-by-flag list and
the isolation that was and was not achieved are in
[minimal-study-v1 Transport](../study/minimal-study-v1.md#transport-claude-code-cli-pilot-transport).

Each attempt records `transport: "cli"`, the answer, `inputTokens`, `outputTokens`,
`cacheCreationInputTokens`, `cacheReadInputTokens`, `numTurns`, `wallTimeMs`,
`reportedCostUsd` (the CLI's `total_cost_usd`, or `null` when unavailable),
`chargedUsd`, `cliVersion`, `isError`, `usageComplete`, `toolCalls` (`null`, because
the result shape relied on does not report it), `status`, and `correctness: null` with
`adjudication: "pending"`. `status` is `completed`, `failed`, `timed-out`,
or `budget-exceeded`. Only `completed` is treated as a successful
attempt, and any other status stops the run.

Budget: before each attempt, a non-positive remaining cap refuses the attempt. The
CLI reservation is `min(remaining, per-attempt limit)`, passed as `--max-budget-usd`.
A valid successful result settles to `total_cost_usd`. A non-zero exit, timeout,
truncated output, unparsable JSON, missing usage or cost, or `is_error: true` is
charged the full reservation. Nothing is retried or resumed.

Validation: `pnpm vitest run tests/study-minimal.test.ts --maxWorkers=2` covers
mocked HTTP, budgeting, usage, tools, frozen Git reads and actual local MCP without
a model. The CLI tests use a fake executable in a temporary directory. It records its
arguments and whether it received an API key, then prints a canned JSON result, exits
non-zero, sleeps or prints malformed output. No real `claude` process runs.
`node scripts/study-minimal.mjs --dry-run --transport cli` exercises the shipped
command and reports zero Claude processes.
