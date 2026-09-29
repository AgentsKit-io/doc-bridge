---
title: Keep-pushing loop for the knowledge-retrieval workstreams
description: How the @agentskit/harness loop and Orca develop the KR-01…KR-11 workstreams one at a time, and what a human still has to do.
---

# Keep-pushing loop for the knowledge-retrieval workstreams

`ak-harness loop` drains one person's Linear queue through Orca worktrees: it freezes an orchestrator contract per issue, opens a worker terminal in a fresh worktree, then drives the resulting pull request through checks, adversarial review and squash merge. This repository ships [`loop.config.example.yaml`](../loop.config.example.yaml) with every project-specific value already tuned.

**The real `loop.config.yaml` is gitignored.** Its `linear` block names a workspace, a team and a person by id, and this repository is public, so the working config stays local:

```bash
cp loop.config.example.yaml loop.config.yaml
ak-harness loop install -f loop.config.yaml   # fills the identity block interactively
```

`loop install` lists the Linear team members through Orca and asks whose queue this machine drains, so the identifiers never have to be typed by hand or pasted into a commit.

Two facts decide how everything below is laid out:

- **The queue is Linear, not GitHub.** GitHub is where a pull request is reviewed and merged, and `github.intakeLabel` (`loop:review`) lets a human ask the loop to review a pull request it never dispatched. It is not a work queue.
- **The loop runs on a machine with Orca**, not in CI and not in an ephemeral container. `orca.runtime` is a blocking doctor check.

So the eleven workstreams live in two places on purpose: the GitHub sub-issues of [#169](https://github.com/AgentsKit-io/doc-bridge/issues/169) are the **specification**, and the Linear issues are the **queue item** the orchestrator actually reads. Each Linear issue carries the scope, the acceptance checklist, the verify command and a "do not" section, and links back to its GitHub spec.

## Workstream map

| Workstream | GitHub spec | Start state | Blocked by |
| --- | --- | --- | --- |
| KR-07 Retrieval benchmark and CI gate | [#176](https://github.com/AgentsKit-io/doc-bridge/issues/176) | Todo, Urgent | — |
| KR-01 Lexical ranking and full corpus | [#170](https://github.com/AgentsKit-io/doc-bridge/issues/170) | Todo, High | — |
| KR-02 Markdown analyzer on remark | [#171](https://github.com/AgentsKit-io/doc-bridge/issues/171) | Todo, High | — |
| KR-03 Code areas and area scope | [#172](https://github.com/AgentsKit-io/doc-bridge/issues/172) | Todo, High | — |
| KR-05 Per-entity hashes, incremental scan | [#174](https://github.com/AgentsKit-io/doc-bridge/issues/174) | Todo, High | — |
| KR-04 Graph layer on graphology | [#173](https://github.com/AgentsKit-io/doc-bridge/issues/173) | Backlog | KR-02, KR-03 |
| KR-06 Retrieval projection and ranking | [#175](https://github.com/AgentsKit-io/doc-bridge/issues/175) | Backlog | KR-01…KR-05 |
| KR-08 Budgeted MCP tools, measured doctor | [#177](https://github.com/AgentsKit-io/doc-bridge/issues/177) | Backlog | KR-06, KR-07 |
| KR-09 Markdown renderings on knap | [#178](https://github.com/AgentsKit-io/doc-bridge/issues/178) | Backlog | KR-03, KR-05, KR-06 |
| KR-10 Enrichment overlay | [#179](https://github.com/AgentsKit-io/doc-bridge/issues/179) | Backlog | KR-04, KR-05, KR-06 |
| KR-11 Overlay stats, assisted study arm | [#180](https://github.com/AgentsKit-io/doc-bridge/issues/180) | Backlog | KR-07, KR-10 |

## One workstream at a time

Two mechanisms, both deliberate:

1. **`machine.ceiling: 1`.** The loop admits at most one worker regardless of how many CPUs or how much RAM the machine has. Six of the eleven workstreams extend a contract an earlier one defines (the retrieval projection, the ranking formula, the proposal schema), so two concurrent workers would write conflicting schemas.
2. **Dependency gating through Linear state.** `linear.states: [Todo, Ready]` is the dispatchable set. A blocked workstream sits in **Backlog**, which the loop never reads, and carries a `blockedBy` relation so the reason is visible in Linear. Priority orders the five that are dispatchable today.

**Promoting a workstream** when its dependencies have merged: move it from Backlog to Todo in Linear. Nothing else is needed; the next tick picks it up. Never promote a workstream whose `blockedBy` issues are not yet Done: its contract would be frozen against code that does not exist.

## Prerequisites on the operating machine

None of these live in this repository, and the loop doctor blocks on the first two.

| Requirement | Why | Check |
| --- | --- | --- |
| Orca runtime at or above 1.4.200 | worktrees, terminals, Linear access, scheduling | `orca --version`, `orca status --json` |
| `ak-harness` resolvable in Orca's environment | the scheduled automations invoke it | `npm i -g @agentskit/harness` |
| `agentskit-review` on PATH | the deliver stage reviews every green head before merge | `agentskit-review --help` |
| `gh` authenticated | pull request status and the merge call | `gh auth status` |
| At least one provider CLI logged in | orchestrator, builder, reviewer and watcher roles | `claude`, `codex`, `grok` or `opencode` |
| A built Doc Bridge index in the main checkout | deterministic context for the orchestrator | `node bin/ak-docs.js index` |

`orca.bin` is set to `orca`. **On Linux outside an Orca terminal, change it to `orca-ide`**: bare `orca` is the GNOME screen reader and the doctor will report that it did not answer `--version`.

The Doc Bridge index is gitignored, so a fresh clone has none until `ak-docs index` runs. `contract.docBridgeMaxAgeHours` (168) warns when it goes stale, and `contract.requireDocBridge` is `false`, so a missing index degrades context rather than blocking a dispatch. That default is deliberate for these workstreams: their whole point is that Doc Bridge retrieval is currently weak. Revisit it once KR-01 and KR-06 have merged.

## First run

```bash
# from the main checkout
cp loop.config.example.yaml loop.config.yaml          # then fill in the linear: identity block
node bin/ak-docs.js index                                  # deterministic context for the orchestrator
ak-harness loop validate -f loop.config.yaml               # schema + effective config + hash
ak-harness loop doctor   -f loop.config.yaml --json        # readiness; exit 1 on a blocking check
ak-harness loop tick --dry-run --max 1                     # plan one dispatch, print the orca argv, write nothing
```

`loop install` is the guided path: it offers to create the gitignored `loop.config.local.yaml` overlay, runs the doctor and the automation-environment checks, offers a dry-run rehearsal, and only then creates the two Orca automations (`loop-docbridge-tick` and `loop-docbridge-deliver`). Both run under `schedule.runner: precheck`, so the stage *is* the precheck command: Orca records each run as `skipped_precheck` with the report in its output and never opens an agent session.

```bash
ak-harness loop install -f loop.config.yaml                # guided; --dry-run to see the plan only
ak-harness loop status                                     # what Orca knows: enabled, trigger, last run
```

## Daily operation

```bash
ak-harness loop debrief                    # in flight, held, escalated, cooldowns — reads local state only
ak-harness loop watch --issue ABC-123     # DONE | FAILED | ACTION_REQUIRED | PROGRESS
ak-harness loop paused                     # workstreams auto-paused after repeated failures
ak-harness loop resume ABC-123            # clear a pause, or remove the loop:paused label in Linear
ak-harness loop retro --since 7d           # digest plus one knob to turn in loop.config.yaml
```

`loop debrief` touches neither Orca nor `gh`, so it is safe from a session hook or a chat agent that needs context before acting.

## What a human still decides

- **Promoting a blocked workstream** out of Backlog. The loop never reorders its own queue.
- **Anything touching `delivery.selfEditPaths`.** A pull request that edits `loop.config.yaml`, `.github/**`, `.codex/verification.json` or the PRD is held with a comment and never auto-merged, even with a clean review.
- **A workstream that exhausts `maxFixRounds` (2).** It is labelled `blocked`, commented, returned to Todo, and its worktree and pull request are kept for inspection.
- **A `needs-info` escalation.** The orchestrator could not freeze a contract with at least one executable outcome and no blocking ambiguity, so it commented instead of consuming a slot. Usually the Linear description needs a decision a human owns.
- **Review findings the loop cannot resolve.** `delivery.review.minSeverity: med` is the floor that blocks auto-merge.

## Configuration notes specific to this repository

| Setting | Value | Why |
| --- | --- | --- |
| `delivery.verifyCommand` | `pnpm typecheck && pnpm test` | doc-bridge has no `lint` script; this is what CI enforces on `master` |
| `project.setup.command` | `pnpm install --frozen-lockfile` | a fresh Orca worktree has no `node_modules`; without it every dispatch loses its first minutes |
| `contract.briefScopes` | `[agent-corpus]` | `corpus.agent.root` is `docs/agent-corpus`, the only surface in the index, so it is the only scope worth listing in a brief |
| `brief.skills` | `CONTRIBUTING.md`, `docs/for-agents.md`, `docs/agent-corpus/OVERVIEW.md`, `docs/skills/doc-bridge.md` | pinned verbatim and hashed into `dispatch.json`; a missing path fails the dispatch rather than sending a worker without promised guidance. This repository has no root `AGENTS.md`, so the routing convention comes from the corpus overview |
| `models.effort.builder` | `high` | these workstreams are contract-heavy (schema compatibility, hashing, determinism); a wrong contract costs a full fix round |
| `memory.enabled` | `false` | no approved learnings exist yet; enable after the first `loop retro` promotes some |

`loop.config.yaml`, `loop.config.local.yaml` and `.codex/loop/` are all gitignored: the first identifies a Linear workspace and person, the second is machine-specific (queue owner, RAM reserve, worker ceiling), and the third is runtime state (ledger, contracts, cooldowns, `events.ndjson`). Only `loop.config.example.yaml` is tracked, so a change to the tuned settings is reviewable without publishing anyone's identifiers. When you change a tuned setting locally, mirror it into the example file; a pull request touching either is held by `delivery.selfEditPaths` and never auto-merged.
