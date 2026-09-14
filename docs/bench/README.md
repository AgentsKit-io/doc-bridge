---
title: Retrieval benchmark
description: A deterministic, model-free measurement of whether a query returns the right entity, and the gate that stops a ranking change from making it worse.
---

# Retrieval benchmark

`ak-docs bench retrieval` answers one question: **does a query return the right thing?** It runs the deterministic retrieval path over a golden query suite, reports hit@1, hit@3, mean reciprocal rank and the context cost of the top three results, and compares the figures with an approved baseline. It uses no model, no network and no API key, and it finishes in well under a second on this repository, so it can gate every pull request.

This is workstream KR-07 of [#169](https://github.com/AgentsKit-io/doc-bridge/issues/169). It exists before the ranking work in KR-01 and KR-06 so those changes have a recorded "before" to improve on, rather than a claim.

## Run it

```bash
node bin/ak-docs.js index                                   # the benchmark measures the current index
pnpm bench:retrieval                                        # suite + committed baseline, text output
node bin/ak-docs.js bench retrieval docs/bench/retrieval-suite-v1.json --json
```

Exit codes: `0` when the figures hold, `1` on a hit@3 regression or a changed suite, `2` on a usage or input error.

## What it measures

| Metric | Meaning |
| --- | --- |
| `hitAt1` | Share of cases whose first result is an expected target |
| `hitAt3` | Share of cases with an expected target in the top three. **The gated metric** |
| `meanReciprocalRank` | Mean of `1 / rank`, `0` when no expected target appears |
| `meanContextBytes` | Mean serialized size of the top-three payload an agent would receive |
| `meanApproxTokens` | `meanContextBytes / 4`, reported as `tokenMethod: 'approximate'` |
| `zeroResultRate` | Share of cases where the query returned nothing at all |

Results are also segmented `byLang` and `byKind`, because an aggregate average hides exactly the failures that matter: on the first run, ownership routing scored 100 percent while every exported-symbol query scored zero.

The result artifact carries **no timestamp and no latency**, so two runs over the same index and suite are byte-identical and their content hashes match. Wall time belongs in the terminal, never in a comparable artifact.

## The suite

[`retrieval-suite-v1.json`](./retrieval-suite-v1.json) is a valid [Open Eval Format](https://www.npmjs.com/package/@agentskit/core) document (`evalFormatVersion: 2026-04`), so the same dataset can be read by any runner that speaks the format. 60 cases across four kinds and two languages:

| Kind | Cases | What it asks |
| --- | --- | --- |
| `symbol` | 20 | An exported identifier, the way an agent types it: `reconcileKnowledge` |
| `path` | 8 | A file or directory: `src/mcp/server.ts` |
| `question` | 26 | Natural language, English and Portuguese |
| `ownership` | 6 | The routing question a handoff exists to answer |

Each case carries `metadata.expectedTargets`. **A target matches a result by entity id or by repository path**, which is what lets one suite survive the entity-identity changes coming in KR-01 through KR-06: `docs/mcp.md` keeps working when the index starts carrying `document:docs/mcp.md`, and a module target starts working once modules are projected into the index.

Each case also carries a portable `expected.regex` alternation over the same targets, so a generic Open Eval Format runner can compute pass or fail without knowing anything about Doc Bridge. A test asserts the two stay consistent, and another validates the whole suite with the real `validateEvalSuite` from `@agentskit/core/eval-format`, so the locally mirrored format cannot drift from the ecosystem one.

### Adding a case

Add it to the suite, then re-approve the baseline: a changed suite makes the old figures incomparable, so the gate fails closed rather than pretending otherwise.

```bash
node bin/ak-docs.js bench retrieval docs/bench/retrieval-suite-v1.json \
  --baseline docs/bench/retrieval-baseline-v1.json \
  --update-baseline --by "<your name>" --reason "Added three cases for the area entities"
```

## The baseline and the gate

[`retrieval-baseline-v1.json`](./retrieval-baseline-v1.json) holds the approved figures plus an approval record: who approved them, when, why, and the hashes of the result and index they were measured from. Three properties make it a gate rather than a suggestion:

- **A normal run never writes it.** Recording a baseline requires `--update-baseline` *and* `--by <name>`. Without an approver the command refuses.
- **It cannot be edited.** The file carries its own content hash; a hand-edited figure is rejected before any comparison happens.
- **A changed suite fails closed.** Comparing figures measured over different questions would be meaningless, so it is an error that only an explicit re-approval clears.

Only `hitAt3` blocks. Every other metric is reported: an improvement as `improved`, a decline as `warning`. So a change that lifts hit@3 while wrecking hit@1 passes the gate but says so out loud.

## The first baseline

Measured on `master` at 1.8.0, before any ranking work:

| Metric | Value |
| --- | --- |
| hit@1 | 21.7% |
| hit@3 | 23.3% |
| Mean reciprocal rank | 0.228 |
| Zero-result rate | 46.7% |
| Mean context | 243 bytes (~61 tokens) |

By kind: ownership 100%, question 26.9%, path 12.5%, **symbol 0%**. By language: English 20%, Portuguese 40%.

Those numbers are the diagnosis in the parent PRD turned into measurements. Nearly half of all queries return nothing, and not one of the twenty exported-symbol queries finds its module, because the index holds 11 agent sidecars while the snapshot holds 369 entities. KR-01 and KR-06 have to move these; this file is how anyone can check that they did.
