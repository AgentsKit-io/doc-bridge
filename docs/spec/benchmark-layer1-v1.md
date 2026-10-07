---
owner: maintainers
lifecycle: active
sourceOfTruth: scripts/bench-layer1.mjs
validationPath: node scripts/bench-layer1.mjs --self-check
---

# Layer-1 benchmark v1

The [frozen cases](../bench/layer1-cases-v1.json) measure deterministic
`discoverRepository` → `diffSnapshots` against independently inspected source
mutations and documentation citations. [Published results](../bench/layer1-results-v1.md)
report native corpus numbers separately from authored fixtures. The benchmark
does not change the engine, schemas, routing, or CLI.

## Run

Build with `pnpm build`, then run:

```sh
node scripts/bench-layer1.mjs --self-check
node bin/ak-docs.js index
node scripts/bench-layer1.mjs --output /tmp/layer1-results.json --markdown docs/bench/layer1-results-v1.md
```

Raw JSON must be outside the worktree. The runner shallow-clones the three public
repository URLs, checks out exact 40-character SHAs, applies only declared edits
inside task-owned temporary checkouts, and removes those checkouts in `finally`.
No dependency installation or upstream code execution occurs. Git downloads are
corpus acquisition; discovery/diff remain deterministic and network-free.
Download failure produces `unavailable`, not a negative case or a passing result.
An unavailable or invalid case exits 2. Native finding precision below 95% or
coverage below 90% exits 1; meeting both targets exits 0. Fixture metrics cannot
rescue a native failure. Git and a built engine are prerequisites.

## Ground truth

Each case declares repository, mutation preconditions, citation paths/lines,
expected units and observation scope before the engine runs. Native citations
were located by literal grep and source/Markdown inspection, independently of
engine entities and relations. Runtime citation checks run before discovery.
Mutation occurrence counts prevent a changed source from silently changing the
experiment. Case SHA-256 binds results to these expectations; bundle SHA-256 and
source commit identify the tested engine. Working changes are benchmark artifacts
only; a new engine build invalidates earlier evidence.

Native mutations cover documented symbols, required function arguments,
commands/flags, schema keys and an operational configuration default. Internal
parentheses/whitespace changes and uncited exports are negative controls.
Absent native surfaces are explicitly listed as not applicable in the suite.
Fixture cases add newly authored inputs to downloaded checkouts and cover each
kind, competing export owners, default changes, uncited symbols and
ADR/CHANGELOG/historical/version-pinned negatives. These inputs are not copies
of upstream content and never count as native corpus evidence.

Historical mining uses first-parent commit diffs to shortlist changed export
tokens appearing in later Markdown diffs. Manual inspection must confirm that a
later commit repairs the same stale claim before a pair becomes a case with
base/head and repair SHAs. Concurrent documentation updates, release rollups,
new APIs and unrelated token overlap do not qualify. The current bounded search
confirmed no delayed repairs; fewer than ten is reported honestly, and historical
recall is not analyzed. The case file records the window and rejected examples.

## Scoring and limits

A unit is `(case, channel, kind, operation, token, relative path)`. Multiple
citations/relations for that token in the same file count once. Line locations
remain independently recorded ground truth and observed evidence; this version
does not claim line-level recall. Frozen scopes select fact kinds/tokens and doc
files. Every raw finding in a scoped doc file is scored, including unrelated
tokens; out-of-scope documents and secondary fact kinds are not analyzed.
An empty document scope means a repository-wide no-finding negative, so uncited
mutations cannot hide an unexpected diagnostic.

Precision is `TP / (TP + FP)`; coverage means recall, `TP / (TP + FN)`.
Empty denominators are `n/a`. Native and fixture-backed metrics are separate,
with per-kind and overall counts and an entry for every FP/FN. Facts and
documentation findings also have separate channels: an extracted signature or
default delta is not a diagnosed stale document. `FACT_CHANGE` is only this
benchmark's expectation label for a stale signature/default assertion; it does
not add an engine diagnostic code. Raw diff currently emits reference diagnostics.

The raw API does not apply `routeFinding`, document classification or version
eligibility. A raw finding on a policy-negative document counts as noise at this
measured boundary, even though a separate policy stage could exclude it later.
No policy success is inferred from raw diff, and no extraction delta substitutes
for a missing diagnosis. Findings with uncertain status are counted as emitted
candidates, not proof that a broken reference is confirmed.

This small purposive corpus does not estimate repository-wide prevalence,
statistical confidence, semantic prose detection, rename proof, remediation
quality, UI behavior or release readiness. Missing historical evidence and
unsupported constructs remain visible. Expectations and engine behavior must
never be tuned silently to reach the targets.
