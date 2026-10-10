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
  `claude`), `--attempt-budget-usd` (default `0.10`) and `--cli-version` (expected
  version, default `2.1.296`). The probed `claude --version` must match before any
  attempt. Prices are not flags; the runner's `CLI_PRICES` table is used for the
  list-price cross-check.
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
environment without `ANTHROPIC_API_KEY`, a five-minute timeout and a 4 MiB stdout
bound (truncated output is `failed`). The prompt is limited to 8 KiB. The arguments
are built by `cliArguments` with `--output-format stream-json --verbose`, the prompt
last after boolean flags only. They are the same for both scenarios except the
`--mcp-config` value and the three `mcp__doc-bridge__*` names appended to
`--allowedTools`. `--disallowedTools` also carries every other tool the doc-bridge
server lists in its live `tools/list`, probed once per run for both arms. The
flag-by-flag list and the isolation that was and was not achieved are in
[minimal-study-v1 Transport](../study/minimal-study-v1.md#transport-claude-code-cli-pilot-transport).

Setup is checked from the stream-json transcript before a result is accepted: the
init event's model, exact tool set and MCP server status (one `doc-bridge` server,
`connected`, in the doc-bridge arm; none in the repository-only arm), every tool call
inside the allowed set, and every permission denial a built-in read tool. Any other
result is `invalid-setup`.

Each attempt records `transport: "cli"`, `cliVersion`, `expectedCliVersion`,
`attemptBudgetUsd`, the init `model`, `tools` and `mcp_servers`, `toolCallsByName`,
`toolCalls` (every `tool_use` counted once by id, including refused calls),
`permissionDenials`, `inputTokens`, `outputTokens`, `cacheCreationInputTokens`,
`cacheReadInputTokens`, `numTurns`, `cliSubtype`, `isError`, `usageComplete`,
`cliReportedCostUsd` (the CLI's `total_cost_usd`, or `null`), `computedCostUsd` and
`costBasis` (the list-price computation from `modelUsage`), any `setupProblem` or
`costProblem`, `chargedUsd`, `wallTimeMs`, `status`, the private answer, and
`correctness: null` with `adjudication: "pending"`. `status` is `completed`, `failed`,
`timed-out`, `budget-exceeded`, `invalid-setup` or `invalid-cost`. Only `completed` is
treated as a successful attempt, and any other status stops the run.

Cost: the computed cost uses the `CLI_PRICES` table, with per-request tiering when
the stream carries per-message usage and an aggregate upper bound otherwise. A
computed cost that differs from the CLI-reported cost by more than a factor of two,
or a missing or invalid cost, is `invalid-cost`.

Budget: before each attempt, a non-positive remaining cap refuses the attempt. The
CLI reservation is `min(remaining, per-attempt limit)`, rounded down to 6 decimals and
passed as `--max-budget-usd`. A `completed` attempt settles to the larger of
`total_cost_usd` and the computed cost. Any other outcome is charged
`max(reservation, every valid cost)`. Nothing is retried or resumed.

Validation: `pnpm vitest run tests/study-minimal.test.ts --maxWorkers=2` covers
mocked HTTP, budgeting, usage, tools, frozen Git reads, the export of the corpus
without the answer key, and actual local MCP without a model. The CLI tests use a
fake executable in a temporary directory. It reads a behaviour file, writes a
`records.json` with its argv and whether it received an API key, then emits canned
stream-json events, exits non-zero, sleeps or prints malformed output. No real
`claude` process runs. `node scripts/study-minimal.mjs --dry-run --transport cli`
exercises the shipped command and reports zero Claude processes and zero network calls.
