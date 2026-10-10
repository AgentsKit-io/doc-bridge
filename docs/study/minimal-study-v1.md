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
is approved with a cumulative cap of **1 USD**, applied to the CLI-reported cost. The full 36-attempt run is **not approved**; it needs a new budget
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
(`claude -p`), started with an argument array (never a shell string) from the
frozen checkout of the task's repository at its pin. The same frozen corpus is
read by the HTTP transport. Both transports send the same prompt.

Arguments, with what each does in the installed CLI (`claude --help` was read in full;
flags below appear there):

| Flag | Effect |
| --- | --- |
| `-p` | Print mode: one prompt, one answer, then exit. |
| `--model claude-haiku-5-5` | Study model. |
| `--output-format json` | Single JSON object on stdout with usage, turns, cost and result. |
| `--no-session-persistence` | No session saved to disk, so attempts cannot resume each other. |
| `--max-budget-usd <n>` | CLI-side spend limit: `min(remaining cap, per-attempt limit)`. |
| `--restricted` | Ignores user, project and local settings files; removes Bash and WebFetch; confines file tools to the working directory; refuses `bypassPermissions`. |
| `--disable-slash-commands` | Disables skills. |
| `--permission-mode dontAsk` | Anything not explicitly allowed is refused, so nothing waits for a prompt. |
| `--permission-prompts none` | With print mode, nobody answers prompts; anything that would prompt is denied. |
| `--tools Read,Grep,Glob` | The only built-in tools available: file read and search. |
| `--allowedTools <list>` | Pre-approves the same read-only tools; the doc-bridge scenario also lists its three MCP tools. |
| `--disallowedTools <list>` | Denies Bash, Edit, MultiEdit, Write, NotebookEdit, WebFetch, WebSearch and the subagent tools (Task, Agent). |
| `--mcp-config <json>` | Repository-only: `{"mcpServers":{}}`. Doc-bridge: one stdio server, `node <engine> mcp`, launched from the checkout. |
| `--strict-mcp-config` | Only the servers in `--mcp-config` are used; project and user MCP servers are ignored. |

The two scenarios differ **only** in the `--mcp-config` value and the three
`mcp__doc-bridge__*` entries appended to `--allowedTools`. Everything else is identical.
Tests check this by comparing the two argument arrays.

**Isolation achieved:** user and project settings files are ignored (`--restricted`,
per its help text; hooks and plugins configured only in those files should therefore
not load, which was not observed in a run); skills are disabled; no project `.mcp.json` or user MCP server is used (`--strict-mcp-config`);
the only tools are read and search tools plus, in the MCP scenario, the three
read-only doc-bridge tools; no session is persisted; the child environment is an
allowlist (system variables and `HOME` so the CLI can find its login, plus
`USER`, `LOGNAME`, `LANG` and `LC_ALL`).

**Isolation not achieved:**

- `CLAUDE.md` memory is **not** excluded. The user's global `CLAUDE.md` and the
  pinned checkout's own `CLAUDE.md`/`AGENTS.md` may load into context, in both
  scenarios. `--bare` would exclude them, but its help text says Anthropic auth is
  then strictly `ANTHROPIC_API_KEY` or `apiKeyHelper`, so OAuth and keychain login
  stop working; it was therefore not used. `--safe-mode` also excludes `CLAUDE.md`,
  but its help lists MCP servers among the disabled customizations, and no run can
  verify that the explicit `--mcp-config` server survives it. It was not used.
- Automatic memory is not disabled by any flag used here.
- The Claude Code system prompt and tool harness are part of every attempt in both
  scenarios.
- The checkout's `.git` directory is inside the working directory. Read/Grep can
  reach git object files there, which can include other history of the same public
  repository. The corpus does not contain the answer key, which lives only on the
  study branch.
- The workspace trust dialog is skipped in print mode.
- Sampling temperature is not controlled by any flag. The HTTP transport's
  `temperature: 0` does not apply.

**Credential handling.** The CLI transport never reads, requires or passes
`ANTHROPIC_API_KEY`. The variable is removed from the child's environment, and the
CLI authenticates with its own login. `STUDY_MODEL`, `STUDY_BUDGET_USD` and
optionally `--claude-bin` and `--attempt-budget-usd` are the only inputs needed.

**Metrics and cost.** The ledger records, per attempt, the answer text, `usage` as
reported (`input_tokens`, `output_tokens`, `cache_creation_input_tokens`,
`cache_read_input_tokens`), `num_turns`, wall time, the CLI-reported
`total_cost_usd`, the CLI version (`claude --version`, probed once per run), and
`isError`. It also records `transport: "cli"`. Tool-call counts are recorded as
`null` because the JSON result shape relied on here does not report them.
Absolute input tokens must be read as the sum of the three input fields. Cache
tokens are reported separately and are not in `input_tokens`.

Limits of this transport, stated plainly:

- The Claude Code system prompt and harness are part of every attempt in both
  scenarios. Absolute token counts are therefore higher than a bare API call would
  show. They are comparable only between the two scenarios.
- The reported cost is the CLI's own estimate. On a subscription login it is **not
  a billed amount**.
- Results describe a **coding agent with and without the doc-bridge MCP server**,
  not the bare model.

**Unverified in this preparation:** the JSON result field names
(`total_cost_usd`, `num_turns`, `subtype`, `is_error`, `usage`), the built-in tool
names (`Glob`, `Grep`, `MultiEdit`, `Task`, `Agent`), the MCP tool naming
`mcp__doc-bridge__doc_search` and the child working directory of a stdio MCP server
were not checked against a live run. No real `claude` process was executed with a
prompt, and no model request was made. The first real attempt must be read before
its numbers are trusted: confirm the JSON fields and whether doc-bridge tools were
used in the doc-bridge scenario.

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
executable. `--attempt-budget-usd` (default `0.25`) is the per-attempt limit. No
prices are needed, because the CLI reports cost.

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
to the CLI-reported cost. The exact pilot command, run only after checkouts are
prepared at the pins and the maintainer has approved the run, is:

```bash
STUDY_MODEL=claude-haiku-5-5 STUDY_BUDGET_USD=1 \
  node scripts/study-minimal.mjs --transport cli --pilot --approve-budget \
  --attempt-budget-usd 0.25 \
  --root doc-bridge=corpus/doc-bridge --output ../pilot-private.json
```

Before each attempt the CLI transport refuses to start if the remaining budget is
not positive. Otherwise it reserves `min(remaining, --attempt-budget-usd)` and passes
that value as `--max-budget-usd`. A valid successful result is settled to the
CLI-reported `total_cost_usd`. A non-zero exit, timeout, unparsable output, invalid
usage or a result with `is_error` is charged the full per-attempt limit, with no
retry or resume. The CLI-reported figure is the CLI's own estimate and, on a
subscription login, not a billed amount. The `× 18` extrapolation applies to that
charged spend.

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
