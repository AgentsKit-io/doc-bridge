---
'@agentskit/doc-bridge': minor
---

Measure enrichment: what a run cost, what it invented, whether it improved retrieval at all — and
give the controlled study mechanical expectations, a third arm that reports its own readiness, and
tokens to first evidence.

The overlay reported what it accepted, which is the one number an agent cannot fail: a curator that
proposes a hundred things and has ninety rejected looked exactly like one that proposes ten good
ones. Nothing said whether any of it helped retrieval. And the study could not answer the question
either — its last round recorded zero semantic successes in both arms, because a task whose only
success criterion is a model's opinion produces no signal, and `registry-assisted` had been reserved
since the first suite without ever running.

`EnrichmentStats` now carries the whole shape of a run: counts per kind, a rejection histogram over
the closed reason list, cost as agent runs, input and output bytes, cache hit rate and measured wall
time, and `inventedReferences` — rejections that named something the repository does not contain,
counted apart from the rejection total because a curator wrong about a judgement and one making
things up are different problems. `enrichmentStability` compares a run with the previous one:
identical overlay hashes for a deterministic agent, and for a live model the share of proposal
identifiers present in both runs, over the union, so proposing fewer things does not read as more
stable. `stats` stays outside the overlay's content hash.

`ak-docs bench retrieval <suite> --overlay` and `ak-docs enrich --retrieval-delta` run the golden
suite twice over one snapshot — once with the accepted overlay projected, once without — and report
the delta in both text and JSON, with the case ids gained and lost at hit@3. Both project their own
indexes, so neither needs an index on disk. An overlay may leave retrieval unchanged and it may
improve it; if it lowers hit@3 the run exits 1 and says so, as a finding about the agent rather than
a new baseline.

A study task may declare `expectedEntities`, `expectedDocuments` and `retrievalQueries` as opaque
references, resolved to concrete entities and documents by a local `StudyExpectationsV1` file that
declares `scope: 'local'`, binds to the suite hash and is never published. `ak-docs study
expectations` turns the pair into an Open Eval Format suite and checks it with the same benchmark
that gates this repository's retrieval: an unresolved reference fails, and a task with no
expectations is reported unchecked rather than counted as a pass. A rubric item may now name the
mechanical check that decides it, and the model adjudicator receives only the items no checker can
settle — the settled ones travel beside them as context, not for review.

The assisted arm reports its own readiness. Missing provider, missing scenario or missing agent
identity make it unavailable, and its executions are then recorded as unavailable observations with
`errorCode: 'registry-unavailable'` rather than skipped or failed: a scenario absent from a ledger
is indistinguishable from one that was never planned. A missing `promptVersion` or `agentBudget` does
not cost the arm its run; it is reported as undeclared. `tokensToFirstEvidence` is a primary metric
per scenario, and the enrichment agent's own tokens, runs and cost are recorded apart from the
model's while still landing in the total.

The committed 24-task suite, run plan and ledgers are deliberately unchanged: the suite's hash is
bound to published artifacts, and the targets an expectations file would resolve belong to study
repositories that are not in this one.
