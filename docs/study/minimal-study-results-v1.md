---
title: Minimal agent-efficiency study v1 results
description: Agent-adjudicated results of the six-task, two-scenario, claude-haiku-5-5 study run through the Claude Code CLI, with a product change between run 1 and run 2.
---

# Minimal agent-efficiency study v1: results

> **Read the limits first.** These are agent-adjudicated results (Claude Opus 5.5,
> scenario-blind; no human reviewed any answer).
> - n = 18 attempts per scenario per run, over two runs.
> - One model: `claude-haiku-5-5`. One coding-agent setup.
> - Run 2 came after a product change, so it is not a controlled comparison with run 1.
> - The repository-only arm moved from 0.722 to 0.611 with the same setup. Differences
>   around 0.1 are within the noise observed here.
> - Costs are list-price computations.
>
> The results describe a coding agent with and without the doc-bridge MCP server. They
> do not describe the bare model and make no general or enterprise claim. Section 6 has
> the full list.

The protocol is [minimal-study-v1.md](./minimal-study-v1.md). The machine-readable
summary is [minimal-study-results-v1.json](./minimal-study-results-v1.json), copied
from the study runner's public summary export with only local paths removed.

## 1. What was measured

- **Protocol:** [minimal-study-v1.md](./minimal-study-v1.md), including the frozen
  population table with the pinned revisions.
- **Tasks:** 6 pinned repository questions in 3 public repositories (two tasks per repository):
  doc-bridge (`bridge-discovery`, `bridge-architecture`), agentskit-chat (`chat-discovery`,
  `chat-architecture`) and agents-playbook (`playbook-documentation`, `playbook-architecture`).
- **Scenarios:** (a) `repository-only`: repository tools only; (b) `doc-bridge-mcp`:
  repository tools plus the doc-bridge MCP server.
- **Repetitions:** 3 per task per scenario, so 18 attempts per scenario per run.
- **Transport and model:** Claude Code CLI 2.1.296 in headless mode, model `claude-haiku-5-5`.
- **Tools:** read-only.
- **Corpus:** a clean export for each attempt, from the pinned revisions, created outside the repository.
- **Tool names:** these runs used the Claude Code CLI transport, which exposes the built-in
  read-only tools `Read`, `Grep` and `Glob` in both scenarios and, in the doc-bridge scenario,
  the MCP tools `doc_search`, `doc_get` and `handoff_resolve` (see the protocol's transport
  section). The `repo_list`, `repo_read` and `repo_search` names belong to the Messages API
  transport, which was not used for these runs.

## 2. Results

Score per attempt: Correct 1, Partial 0.5, Incorrect or Incomplete 0.
Turns, tokens, wall time and cost are totals over the 18 attempts of each cell, unless the row says median.
Cost is the list-price computation.

### Run 1

| Measure | Repository only | Repository + doc-bridge MCP |
| --- | ---: | ---: |
| Correct / Partial / Incorrect (+ Incomplete) | 9 / 8 / 1 (+ 0) | 5 / 12 / 1 (+ 0) |
| Mean score | 0.722 | 0.611 |
| Attempts that used a doc-bridge tool | 0 of 18 | 0 of 18 |
| Total turns / median turns per attempt | 243 / 12.0 | 236 / 11.5 |
| Output tokens | 96,376 | 93,041 |
| Context tokens | 2,332,494 | 2,527,238 |
| Wall time (s) | 515.4 | 506.8 |
| List-price cost (USD) | 0.1497 | 0.1526 |
| Tool calls | Grep 73, Glob 24, Read 128 | Grep 75, Glob 18, Read 125 |

### Run 2

| Measure | Repository only | Repository + doc-bridge MCP |
| --- | ---: | ---: |
| Correct / Partial / Incorrect (+ Incomplete) | 4 / 14 / 0 (+ 0) | 12 / 6 / 0 (+ 0) |
| Mean score | 0.611 | 0.833 |
| Attempts that used a doc-bridge tool | 0 of 18 | 18 of 18 |
| Total turns / median turns per attempt | 233 / 12.0 | 204 / 11.5 |
| Output tokens | 99,963 | 80,415 |
| Context tokens | 2,048,557 | 2,056,777 |
| Wall time (s) | 521.9 | 448.9 |
| List-price cost (USD) | 0.1424 | 0.1291 |
| Tool calls | Grep 70, Glob 17, Read 128 | doc_search 18, doc_get 3, Grep 72, Read 91, Glob 2 |

### Per-task mean score (3 attempts per cell)

| Task | Run 1 repository only | Run 1 MCP | Run 2 repository only | Run 2 MCP |
| --- | ---: | ---: | ---: | ---: |
| bridge-discovery | 0.667 | 0.667 | 0.500 | 0.833 |
| bridge-architecture | 0.833 | 0.500 | 0.500 | 1.000 |
| chat-discovery | 0.667 | 0.500 | 0.500 | 1.000 |
| chat-architecture | 0.667 | 0.333 | 0.667 | 1.000 |
| playbook-documentation | 1.000 | 1.000 | 1.000 | 0.667 |
| playbook-architecture | 0.500 | 0.667 | 0.500 | 0.500 |

## 3. What changed between runs

This is a **product change between runs, not a controlled single-variable experiment.**

- **Run 1** used doc-bridge build 2.0.0-next.3 with the study runner. The MCP server sent no
  `initialize` instructions. The model never called a doc-bridge tool in the 18 MCP-arm attempts.
- **Run 2** used the build on `main` after three merged changes:
  - #344: `initialize` instructions and clearer tool descriptions for the MCP server.
  - #343: a discovery fix (bare lowercase prose words no longer cite entrypoint scripts).
    The runner's summary lists #343 together with #344 as the MCP-guidance change. The
    commit history shows #343 is the discovery fix, so the run-2 change set is #343, #344 and #345 together.
  - #345: the agent search default budget raised from 32 to 128 tokens. The study exposed
    the 32-token default as failing.

The repository-only arm was run with the same setup in both runs, but its mean moved
from 0.722 to 0.611. Differences around 0.1 are within the noise observed here.

## 4. Pre-registered run-2 success criterion

The criterion was recorded before run 2 started. All three conditions must hold.

| Condition | Result | Passed |
| --- | --- | --- |
| Doc-bridge tools used in at least 50% of MCP-arm attempts | 18 of 18 (100%) | Yes |
| MCP correctness not more than 0.1 below repository-only correctness | MCP 0.833 vs repository-only 0.611 (MCP higher by 0.222) | Yes |
| Fewer mean turns or tokens with MCP | Mean turns 11.3 (MCP) vs 12.9 (repository-only). Output tokens 80,415 vs 99,963. Context tokens 2,056,777 vs 2,048,557 (0.4% higher) | Yes (turns and output tokens) |

**Overall: passed.** Read this with section 3. The criterion was met in run 2, after the product
change. Run 1 did not meet the first condition, because no doc-bridge tool was called.

## 5. Blocked or invalid attempts, and spend

| When | Status | Cause (from the data) |
| --- | --- | --- |
| Pilot attempt 1 | invalid-cost | Runner cost-accounting bug, fixed in #340. |
| Run 2, first start | invalid-cost | The CLI returned a non-model error message. The summary says it was probably the account session limit. No tokens were used. |
| Run 2, second start | invalid-setup | The only doc-bridge tool call failed with the 32-token default agent budget. Fixed in #345. |

**Spend:** the total charged spend is **0.9132 USD** against a cumulative cap of **2 USD**
(1 USD approved for the study, plus 1 USD approved on 2026-10-11 for iteration; see the protocol).
The scored attempts account for 0.3023 USD in run 1 and 0.2715 USD in run 2. The remaining
0.3394 USD is conservative charging of attempts that did not produce a scored result: the first
pilot attempt (0.10, charged at its full reservation), the two-attempt pilot (0.0235), the first
run-2 start (0.10, full reservation, no tokens used) and the second run-2 start (0.1160: one
completed attempt at 0.0160 plus one invalid attempt charged its 0.10 reservation). Charged spend
is an upper bound; list-price cost of the unscored attempts was lower.

**Status:** the runner's ledgers end at `awaiting-adjudication`, the last state the runner itself
sets. Adjudication was then performed outside the runner, as the protocol specifies: a separate,
scenario-blind agent run graded all 36 answers of each run, and the outcome counts above are its
verdicts. No human reviewed them.

## 6. Limits

- **n = 18 attempts per scenario per run.** Two runs. Small numbers, with wide uncertainty.
- **One model:** `claude-haiku-5-5`.
- **Agent adjudication with no human review.** Adjudicator: Claude Opus 5.5, scenario-blind.
- **Noise:** the repository-only arm moved from 0.722 to 0.611 between runs with the same setup.
  Differences around 0.1 are within observed noise.
- **Product change between runs.** Run 2 is not a controlled comparison with run 1 (section 3).
- **Claude Code system prompt** is present in both arms.
- **Temperature is not controlled.**
- **Costs are list-price computations**, not billed amounts.
- **Tool names** in the summary do not match the protocol's repository tool names (section 1).
- **Scope:** the results describe a coding agent with and without the doc-bridge MCP server.
  They do not describe the bare model, and they make no general or enterprise claim.
