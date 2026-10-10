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

Before any reservation the runner probes `claude --version`, which must equal the
expected version (default `2.1.296`). For every checkout that a doc-bridge attempt
uses, it resolves the config file (`checkoutConfigPath`, the server's own candidate
order), probes `doc.search` at the pin (the index must be fresh at that pin), and
derives the deny list from the live `tools/list`; all checkouts must expose the same
list. Any failure refuses to start the run with nothing charged.

`runCliAttempt` spawns the configured executable with an argument array, never a
shell string, `cwd` set to an export directory created with `mkdtemp` for that
attempt alone. The export holds only the pinned corpus blobs that pass the
public-path filter (`git ls-tree` at the pin, regular files of at most 200000 bytes,
no dotfiles, no `node_modules`, `dist`, `build` or `coverage`, no lockfiles; `CLAUDE.md`
and `AGENTS.md` pass the filter and are included, and whether the CLI loads them is not
observed). Files are mode 0444 and directories 0555 after the export; the directories
are removed after each attempt with their permissions restored. The export has no `.git` and no
doc-bridge index. `stdin` is closed, the environment is an allowlist without
`ANTHROPIC_API_KEY`, and there are a five-minute timeout and a 4 MiB stdout bound
(truncated output is `failed`). The prompt is limited to 8 KiB. The arguments
are built by `cliArguments` with `--output-format stream-json --verbose`, the prompt
last after boolean flags only. They are the same for both scenarios except the
`--mcp-config` value and the three `mcp__doc-bridge__*` names appended to
`--allowedTools`. `--disallowedTools` also carries every other tool the doc-bridge
server lists in its live `tools/list`, probed once per run for both arms. The
flag-by-flag list and the isolation that was and was not achieved are in
[minimal-study-v1 Transport](../study/minimal-study-v1.md#transport-claude-code-cli-pilot-transport).

The stream is read line by line. A line that is not JSON, a transcript without exactly
one `result` event, a `result` that is not the last event, or more than one init event
is recorded as a setup problem; the last `result` event is still read so that its cost
is charged. Any setup problem makes the attempt `invalid-setup`.

Setup is checked from the stream-json transcript before a result is accepted: the
init event's model, exact tool set (no duplicates, nothing missing or extra) and MCP
server status (one `doc-bridge` server, `connected`, in the doc-bridge arm; no server
and no MCP tool in the repository-only arm), every tool call inside the allowed set,
and every permission denial a built-in read tool (`Read`, `Grep`, `Glob`). A denial of
any other tool, including a refused doc-bridge call, is `invalid-setup`. A denied built-in
read is recorded and does not invalidate the attempt. In the doc-bridge arm, if every
doc-bridge tool call returned a `tool_result` with `is_error: true`, the attempt is
`invalid-setup` (the treatment was lost); partial errors are recorded in
`toolErrorsByName` keyed by the full tool name.

Outcomes that are not setup failures: a timeout is `timed-out`; an invalid cost is
`invalid-cost`; `error_max_budget_usd` is `budget-exceeded`; any other error,
non-`success` subtype, or non-zero exit is `failed`; a clean `success` is `completed`.
Setup is checked before cost.

Each attempt records `transport: "cli"`, `cliVersion`, `expectedCliVersion`,
`attemptBudgetUsd`, the init `model`, `tools` and `mcp_servers`, `toolCallsByName`,
`toolCalls` (every `tool_use` counted once by id, including refused calls),
`permissionDenials`, `inputTokens`, `outputTokens`, `cacheCreationInputTokens`,
`cacheReadInputTokens`, `numTurns`, `cliSubtype`, `isError`, `usageComplete`,
`toolErrorsByName`, `cliReportedCostUsd` (the CLI's `total_cost_usd`, or `null`), `computedCostUsd` and
`costBasis` (the list-price computation from `modelUsage`), any `setupProblem` or
`costProblem`, `chargedUsd`, `wallTimeMs`, `status`, the private answer, and
`correctness: null` with `adjudication: "pending"`. `status` is `completed`, `failed`,
`timed-out`, `budget-exceeded`, `invalid-setup` or `invalid-cost`. Only `completed` is
treated as a successful attempt, and any other status stops the run.

Cost: the computed cost uses the `CLI_PRICES` table, and `costBasis` records which path
was used. When the stream carries assistant messages with usage (keyed by message id),
each request is priced in the tier its own prompt size selects (input plus cache read
and write, above 100k tokens for the second tier). The per-request sums of input, output,
cache read and cache write must equal the `modelUsage` totals exactly; otherwise the
attempt is `invalid-cost`. Without per-request usage, one tier is chosen from the
aggregate prompt of all requests: above 100k, every request is priced in the second
tier. The aggregate is at least the largest single request, so this never prices a
request above 100k in the base tier, and it may overprice a small request. A `modelUsage`
that holds any model other than `claude-haiku-5-5`, a foreign model in any message, a
missing or invalid count, or a computed cost that differs from the CLI-reported cost by
more than a factor of two is `invalid-cost`. Both zero counts as agreement. The cap is
charged with the larger of the two costs.

Budget: before each attempt, the attempt is refused unless the full per-attempt limit
fits under the remaining cap. The CLI reservation is that limit, rounded down to 6 decimals and
passed as `--max-budget-usd`. The CLI checks that cap only after spend, so one turn
can overshoot the reservation. A `completed` attempt settles to the larger of
`total_cost_usd` and the computed cost. Any other outcome is charged
`max(reservation, every valid cost)`, so a failed attempt is never charged less than a
valid reported cost. A valid result is read even after a non-zero exit, a timeout or a
malformed stream line. The CLI's `--max-budget-usd` is a safety net enforced after
spend, not a hard ceiling. The per-attempt default is 0.10 USD, about 100 times the one
measured trivial reply (0.00088 USD, Claude Code 2.1.296, 2026-10-10). A success whose charged cost exceeds its reservation,
or an `error_max_budget_usd` subtype, is `budget-exceeded`; if the cumulative spend
passes the cap, `cumulativeCapExceeded` is `true` and the run stops. Nothing is
retried or resumed.

Validation: `pnpm vitest run tests/study-minimal.test.ts --maxWorkers=2` covers
mocked HTTP, budgeting, usage, tools, Git blob reads, the export of the corpus
without the answer key or oversized and build-output files, directory and file modes of
the export, the preflight of every doc-bridge checkout, config resolution, all-error and
partial-error tool results, and actual local MCP without a model. The CLI tests use a
fake executable in a temporary directory. It reads a behaviour file, writes a
`records.json` with its argv and whether it received an API key, then emits canned
stream-json events (optionally preceded by a malformed line), exits non-zero, sleeps or
prints malformed output. No real
`claude` process runs. `node scripts/study-minimal.mjs --dry-run --transport cli`
exercises the shipped command and reports zero Claude processes and zero network calls.
