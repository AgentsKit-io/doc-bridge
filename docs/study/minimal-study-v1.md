---
title: Minimal agent-efficiency study v1
description: Six pinned public tasks, two paired scenarios and a budget-first pilot; no model results yet.
---

# Minimal agent-efficiency study v1

## Question and status

For six repository questions, does access to deterministic Doc Bridge MCP tools
change correctness, measured input/output tokens, tool calls and wall time compared
with repository tools alone? **This protocol is preparation, not an executed study.**
No model was run. A maintainer must supply a key, verify the selected model and
price table, and approve a pilot budget before any execution. A full run requires
a separate budget approval after reviewing the pilot. Publication of results and
semantic adjudication require independent human review.

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

One maintainer-selected pinned model ID, two scenarios, three repetitions per
task: **6 × 2 × 3 = 36 attempts**. Each attempt starts a fresh conversation and
a fresh local MCP process, with no shared model memory or retries. Model ID must
be an immutable version where the provider supports one; record limitations if
only an alias is available. Temperature is zero, with 1,024 output tokens per
turn and at most eight turns. An attempt may request at most 20 tools per turn.
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

## Metrics and human adjudication

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

Correctness begins as `null`, adjudication `pending`. Two human reviewers compare
the answer against every expected proposition and frozen cited source. They record
their independent score, citation checks and reasons in a private companion record
bound to protocol hash/task/scenario/repetition; a third reviewer settles disputes.
Hide scenario identity when possible. Answers cannot adjudicate themselves.

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

## Budget, execution and privacy

Use Node's built-in `fetch`; the checked dependency surface has no official
Messages SDK. No dependency or Layer 0 command changes are needed. The runner
uses the [Messages API](https://platform.claude.com/docs/en/api/messages/create)
with client-side read-only tools. It does not enable caching, extended thinking,
server tools, retries, redirects or additional paid services.

`STUDY_MODEL`, `ANTHROPIC_API_KEY`, `STUDY_BUDGET_USD`,
`STUDY_INPUT_USD_PER_MILLION`, and `STUDY_OUTPUT_USD_PER_MILLION` are required for
execution. Prices may instead be passed using `--input-usd-per-million` and
`--output-usd-per-million`. The two prices form the selected model's token-price
table: supply upper rates covering its context tier, not an unverified default.
The key comes only from the environment, rejects CR/LF, and is never printed or
passed to child processes. No command example contains a key value.

Before every paid call, the runner reserves a conservative input-token ceiling
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
overwritten or resumed. Raw answers remain private for human adjudication;
stdout prints only status and aggregate metrics. Review and redact all publication
material. Neither model responses nor a ledger are automatically published.

Validate the matrix without a model, key or network:

```bash
node scripts/study-minimal.mjs --dry-run
node scripts/study-minimal.mjs --dry-run --pilot
```

Add `--root repository=checkout` for each prepared corpus to verify clean HEAD
pins and readable authoritative sources locally. A rootless dry-run checks only
the matrix, not corpus/MCP readiness. Use separate pinned checkouts so answers
cannot be read from this study protocol.

After the maintainer supplies environment settings and explicitly approves the
pilot, run with the prepared checkout arguments and an outside private output:

```bash
node scripts/study-minimal.mjs --pilot --approve-budget \
  --root doc-bridge=corpus/doc-bridge --output ../pilot-private.json
```

The successful pilot prints measured input/output tokens and priced spend, plus
`pilot cost × 18` as an extrapolation for 36 attempts. This is **not** an upper
bound: one discovery task cannot predict architecture or documentation costs.
If either pilot attempt is incomplete/blocked, extrapolation is missing.
After a distinct full-budget approval, use `--run --approve-budget`, all three
`--root` arguments, and a new private output. A blocked run exits nonzero.

## Threats to validity and reuse

Six curated questions in related public repositories are a convenience sample.
Training contamination, author-selected expectations, different documentation
coverage, pinned-version drift, provider nondeterminism, API latency, tool limits
and local cache warmth can affect results. Same-model conversations are not
independent samples of models. Zero temperature does not imply reproducibility.
Reviewer blinding is imperfect because citations may reveal the scenario. The
pilot cost extrapolation has strong task-selection bias. Report setup effort,
missing metrics, failures and limitations alongside any launch claims.

The existing `src/study` protocol/task-suite contracts require four task categories
per repository, two model slots and three scenarios; the controlled ledger also
binds those plans. Reusing them would misrepresent this six-task/one-model/two-arm
design or break existing evidence. This smaller runner therefore uses a separate
versioned manifest and ledger, preserves existing hashes, and reuses the established
paired comparisons, provider usage labels, missing-data conventions and independent
human adjudication. MCP uses the existing server without a second retrieval path.
The new contract is described in [minimal study runner](../spec/study-minimal-v1.md).
