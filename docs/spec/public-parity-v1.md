---
title: Public parity v1
description: A registry of the claims this repository makes in public, the repository facts they stand for, and the gate that fails when a public surface states something the repository has moved past.
---

# Public parity v1

Documentation drifts silently, and the drift reaches readers before it reaches anyone who could fix it.

Four figures from the published A/B round appear in `README.md` and again in `docs/study/README.md`.
They agree today. Nothing made them agree: an edit to one of them, or a new round replacing the
artifact both quote, would leave two public surfaces stating a number the repository no longer
measures — and the only mechanism for noticing was a person happening to read both pages on the same
day.

`ak-docs parity` is that mechanism. A registry names each public claim and the repository fact it
stands for; the checker resolves the fact, finds the claim's occurrences, and reports the difference
with a file, a line, an owner and a remediation.

## The registry

`docs/parity/public-claims-v1.json` is a sealed artifact — `createPublicClaims` computes its content
hash, `parsePublicClaims` refuses a tampered one — holding claims and exceptions.

| Field | Meaning |
| --- | --- |
| `claimId` | A slug. Stable across rounds, because findings are keyed on it. |
| `statement` | What the claim asserts, for a reader of the report. Never a path or a URL. |
| `owner` | Who answers for it: an ownership id, a team, a handle. Every finding carries it. |
| `valueType` | `number`, `percent`, `semver` or `text`. Decides the capture. |
| `template` | How the value appears in prose, with exactly one `{value}`. Omitted for a presence claim. |
| `templates` | Per-surface wording, when one fact is stated differently in different places. |
| `evidence` | Where the canonical value comes from. Below. |
| `required` | Surfaces that must state the claim. One that omits it is a `missing` finding. |
| `optional` | Surfaces that may. Checked when present, never required. |
| `severity` | `error` blocks the gate; `warn` is reported and does not. |
| `remediation` | What to do about a finding. Written once, in the registry, not per finding. |

### Evidence

Every resolver is deterministic and local. Nothing reaches the network, and nothing asks a model.

| Kind | Resolves to |
| --- | --- |
| `package-field` | A scalar field in `package.json` — `version`, `description`. |
| `artifact-field` | A dotted path into a committed JSON artifact: `arms.1.completedRate`. |
| `artifact-sum` | The sum of one numeric field across an array in an artifact: prose states a total where the artifact stores the parts. |
| `snapshot-count` | Entities of one kind in the snapshot this run produced. |
| `doctor-metric` | A figure the doctor measured: the grade, the score, reachability, connectivity, hit@3, agent-doc coverage. |
| `cli-command` | Whether the CLI's own usage offers a command. A presence claim: no template, no value to read. |

A numeric value can be rendered the way prose states it: `round`, `percent-1dp`, `percent-0dp`, and
two signed transforms. `negative-percent-2dp` and `negative-seconds-2dp` render the magnitude of a
negative measurement — "18.46% fewer", "39.75 seconds lower" — and **refuse to render a positive
one**. The direction of those claims lives in a word the checker cannot read, so a measurement that
turns stops resolving instead of matching the same digits for the opposite result.

## The four outcomes

They are kept apart because they need different actions.

| Code | Meaning | Blocks |
| --- | --- | --- |
| `PARITY_STALE` | A surface states a value the repository has moved past. | At `error` |
| `PARITY_MISSING` | A required surface does not state the claim at all. | At `error` |
| `PARITY_CONTRADICTION` | Two public surfaces state different values for one claim. | Always |
| `PARITY_NOT_ANALYZED` | The canonical value could not be resolved. | Never |

A contradiction is decided over the whole claim rather than per surface: two pages disagreeing is a
finding even when neither matches the repository, and it is the one an agent reading the
documentation cannot resolve on its own.

`PARITY_NOT_ANALYZED` is reported and never counted as a pass. A claim nobody could check is not a
claim anybody verified, and passing it quietly is how a parity report becomes decoration.

## Exceptions

An exception accepts a finding for one claim on one surface, and it must carry a `reason` of at
least eight characters and an `acceptedBy`. The finding still appears in the report, marked
`accepted` with its reason, and stops blocking. There is no way to silence a claim without saying
why in the artifact — silence is what drift needs.

## The gate

```bash
ak-docs parity                         # JSON: { ok, parity }
ak-docs parity --text                  # one line per finding, with its remediation
ak-docs parity --claims <file>         # a registry somewhere else
```

Exit 1 when any finding blocks, 0 otherwise, 2 on a broken registry or an unreadable surface. CI runs
it in the dogfood step, next to the index, the gate, the doctor and the retrieval benchmark, so a
pull request that edits a public number and not its siblings fails before review.

The doctor is measured only when a claim asks for one of its figures: that costs an index and a
benchmark run, and most registries never need it.

## Publication safety

The report is publication-safe by construction. It carries claim ids, repository-relative surface
paths, line numbers, the stated and canonical values, and a bounded excerpt of the matching line —
at most 160 characters, with secrets redacted through the same scanner the enrichment validators
use. It never carries a document's contents and never an absolute path: the registry's surface
paths are validated as repository-relative, so an operator's home directory cannot reach an
artifact that is meant to be shareable. A test asserts all of it against a fixture whose README
contains a secret-shaped string and a four-hundred-character line.

## Invariants

- The registry is sealed; a tampered hash is refused before anything is checked.
- A template's literal halves are escaped, so a registry cannot smuggle a pattern into the checker,
  and `{value}` becomes one bounded capture: no nesting, no ambiguity, nothing to backtrack over.
- A claim that states a value has a template; a presence claim has none. The schema enforces both.
- An exception needs a reason and an approver, and applies to one claim on one surface.
- A signed transform refuses a value whose sign no longer matches the prose.
- Two runs over one unchanged repository produce the same report content hash: findings are sorted,
  and nothing in the report is a timestamp.
- `missingSurfaces` names a surface the registry addresses that the checkout does not contain, so a
  claim cannot pass by pointing at nothing.
