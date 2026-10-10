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

`--dry-run` validates the matrix without network or credentials; optional roots
add clean pinned-corpus/source checks. `--pilot` selects two paired observations;
`--run` selects 36. Execution additionally requires `--approve-budget`, the model,
environment-only credential, positive upper input/output prices, cumulative USD
cap, required corpus roots and a new private outside-checkout output path.

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

Validation: `pnpm vitest run tests/study-minimal.test.ts --maxWorkers=2` covers
mocked HTTP, budgeting, usage, tools, frozen Git reads and actual local MCP without
a model; `node scripts/study-minimal.mjs --dry-run` exercises the shipped command.
