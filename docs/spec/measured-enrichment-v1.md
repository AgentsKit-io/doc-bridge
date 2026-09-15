---
title: Measured enrichment v1
description: What an enrichment run cost, what it invented, whether it improved retrieval at all, and the study measurements — mechanical task expectations, the assisted arm, tokens to first evidence — that decide the same questions for a controlled round.
---

# Measured enrichment v1

An enrichment stage nobody measures is a stage nobody can defend.

[Enrichment overlay v1](./enrichment-overlay-v1.md) made agent proposals typed, validated and
bounded. It did not say whether any of it helped. The overlay reported what it accepted, which is
the one number an agent cannot fail: a curator that proposes a hundred things and has ninety
rejected looks exactly like one that proposes ten good ones. And the controlled study could not
answer the question either — its last round recorded zero semantic successes in both arms, because
a task whose only success criterion is a model's opinion produces no signal, and its third arm has
been reserved since the first suite without ever running.

This document is the measurement layer: the whole shape of an enrichment run, the retrieval delta
that can block it, and the study machinery that asks the same questions of a controlled round.

## What the run reports

`EnrichmentStats` in `src/schemas/enrichment.ts` is written by `runEnrichment` and stored on the
overlay. It is deliberately outside the overlay's content hash — two runs over one unchanged
repository must agree on their decisions while disagreeing about how long they took.

| Field | Meaning |
| --- | --- |
| `byKind` | Per proposal kind: `proposed`, `accepted`, `pending`, `rejected`. Sorted by kind, so two runs produce the same bytes. |
| `rejectionReasons` | A histogram over the closed list of rejection reasons, sorted by reason. A run's rejections are comparable across runs rather than a log to read. |
| `inventedReferences` | Rejections that named something the repository does not contain. |
| `agentRuns`, `inputBytes`, `outputBytes` | What was actually sent and received. Batched packs, so a run is not a call count. |
| `cacheHits`, `cacheHitRate` | Hits, and hits over hits plus runs, rounded to six places. |
| `wallTimeMs` | Measured from a monotonic clock, not derived. `runEnrichment` takes a `clock` option so a test can pin it. |
| `expired` | Entries whose target content hash moved since they were accepted. |

`enrichmentCost(stats)` in `src/enrich/stats.ts` is the same numbers as an object for a reader who
only wants the bill; `ak-docs enrich --json` reports it under `cost`.

### Invented references

`INVENTED_RELATION_REASONS` is `unknown-endpoint`, `unknown-entity`, `unknown-scope`,
`unknown-directory`, `unknown-diagnostic`. `inventedReferences` counts exactly those, and it is
reported next to the rejection total rather than folded into it.

The distinction is not cosmetic. A curator that classifies a document badly is wrong about a
judgement, and a validator rejecting it is the system working. A curator that proposes a relation
to a module the repository does not contain is making things up, and that number must trend to
zero or the agent is unusable. Folding the two together hides the second inside the first.

A schema failure or an unknown kind is a rejection and not an invention: `invalid-kind` is not in
the list, and a test asserts the counts stay apart.

### Stability

`enrichmentStability(current, previous)` compares a run with the one before it and reports both
halves of the question at once:

- `overlayHashIdentical` — a deterministic agent over an unchanged repository must reach this. The
  overlay hash covers decisions, not `acceptedAt` and not `stats`, so a second run that is answered
  entirely from the cache produces the same hash as the first.
- `proposalIdShare` — for a live model, which will not reach an identical hash, the share of
  proposal identifiers present in both runs. The share is over the **union** of the two runs'
  identifiers, so a run that merely proposes fewer things does not score as more stable.

`sharedProposalIds`, `proposalIds` and `previousProposalIds` are reported next to the share, because
a share of 0.5 over two identifiers and over two hundred are different facts.

## The retrieval delta

`measureOverlayRetrievalDelta` in `src/bench/overlay-delta.ts` answers the question the rest of the
statistics cannot: did the overlay make retrieval better?

It runs the golden suite twice over **one snapshot** — once with the accepted overlay projected,
once with `overlay: 'ignore'` — so the only difference between the two runs is the overlay. Not a
re-scan, not a different revision, not a different configuration. Neither half needs an index on
disk: both are projected from the snapshot the caller passes.

The rule is asymmetric on purpose. An overlay may leave retrieval unchanged and it may improve it,
but it must not lower `hitAt3` (`OVERLAY_BLOCKING_METRIC`): aliases, summaries and rank hints an
agent proposed exist to help an agent find things. A drop is reported as `regression: true` with
status `regressed`, and the caller exits non-zero. It is a finding about the agent, never a new
baseline.

The result carries both metric sets, a per-metric delta with `improved` and `worsened` (lower is
better for `meanContextBytes`, `meanApproxTokens` and `zeroResultRate`), and — the part that makes a
regression actionable — `lostCases` and `gainedCases`, the case ids that changed at hit@3.

```bash
# The overlay on disk, against the configured golden suite.
ak-docs bench retrieval docs/bench/retrieval-suite-v1.json --overlay --text

# Or as part of the run that produced it.
ak-docs enrich --retrieval-delta --json
```

Both exit 1 on a regression. Both report the delta in text and in JSON: `formatOverlayRetrievalDeltaText`
for a person, `retrievalDelta` (or `overlayDelta`) for a machine. The delta is opt-in because it runs
the suite twice, which is the right cost for an answer about whether the overlay helped and the wrong
cost for every routine run.

## Study task expectations

The study's correction is the same idea one level up: state what retrieval is expected to return,
and check it deterministically.

A task in `docs/study/task-suite-v1.json` may now declare `expectedEntities`, `expectedDocuments`
and `retrievalQueries`. The references are **opaque** — `primary-entrypoint`, not `docs/alpha.md` —
because the task suite is publication-bound and a repository path in it is a privacy failure, not a
convenience. A query with nothing expected is refused by the schema: it would check nothing.

The resolution lives in a second artifact, `StudyExpectationsV1` in `src/study/expectations.ts`,
which declares `scope: 'local'` and binds to the suite by `taskSuiteHash`. It maps each reference to
the concrete entity ids or document paths it stands for in one repository on the operator's disk.
It is never published; putting it under `docs/study/` would fail the privacy gate, which is the
intended outcome rather than a bug. References resolved against a suite that has moved on are
refused outright.

`studyRetrievalSuite` turns the pair into an ordinary Open Eval Format suite — one case per task
query, with the resolved targets as `expectedTargets` and the task, repository and category carried
in metadata — so the same command, the same ranking and the same metrics that gate this
repository's retrieval answer the study's mechanical questions. `checkStudyExpectations` runs it:

```bash
ak-docs study expectations docs/study/task-suite-v1.json \
  --expectations ./local-study-expectations.json --index .doc-bridge/index.json --text
```

`ok` requires that every reference resolved **and** every case hit. Two failures are reported rather
than smoothed over: a task that declares no expectations is listed under `withoutExpectations` as
unchecked, never counted as a pass, and an unresolved reference fails the check, because an
expectation nobody resolved is an expectation nobody tested — which is exactly the failure this
replaces. The command exits 1 when the check does not pass.

`validateStudyTaskSuite(suite, { requireExpectations: true })` names the tasks that cannot be checked
mechanically. It is off by default: a suite written before expectations existed is still a valid
suite.

### Where the model adjudicator stops

A rubric item may now be prose, or prose with the mechanical check that decides it
(`acceptance-checks`, `evidence-coverage`, `retrieval-expectations`). `mechanicalRubricItems` and
`modelRubricItems` split the rubric on that field, and `adjudicatorRubric(task)` is what the
adjudicator input carries: `rubric` holds only the items no checker can settle, and the settled ones
travel next to them as `mechanical` — verdicts, for context, not for review. The instruction says so
in the same words.

Handing a model an item the runner already measured invites it to disagree with a measurement, which
is how a study ends up with an opinion where it had a number.

## The assisted arm

`registry-assisted` has been reserved since the first suite and has never executed. It now reports
its own readiness, and `assistedArmReadiness(plan, providers, suite)` is the only thing that decides
whether it runs:

| Status | When | Effect |
| --- | --- | --- |
| `unavailable` | No assisted scenario in the plan; the scenario names no agent identity and version; no provider CLI for the scenario and a model the suite uses | Its executions are recorded as unavailable observations |
| `ready` with `undeclared` | The scenario declares no `promptVersion`, or no `agentBudget` | The arm runs; the run says what it could not name |
| `ready` | Everything declared | The arm runs |

An unavailable arm is **recorded, not skipped**: a scenario absent from a ledger is
indistinguishable from one that was never planned, and comparing the arms it planned is the study's
whole purpose. Each such execution lands in the ledger with `execution.status: 'unavailable'`,
`errorCode: 'registry-unavailable'`, and an automated adjudication of `blocked` carrying the reason.
A missing Registry is a fact about the environment, not a reason to lose the other two arms —
`assertRunInputs` skips provider validation for those executions so the rest of the run proceeds.

A missing declaration is the other way round: losing the third arm over an undeclared prompt version
would be worse than running it without one, so the arm runs and `undeclared` says what a reader
cannot reconstruct from the ledger — the prompt it used, or the agent's cost apart from the model's.
The run summary prints the status, the reason and the undeclared fields.

A run plan may declare `promptVersion` and `agentBudget` only on `registry-assisted`: the other two
arms have no agent to budget.

## Tokens to first evidence

The parent PRD's second claim is that an agent reaches correct grounded evidence for fewer tokens
than by reading the repository. Total tokens at the end of a task does not test that claim: a run
that wandered for ten thousand tokens and then found the answer looks the same as one that landed on
it immediately.

`tokensToFirstEvidence` is a canonical provider measurement — tokens consumed before correct
grounded evidence was in hand — and the metrics report its p95 per scenario as
`tokensToFirstEvidenceP95`, rounded up to whole tokens. It is in the improvement list, so a round
that reaches evidence sooner reads as an improvement, and absent or partial coverage is reported as
`tokensToFirstEvidence` or `tokensToFirstEvidence-partial` under `missingMetrics` rather than as a
zero.

The assisted arm's enrichment agent is costed apart from the model: `registryAgentInputTokens`,
`registryAgentOutputTokens`, `registryAgentCostUsd` and `registryAgentRuns`. `registryAgentCostUsd`
is added into `totalCostUsd`, so the arm cannot look cheap by charging its work to a line nobody
adds up, and `missingMetrics` names it when an assisted observation reports no agent cost at all.
The scenario line in `--text` prints the p95 next to the agent cost and its run count.

## Invariants

- `stats` is outside the overlay's content hash. Cost and timing may differ between two runs that
  decided identically.
- `inventedReferences` counts only `INVENTED_RELATION_REASONS`, and is reported separately from the
  rejection total.
- `proposalIdShare` is over the union of both runs' identifiers.
- The retrieval delta builds both indexes from one snapshot. An overlay on disk cannot leak into the
  baseline half.
- An overlay that lowers hit@3 is a regression with a non-zero exit, in every mode.
- A study task's expectations are opaque references. A path or a URL in a publication-bound artifact
  is a privacy failure, and the privacy gate is what says so.
- An unresolved reference fails the check; a task without expectations is reported unchecked and is
  never a pass.
- A rubric item with a mechanical check never reaches the model adjudicator.
- An unavailable assisted arm is recorded as unavailable observations, and never fails the study.

## Deviation: the committed study suite

The mechanism above is delivered and tested; the committed 24-task suite, run plan and ledgers are
**not** rewritten to use it.

Two reasons, both about not making the artifacts worse. The suite's content hash is bound to
published artifacts — the run plan's `taskSuiteHash`, the observation ledgers, the verification
binding — and changing it invalidates every one of them. And the concrete targets an expectations
file would resolve belong to the six study repositories, which are not present in this repository,
so the references could only be guessed.

An operator adding expectations to a round therefore does three things: add `expectedEntities`,
`expectedDocuments` and `retrievalQueries` to the tasks, re-seal the suite, and write the local
expectations file that resolves the references against their checkouts. `ak-docs study expectations`
then reports which tasks can be answered mechanically and which cannot.
