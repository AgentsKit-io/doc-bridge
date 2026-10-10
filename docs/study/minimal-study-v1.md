---
title: Minimal agent-efficiency study v1
description: Six pinned public tasks, two paired scenarios and a budget-first pilot; no model results yet.
---

# Minimal agent-efficiency study v1

## Question and status

For six repository questions, does access to deterministic Doc Bridge MCP tools
change correctness, measured input/output tokens, tool calls and wall time compared
with repository tools alone? **This protocol is preparation, not an executed study.**
No model was run. Maintainer decisions of 2026-10-09 fix the study model, its
price table and the adjudication method (see below). **The pilot transport is the
Claude Code CLI in headless mode** (`--transport cli`), authenticated by the CLI's
own login: no API key is read, required or passed to it (see
[Transport](#transport-claude-code-cli-pilot-transport)). The Messages API
transport (`--transport http`) stays available and tested as an option. The pilot
is approved with a cumulative cap of **1 USD**, applied to the charged spend per
attempt (the larger of the CLI-reported cost and the list-price computation). The full 36-attempt run is **not approved**; it needs a new budget
approval after the pilot reports measured cost. Publication of results requires
maintainer approval.

Semantic adjudication is performed by an **agent, not by humans**. There is no
human review of answers. Results are therefore **agent-adjudicated evidence** and
must be labelled that way in any published report.

The machine-readable source of truth is [minimal-study-v1.json](./minimal-study-v1.json).
It freezes public source revisions and question text. Changing any question, pin,
tool behavior, model, price table or runner starts a new evidence series; do not
combine observations from different series. Existing study hashes and schemas
remain unchanged.

## Population and tasks

| Public repository | Frozen SHA | Tasks |
| --- | --- | --- |
| doc-bridge | `948e8b2211c367f36581c503dcb7280bdd3b1028` | bridge-discovery, bridge-architecture |
| agentskit-chat | `7f7388bcc60b7259d4148c0a0fb1142b8629dfff` | chat-discovery, chat-architecture |
| agents-playbook | `c922b52249605c3e2437897364e722b76de67224` | playbook-documentation, playbook-architecture |

These are public repositories in the AgentsKit organization. Prepare separate
clean detached checkouts at these SHAs. Do not use the study implementation branch
as a corpus: it contains answer keys. The runner reads frozen Git blobs for
repository tools. MCP reads the prepared checkout and fresh index; preparation
must freeze that checkout for the entire run.

| Task | Expected answer and authoritative source |
| --- | --- |
| bridge-discovery | Declaring module owns symbol citations, rather than a barrel; ambiguous owners remain unresolved with coverage and bounded metadata. Distinct cited symbols retain distinct relations. `docs/spec/markdown-analyzer-v1.md`, backed by `src/discovery/markdown.ts`. |
| bridge-architecture | Regeneration writes `sha256-semantic-v1`; readers retain `sha256-normalized-v1`. Unknown algorithms fail; older readers need upgrading. Semantic identity excludes provenance and never transfers human approval. `docs/schemas/doc-bridge-index-v1.md` and ADR 0010. |
| chat-discovery | One public `@agentskit/chat` tarball provides protocol/server/devtools and seven renderer subpaths. Workspace separation preserves focused builds/tests. ADR 0029 supersedes separate renderer releases from ADR 0028. `packages/chat/package.json` and those ADRs. |
| chat-architecture | Original events are `client.turn.submit`, `server.turn.snapshot`, `server.turn.diagnostic`. Increasing sequence numbers and stable message IDs support full snapshots; AgentsKit owns lifecycle. Raw chunks would require a second reducer. Unknown versions/events are inert; semantic/required-field changes require explicit v2 evolution. ADR 0004. |
| playbook-documentation | Discover needs brief, surfaces, threat-model structure, routing/bootstrap docs and decision log. Exit requires understandable ownership/non-negotiables, accepted ADR-0001 and enumerated assets/actors/surfaces; mitigations may initially be empty. `content/docs/phases/01-discover/index.md`. |
| playbook-architecture | Exact facts use a bounded hash-verified local corpus; ambiguity prompts clarification and synthesis misses use the backend. Corrupt/wrong-site artifacts are rejected; degraded fallback is visible. Failed streams are never grounded; browser does not choose model or corpus authority. `content/docs/discovery.mdx`. |

Questions ask for source path and line citations. Expected propositions and source
lists stay with adjudicators; they are never included in the model prompt.

## Scenarios and schedule

One pinned model ID, two scenarios, three repetitions per task:
**6 × 2 × 3 = 36 attempts**. The model is **Claude Haiku 5.5, API model ID
`claude-haiku-5-5`** (released 2026-10-07, maintainer decision 2026-10-09). Each
attempt starts a fresh conversation and a fresh local MCP process, with no shared
model memory or retries. Model ID must be an immutable version where the provider
supports one; if the provider exposes only this alias, record that limitation in
the report. The identifier was not independently re-verified by a model run. HTTP transport:
temperature is zero, with 1,024 output tokens per turn and at most eight turns. CLI
transport: the runner does not pass the eight-turn or 1,024-token limits and cannot
set temperature; the CLI's own defaults apply (see
[Transport](#transport-claude-code-cli-pilot-transport)). An attempt may request at most 20 tools per turn.
A five-minute elapsed deadline is checked between tools/turns and bounds paid
request timeouts; an in-flight local tool may add up to its 30-second timeout.

`repository-only` exposes `repo_list`, `repo_read`, `repo_search`: bounded literal
search and line-numbered reads of public tracked source blobs, with no shell or
network tool. Hidden files, credentials, lockfiles, generated artifacts, symlinks
and the minimal-study answer key are excluded. Search checks the first 500
eligible paths and reports that limit; listing returns at most 200 paths.

`doc-bridge-mcp` exposes the same repository tools plus actual local MCP
`doc.search`, `doc.get`, `handoff.resolve`. The API names replace dots with
underscores, while dispatch retains exact MCP names. No mutating tool is exposed.
The same built Doc Bridge engine serves all corpus repositories; its revision and
CLI bundle hash are recorded. Build and generate fresh indexes before timing
attempts. Keep intelligence/enrichment disabled and use deterministic indexes only.
Index preparation cost is reported separately by the maintainer, not silently
included in inference metrics. The runner does not build indexes or download repos.

Task order is fixed; scenario order alternates by task and repetition. This
counterbalances which scenario runs first but does not eliminate temporal drift.
The pilot is the first task, both scenarios, one repetition: **two attempts**.
Pilot observations are separate from the full run and cannot count toward its 36.

## Metrics and agent adjudication

Each private observation binds task, scenario, repetition, corpus pins, protocol
hash, runner hash, engine revision/bundle hash, model and pricing configuration.
Input/output tokens sum **provider usage from every paid turn**, including repeated
conversation history and tool context. No byte estimate is presented as measured
usage. Tool calls count model-requested repository/MCP calls, including failed
calls; initialization and tool listing are preparation, not agent tool calls.
Wall time starts before the first paid request and ends at termination, including
local tool execution. Missing/invalid usage blocks the run; no zero is fabricated.

`usageComplete: false` marks a lost or invalid provider response. Token fields then
contain only the observed prior turns, not a total for the failed attempt; the
uncertain request retains its reservation. Known counts and elapsed time remain
available, and incomplete usage cannot produce a pilot extrapolation.

Correctness begins as `null`, adjudication `pending`. An **adjudicating agent**
compares the answer against every expected proposition and frozen cited source,
applies the five-outcome rubric below unchanged, and records its score, citation
checks and reasons in a private companion record bound to protocol
hash/task/scenario/repetition. Adjudication is not human review: no human
reviewer, third reviewer or dispute panel is part of this protocol.

The adjudicating agent must satisfy all of these rules:

- It is a **different model run from the one that answered**: a separate session
  in a fresh context, never the answering conversation or its history. The
  adjudicator's model ID and run identifier are recorded. A different model ID
  from `claude-haiku-5-5` is preferred and must be recorded when used.
- It sees the answer, the expected propositions and the frozen cited sources.
- It does **not** see the scenario label (`repository-only` or
  `doc-bridge-mcp`), so it is blind to whether doc-bridge MCP was available. It
  also does not see scenario order, tool logs, token counts or timing.
- An answer cannot adjudicate itself. No run adjudicates its own answer.

- **Correct (1):** all task propositions are accurate, supported by valid
  path/line citations at the pin, with no contradictory material claim.
- **Partial (0.5):** some supported propositions, no material contradiction,
  but one or more required propositions or citations missing.
- **Incorrect (0):** a material false assertion or citation contradicts the pin.
- **Incomplete (0):** no usable answer, truncation or turn limit reached.
- **Blocked (missing):** preparation, tool/provider failure or budget refusal.
  Report counts and reasons separately; never drop blocked attempts invisibly.

Report paired task/repetition differences, all 36 attempt statuses, correctness
distribution, token/tool/time distributions and total priced usage. Token or
latency reductions alone do not establish correctness. Small-sample intervals
are exploratory; make no general population or enterprise-readiness claim.

**Declaration required in every report:** correctness is *agent-adjudicated; no
human review was performed*. Results are evidence labelled that way, and
maintainer publication approval is still required before publication.

## Transport: Claude Code CLI (pilot transport)

`--transport cli` runs every attempt as one fresh headless Claude Code process
(`claude -p`), started with an argument array (never a shell string). Its `cwd` is a
fresh export directory, created per run with `mkdtemp` outside the repository. The
export holds only the pinned Git blobs that pass the public-path filter (regular
files of at most 200000 bytes, no dotfiles, no `node_modules`, `dist`, `build` or
`coverage`). It has no `.git` directory and is read-only. The HTTP transport reads
the same filtered corpus. Both transports send the same prompt, which must be at
most 8 KiB.

**Pinned version.** Before any attempt, the runner runs `claude --version` once and
refuses to start unless its first token is exactly `2.1.296`. The probed version is
recorded in the ledger. `--cli-version` exists only to name a different pin for a
separately reviewed change; it does not accept an unknown build. The flags below were
checked against `claude --help` of Claude Code 2.1.296 (installed with
`npx -y @anthropic-ai/claude-code@2.1.296`). The 2.1.288 help that was read earlier
is superseded. The runner passes `--tools` (`Read`, `Grep`, `Glob`) and
`--permission-mode dontAsk`; the init event of a live run must confirm the tool set.

**Arguments.** `cliArguments` builds the array in this order. The prompt is last,
after boolean flags only, so no variadic option can consume it.

| Flag | Effect |
| --- | --- |
| `-p --model claude-haiku-5-5` | Print mode: one prompt, one answer, then exit. Study model. |
| `--output-format stream-json --verbose` | One JSON event per stdout line: a `system` init event, `assistant` events, and a final `result` event. |
| `--no-session-persistence` | No session saved to disk, so attempts cannot resume each other. |
| `--max-budget-usd <limit>` | Per-attempt reservation `min(remaining cap, --attempt-budget-usd)`, rounded down to 6 decimals. The CLI enforces it after spend. |
| `--restricted` | Ignores user, project and local settings files; removes Bash and WebFetch; confines file tools to the working directory; refuses `bypassPermissions`. |
| `--disable-slash-commands` | Disables skills. |
| `--permission-mode dontAsk`, `--permission-prompts none` | Anything not explicitly allowed is refused, and nothing waits for a prompt. |
| `--tools Read,Grep,Glob` | The only built-in tools available. |
| `--allowedTools` | `Read,Grep,Glob`. The doc-bridge scenario also lists `mcp__doc-bridge__doc_search`, `mcp__doc-bridge__doc_get` and `mcp__doc-bridge__handoff_resolve`. |
| `--disallowedTools` | `Bash,Edit,MultiEdit,Write,NotebookEdit,WebFetch,WebSearch,Task,Agent`, plus every other tool the doc-bridge server lists in its live `tools/list`. The list is probed once per run and passed to both arms. |
| `--mcp-config <json>` | Repository-only: `{"mcpServers":{}}`. Doc-bridge: one stdio server named `doc-bridge`, running `node <engine> --config <checkout>/doc-bridge.config.json mcp`. |
| `--strict-mcp-config` | Only the servers in `--mcp-config` are used. Project and user MCP servers are ignored. |

The two scenarios differ **only** in the `--mcp-config` value and the three
`mcp__doc-bridge__*` entries in `--allowedTools`. The tests compare the two argument
arrays to check this. The MCP tool name maps each dotted name to underscores
(`doc.search` becomes `mcp__doc-bridge__doc_search`). That naming was not checked
against a live run.

**Checks before a result is accepted.** The stream-json transcript must contain at
most one init event and must end with exactly one `result` event. Then:

- **Setup** (`invalid-setup`): the init event's `model` is the study model. Its
  `tools` set is exactly the expected set: `Read`, `Grep`, `Glob`, plus the three
  doc-bridge tools in the doc-bridge arm. In the repository-only arm `mcp_servers`
  is empty. In the doc-bridge arm there is exactly one server, `doc-bridge`, with status
  `connected`. Every tool call must name a tool in the allowed set. Every permission
  denial must be a built-in read tool. Any other denial, such as a refused MCP call,
  fails the attempt.
- **Cost** (`invalid-cost`): the reported and computed costs must agree, as described
  in the Cost paragraph below.

Setup is checked before cost. Then `error_max_budget_usd` gives `budget-exceeded`,
any other error or non-success subtype gives `failed`, and a clean `success` gives
`completed`.

**Cost.** The runner computes a list-price cost from `modelUsage` and checks it against
the CLI-reported `total_cost_usd`. The table is `CLI_PRICES` in the runner, in USD per
million tokens:

| Tier | Input | Output | Cache read | Cache write |
| --- | --- | --- | --- | --- |
| Prompt up to 100k tokens | 0.10 | 0.50 | 0.01 | 0.125 |
| Prompt above 100k tokens | 0.50 | 2.50 | 0.05 | 0.625 |

The input and output rates are the 2026-10-09 decision. The cache read and cache write
rates in the same table were added on 2026-10-10 as list prices for the same tiers.
They are part of the `CLI_PRICES` table the runner uses, and the maintainer confirms
them before any report is published.

Tiering works in two ways. If stream events carry per-request usage keyed by message
id, each request is tiered by its own prompt size (input plus cache read and write),
and the per-request sums must equal the `modelUsage` totals. Otherwise the aggregate
prompt size selects one tier for the whole attempt, which is an upper bound for any
single request. A model other than the study model, in `modelUsage` or in any message,
is `invalid-cost`. So are missing or invalid counts. The CLI-reported and computed
costs must be equal or within a factor of two. Both zero counts as agreement.

**Metrics recorded per attempt.** `transport: "cli"`, `cliVersion`,
`expectedCliVersion`, `attemptBudgetUsd`, the init event's `model`, `tools` and
`mcp_servers`, `toolCallsByName` and `toolCalls` (every `tool_use` block counted once
by id, including refused calls), `permissionDenials` (count and tool names), `numTurns`,
the CLI `subtype`, `isError`, `inputTokens` (`usage.input_tokens`),
`outputTokens`, `cacheCreationInputTokens`, `cacheReadInputTokens`, `usageComplete`,
`cliReportedCostUsd`, `computedCostUsd`, `costBasis`, any `setupProblem` or
`costProblem`, `chargedUsd`, `status`, `wallTimeMs`, and the private `answer`.
`correctness` is `null` and `adjudication` is `pending`. The ledger's `cli` block
records `cliVersion`, `expectedCliVersion`, `attemptBudgetUsd`, `disallowedMcpTools`,
`prices` and the cost rule. Absolute input tokens are the sum of `inputTokens`,
`cacheCreationInputTokens` and `cacheReadInputTokens`. Cache tokens are reported
separately.

**Status values.** `completed`, `failed`, `timed-out`, `budget-exceeded`,
`invalid-setup`, `invalid-cost`. Only `completed` is a successful attempt. Any other
status stops the run, and nothing is retried or resumed.

**Isolation achieved:** user and project settings files are ignored (`--restricted`,
per its help text; hooks and plugins configured only in those files should therefore
not load, which was not observed in a run). Skills are disabled. No project `.mcp.json`
or user MCP server is used (`--strict-mcp-config`). The only tools are read and search
tools plus, in the MCP scenario, the three read-only doc-bridge tools. The tool surface
is checked against the init event, and any other tool use or denial fails the attempt.
No session is persisted. The child environment is an allowlist: system variables and
`HOME` so the CLI can find its login, plus `USER`, `LOGNAME`, `LANG` and `LC_ALL`.
`ANTHROPIC_API_KEY` is removed explicitly.

**Isolation not achieved:**

- `CLAUDE.md` memory is **not** excluded. The user's global `CLAUDE.md` loads into
  context in both scenarios. The export directory contains the pinned corpus's own
  `CLAUDE.md` and `AGENTS.md`, which the CLI also loads in both scenarios, so the
  two arms share the same repository instructions. `--bare` would exclude them, but its help text says Anthropic auth is
  then strictly `ANTHROPIC_API_KEY` or `apiKeyHelper`, so OAuth and keychain login
  stop working; it was therefore not used. `--safe-mode` also excludes `CLAUDE.md`,
  but its help lists MCP servers among the disabled customizations, and no run can
  verify that the explicit `--mcp-config` server survives it. It was not used.
- Automatic memory is not disabled by any flag used here.
- The Claude Code system prompt and tool harness are part of every attempt in both
  scenarios.
- The export directory has no `.git` directory, and the corpus is read from pinned
  blobs only, so Read/Grep cannot reach git history from the working directory. The
  corpus does not contain the answer key, which lives only on the study branch.
  Reads outside the export directory are not verified in a live run.
- The workspace trust dialog is skipped in print mode.
- Sampling temperature is not controlled by any flag. The HTTP transport's
  `temperature: 0` does not apply.
- Whether the disallowed MCP tool definitions are still sent to the model is not
  known. They are denied at call time, and the setup check fails any attempt that
  tries one.
- The per-message usage fields and `message.id` that the runner relies on for
  per-request tiering were not confirmed against a live stream. Without them the
  aggregate bound is used.

**Credential handling.** The CLI transport never reads, requires or passes
`ANTHROPIC_API_KEY`. The variable is removed from the child's environment, and the
CLI authenticates with its own login. `STUDY_MODEL` and `STUDY_BUDGET_USD` are required,
and `--claude-bin` and `--attempt-budget-usd` are optional. No price flag is needed.

**Limits of this transport, stated plainly:**

- The Claude Code system prompt and harness are part of every attempt in both
  scenarios. Absolute token counts are therefore higher than a bare API call would
  show. They are comparable only between the two scenarios.
- The charged spend is the larger of the CLI's estimate and the list-price computation.
  On a subscription login neither is a **billed amount**.
- Results describe a **coding agent with and without the doc-bridge MCP server**,
  not the bare model.
- Each attempt is capped at 5 minutes and stdout at 4 MiB. Truncated output is a
  `failed` attempt.
- The 0.10 USD default per-attempt limit comes from one maintainer measurement on
  2026-10-10: a trivial reply cost 0.00088 USD. Multi-turn tool runs were not
  measured, so a truncation by the cap is recorded as `budget-exceeded`.

## Budget, execution and privacy

**HTTP transport (option, `--transport http`).** Uses Node's built-in `fetch`; the
checked dependency surface has no official Messages SDK. No dependency or Layer 0
command changes are needed. The runner uses the
[Messages API](https://platform.claude.com/docs/en/api/messages/create) with
client-side read-only tools. It does not enable caching, extended thinking, server
tools, retries, redirects or additional paid services.

For HTTP execution, `STUDY_MODEL`, `ANTHROPIC_API_KEY`, `STUDY_BUDGET_USD`,
`STUDY_INPUT_USD_PER_MILLION`, and `STUDY_OUTPUT_USD_PER_MILLION` are required.
Prices may instead be passed using `--input-usd-per-million` and
`--output-usd-per-million`; the flags take precedence over the price variables.
The two prices form the selected model's token-price table and are used for
budget reservation, so they must be upper rates.

**CLI transport (pilot, `--transport cli`).** Requires `STUDY_MODEL` and
`STUDY_BUDGET_USD`. `--claude-bin` (default `claude`, resolved on `PATH`) selects the
executable. `--attempt-budget-usd` (default `0.10`) is the per-attempt limit. The
CLI must be the pinned version `2.1.296`, checked before any attempt. No prices are
needed as flags: the list prices are the runner's `CLI_PRICES` table (see
[Transport](#transport-claude-code-cli-pilot-transport)), and the reported cost is
checked against them.

**Decided values (maintainer, 2026-10-09)** for `claude-haiku-5-5`:

| Context tier | Input USD / million tokens | Output USD / million tokens |
| --- | --- | --- |
| Prompts up to 100k tokens (public list price) | 0.10 | 0.50 |
| Prompts above 100k tokens | 0.50 | 2.50 |
| **Upper prices used for reservation** | **0.50** | **2.50** |

HTTP transport only: the conservative upper prices are the above-100k tier. HTTP
runs pass them as `--input-usd-per-million 0.50 --output-usd-per-million 2.50`. The
runner itself hardcodes no model or price; these flags and `STUDY_MODEL` are the
only sources. The CLI transport needs no prices.

The HTTP key comes only from the environment, rejects CR/LF, and is never printed or
passed to child processes. The CLI transport never reads, requires or passes it.
No command example contains a key value.

**Approved pilot budget:** cumulative cap **1 USD** (`STUDY_BUDGET_USD=1`), applied
to the charged spend. The exact pilot command, run only after checkouts are
prepared at the pins and the maintainer has approved the run, is:

```bash
# Install the pinned CLI once, outside the repository (this runs no prompt):
npm install --prefix <CLI_PREFIX> @anthropic-ai/claude-code@2.1.296

STUDY_MODEL=claude-haiku-5-5 STUDY_BUDGET_USD=1 \
  node scripts/study-minimal.mjs --transport cli --pilot --approve-budget \
  --claude-bin <CLI_PREFIX>/node_modules/.bin/claude \
  --attempt-budget-usd 0.10 \
  --root doc-bridge=corpus/doc-bridge --output ../pilot-private.json
```

`<CLI_PREFIX>` is a private directory outside the repository. Without
`--claude-bin` the runner uses `claude` from `PATH`, and it refuses to start unless
that binary reports exactly 2.1.296.

Before each attempt the CLI transport refuses to start if the remaining budget is
not positive. Otherwise it reserves `min(remaining, --attempt-budget-usd)` and passes
that value as `--max-budget-usd`. The CLI checks that cap only after spend, so one
turn can overshoot the reservation. A completed attempt is settled to the larger of the
CLI-reported `total_cost_usd` and the list-price computation from `modelUsage`. A
success that costs more than its reservation, or an `error_max_budget_usd` result, is
`budget-exceeded`; if the cumulative spend passes the 1 USD cap, the summary sets
`cumulativeCapExceeded`. Any other outcome (`failed`, `timed-out`, `budget-exceeded`,
`invalid-setup`, `invalid-cost`) is charged `max(reservation, every valid cost)`, so a
failure is never charged less than a valid cost the CLI reported. A valid result is
read even after a non-zero exit or a timeout. No attempt is retried or resumed, and
any non-`completed` status stops the run.

Before the first attempt, the runner checks that the doc-bridge arm is ready: the MCP
server must answer `doc.search` at the pin from a fresh index. If it does not, the
run stops before any paid attempt. An attempt in which every doc-bridge tool call
returned an error is `invalid-setup`; a partial error is recorded per tool name in
`toolErrorsByName`. The CLI-reported figure is the CLI's own
estimate and, on a subscription login, not a billed amount. The `× 18` extrapolation
is printed only when both pilot attempts complete, and it applies to that charged spend.

The HTTP transport (`--transport http`) keeps its upper-price behaviour: the runner
computes reported spend and the full-run extrapolation at the supplied upper prices (0.50 USD input and 2.50 USD output per million tokens), so for prompts under 100k tokens the reported spend is about five times the list-price cost (0.10 / 0.50). That reported spend is an upper bound, not the billed amount; the `× 18` extrapolation is not an upper bound either (see below), so whoever approves the full run should read both figures that way.

**The full 36-attempt run is not approved.** It needs a new, distinct budget
approval after the pilot reports measured input/output tokens and priced spend.
Approval of the pilot does not extend to the full run.

HTTP transport: before every paid call, the runner reserves a conservative input-token ceiling
(twice the serialized request's UTF-8 bytes plus 8,192 protocol tokens) and the
maximum 1,024 output tokens, at supplied rates. A call whose reservation would
exceed the cumulative cap is refused. Actual measured usage releases unused
reservation. Transport ambiguity or invalid usage keeps the reservation charged
and stops execution without retry. The cap is local to this process and applies
under the supplied upper prices and token ceiling; configure a provider account
spending limit too for billing changes or concurrent activity outside this run.
The provider may charge a request whose response is lost.

Reservations and observations are persisted before/after calls in an exclusively
created, mode-600 output outside all checkouts. Existing outputs are never
overwritten or resumed. Raw answers remain private for agent adjudication;
stdout prints only status and aggregate metrics. Review and redact all publication
material. Neither model responses nor a ledger are automatically published.

Validate the matrix without a model, key, network or Claude process:

```bash
node scripts/study-minimal.mjs --dry-run --transport cli
node scripts/study-minimal.mjs --dry-run --transport cli --pilot
node scripts/study-minimal.mjs --dry-run
node scripts/study-minimal.mjs --dry-run --pilot
```

The dry run reports `networkCalls: 0` and `claudeProcesses: 0`, and 36 full or 2
pilot attempts. A rootless dry run starts no process at all. With `--root`, it runs
only local `git` reads.

Add `--root repository=checkout` for each prepared corpus to verify clean HEAD
pins and readable authoritative sources locally. A rootless dry-run checks only
the matrix, not corpus/MCP readiness. Use separate pinned checkouts so answers
cannot be read from this study protocol.

The pilot's approval is the 1 USD cap and the exact command shown above. It
uses the prepared checkout argument and an outside private output. The pilot
prints measured input/output tokens and charged spend, plus
`pilot cost × 18` as an extrapolation for 36 attempts. This is **not** an upper
bound: one discovery task cannot predict architecture or documentation costs.
If either pilot attempt is incomplete/blocked, extrapolation is missing.

**The pilot cost must be reported before the full run is considered.** The report
gives the pilot's charged spend, per-attempt `total_cost_usd`, token counts including
cache fields, and the CLI version. It also states the MCP check described in
[Transport](#transport-claude-code-cli-pilot-transport).

The full run requires a new, distinct budget approval after the pilot. Its
command uses `--run --approve-budget`, all three `--root` arguments, the newly
approved `STUDY_BUDGET_USD`, and a new private output. A blocked run exits nonzero.

## Threats to validity and reuse

Six curated questions in related public repositories are a convenience sample.
Training contamination, author-selected expectations, different documentation
coverage, pinned-version drift, provider nondeterminism, API latency, tool limits
and local cache warmth can affect results. Same-model conversations are not
independent samples of models. Zero temperature does not imply reproducibility.
Adjudicator blinding is imperfect because citations or answer wording may reveal
the scenario. An agent adjudicator has no human expert review, and it may share
biases with the answering model family, so agent-adjudicated correctness is
weaker evidence than human-reviewed correctness would be. The pilot cost
extrapolation has strong task-selection bias. Report setup effort,
missing metrics, failures and limitations alongside any launch claims.

The existing `src/study` protocol/task-suite contracts require four task categories
per repository, two model slots and three scenarios; the controlled ledger also
binds those plans. Reusing them would misrepresent this six-task/one-model/two-arm
design or break existing evidence. This smaller runner therefore uses a separate
versioned manifest and ledger, preserves existing hashes, and reuses the established
paired comparisons, provider usage labels, missing-data conventions and independent
agent adjudication, which replaces human review in this protocol. MCP uses the existing server without a second retrieval path.
The new contract is described in [minimal study runner](../spec/study-minimal-v1.md).
