---
'@agentskit/doc-bridge': minor
---

Add `ak-docs parity`: a registry of the claims this repository makes in public, the repository facts
they stand for, and a gate that fails when a public surface states something the repository has
moved past.

Four figures from the published A/B round appear in `README.md` and again in `docs/study/README.md`.
They agree today, and nothing made them agree: an edit to one, or a new round replacing the artifact
both quote, would leave two public surfaces stating a number the repository no longer measures, with
no mechanism for noticing but a person reading both pages on the same day.

`docs/parity/public-claims-v1.json` is a sealed registry. A claim names what it asserts, who owns
it, how it appears in prose (`{value}` inside a template, optionally worded differently per
surface), which surfaces must carry it, and where the canonical value comes from: a field in
`package.json`, a dotted path into a committed artifact, a sum across an array in one, a count over
the snapshot, a figure the doctor measured, or the presence of a CLI command. Numbers render the way
prose states them, and two transforms are signed on purpose — "18.46% fewer" and "39.75 seconds
lower" carry their direction in a word the checker cannot read, so a measurement that turns positive
stops resolving instead of matching the same digits for the opposite result.

The four outcomes stay apart because they need different actions: `PARITY_STALE` (a surface states a
value the repository moved past), `PARITY_MISSING` (a required surface omits the claim),
`PARITY_CONTRADICTION` (two public surfaces disagree — always blocking, and the one an agent cannot
resolve for itself) and `PARITY_NOT_ANALYZED` (the value could not be resolved: reported, never
counted as a pass). Every finding carries the claim's owner, the exact surface and line, both
values, a bounded redacted excerpt and a remediation. An exception accepts one finding on one
surface and requires a reason and an approver; it stays visible in the report rather than silencing
the claim.

`ak-docs parity [--claims <file>] [--json|--text]` exits 1 on a blocking finding, and CI runs it in
the dogfood step next to the index, the gate, the doctor and the retrieval benchmark. On this
repository the registry starts with seven claims over three surfaces, and the run that introduced it
found two real problems: a claim of mine pointed at the wrong field, and the command was not yet in
the CLI reference.

The report is publication-safe by construction — repository-relative paths, bounded excerpts,
secrets redacted, no document contents — and a test asserts that against a fixture containing a
secret-shaped string.
