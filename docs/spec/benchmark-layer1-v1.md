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

Raw JSON must be outside the worktree. The runner initializes temporary
repositories, fetches each exact pinned commit directly from the three public
repository URLs, checks out 40-character SHAs, applies only declared edits
inside task-owned temporary checkouts, and removes those checkouts in `finally`.
No dependency installation or upstream code execution occurs. Git downloads are
corpus acquisition; discovery/diff remain deterministic and network-free.
Download failure produces `unavailable`, not a negative case or a passing result.
The runner enables explicit garbage collection in a child process when needed
and collects between cases without increasing the engine memory ceiling. Empty
source acquisition or resource-limit coverage invalidates a case before scoring.
An unavailable or invalid case prints an explicit failure and exits 2. Native
finding precision below 95% or
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
files. Every included finding in a scoped doc file is scored, including unrelated
tokens; out-of-scope documents and secondary fact kinds are not analyzed.
An empty document scope means a repository-wide no-finding negative, so uncited
mutations cannot hide an unexpected diagnostic.

Precision is `TP / (TP + FP)`; coverage means recall, `TP / (TP + FN)`.
Empty denominators are `n/a`. Native and fixture-backed metrics are separate,
with per-kind and overall counts and an entry for every FP/FN. Facts and
documentation findings also have separate channels: an extracted signature or
default delta is not a diagnosed stale document. The frozen placeholder
`FACT_CHANGE` is mapped to the shipped `CHANGED_REFERENCE` contract without
changing any expected token, operation, path or citation line. These candidates
have `stale-or-unverified` status and are routed to Layer 2; scoring them does
not establish confirmed divergence precision. The suite hash changes to bind
this documented vocabulary alignment.

The primary score uses `diffSnapshots` with policy routing explicitly enabled,
matching the shipped default. Only included diagnostics (proposed or routed to
Layer 2) enter this score; excluded and pending-version dispositions are counted
separately in the frozen document scope. Policy counts use diagnostic identities;
score counts deduplicate assertion units, so those totals can differ.
The same base/head snapshots and head
text are also passed with `policy: false`, equivalent to CLI `--no-policy`, for
secondary raw scores. Both modes report every FP/FN and cause. No policy success
is inferred from raw diff and no extraction delta substitutes for diagnosis.

Acquisition failures identify the failed Git operation without exposing its
output. Mutation/citation failures retain their public relative path and exact
precondition. Engine failures are investigated separately; the benchmark must
not modify engine behavior to improve a score. Fixture setup/mutations may be
repaired only to restore declared preconditions, with maintenance documented;
expected locations and case membership remain frozen.

This small purposive corpus does not estimate repository-wide prevalence,
statistical confidence, semantic prose detection, rename proof, remediation
quality, UI behavior or release readiness. Missing historical evidence and
unsupported constructs remain visible. Expectations and engine behavior must
never be tuned silently to reach the targets.
