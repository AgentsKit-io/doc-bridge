---
owner: maintainers
lifecycle: active
sourceOfTruth: scripts/bench-layer1.mjs
validationPath: node scripts/bench-layer1.mjs --self-check
---

# Layer-1 benchmark v2

The [v2 cases](../bench/layer1-cases-v2.json) extend the
[frozen v1 protocol](benchmark-layer1-v1.md) without changing frozen v1 inputs or
index/handoff schemas. [Results](../bench/layer1-results-v2.md) separate native
mutations, authored fixtures and real historical Git commit pairs. Review candidates
remain `stale-or-unverified`; detecting a changed citation does not confirm
semantic divergence.

## Run and identity

Build and generate the gitignored index as documented in v1, then run serially:

```sh
node scripts/bench-layer1.mjs --self-check
node scripts/bench-layer1.mjs --cases docs/bench/layer1-cases-v2.json --output /tmp/layer1-v2-a.json --markdown /tmp/layer1-v2-a.md
node scripts/bench-layer1.mjs --cases docs/bench/layer1-cases-v2.json --output /tmp/layer1-v2-b.json --markdown /tmp/layer1-v2-b.md
```

Compare both raw JSON and runner-rendered Markdown bytes. Run the default
command twice for v1 as well. The published report adds maintained review notes
and the fresh v1 comparison; reproducibility hashes identify the deterministic
runner outputs separately from those narrative appendices. `--cases` selects a repository-contained suite; omitted means v1.
Raw results remain outside the checkout. No clocks, temporary checkout paths or
subprocess output enter reports. Engine revision/bundle hash and suite hash bind
evidence; changing the engine invalidates comparisons. Acquisition failures exit
2, native target failures exit 1, and measurements meeting native targets exit 0.
Historical/fixture scores never rescue a native failure or justify engine tuning.

V1 case SHA-256 remains
`0264264d3b390b8dc0cbf48b1d721ea336abcf26c51e9dab1bead42543e5ff0f`.
V1 is still runnable and its published result file is not overwritten. V2 carries
`suiteVersion: 2` alongside the existing case-envelope `schemaVersion: 1`.

## Fixture repairs and gold

The fixture bin belongs to a declared workspace package. The root-only workspace
gets an explicit fixture entry; existing wildcard workspaces retain their native
membership. Configuration claims use a fenced JSON example and an independent
same-package schema-export anchor. Citation lines are adjusted for the added anchor.
Command removal gold includes the old command-owned flag finding as well as the
command. These repairs change inputs/annotations only, never engine matchers.

`expected` scores default included findings and selected fact changes.
`rawExpected` independently scores `policy: false`; omission preserves v1's
single-gold behavior. Archived, decision-record, changelog and version-pinned
fixtures retain raw removed-symbol gold while expecting no included finding.
Policy dispositions are reported separately and are not conflated with truth.
All diagnostics in the selected document scope count; unrelated diagnostics
cannot silently disappear. An empty document scope remains a repository-wide
negative. Fact scope selects declared kinds/tokens. Line evidence is checked
before discovery, but scoring deduplicates token/path assertions rather than
claiming line-level recall.

## Historical review

The three immutable v1 repository pins and the additional public AgentsKit
monorepo pin declared in v2 bound first-parent mining. V1 repositories and case
bytes remain frozen. Historical
cases declare exact base/head commits; the runner verifies that base is head's
first parent before scoring unmodified checkouts. They have no authored setup or
mutation. Each `review` records the source location, prior citation lines,
positive/negative label and independently inspected reasoning. V2 admits
unrepaired drift at head and concurrent-update negatives; a later repair commit
is not required. Gold is not inferred from engine output. A document
changed in the same commit may still contain a stale claim, so changed-document status alone is not a negative.

The 39 historical cases include seven positive cases and 32 negative controls.
Review covers exhaustive stale configuration/type claims, compatible optional
parameters and fields, correctly updated unions, and retired documentation.
The original 20 cases retain their gold unchanged. Twelve retirement controls
share one transition and deleted README; parallel documentation sites and
multiple cited facts in a document are also correlated. Case count is separate
from distinct measured finding units and independent commit count. Added cases
with overlapping document scopes in the same transition are consolidated so a
shared diagnostic cannot inflate the retained finding denominator. The fourth
source adds stale exhaustive stream/scaffold unions and compatible type controls;
it does not change the native or fixture repository pins.

## Historical release gate

The measured set must contain at least 30 hand-reviewed historical cases,
including positive and negative controls. The historical
`finding/CHANGED_REFERENCE` default included precision must be at least 80%
over the findings actually emitted. At most 20% of negative cases may emit any
included `CHANGED_REFERENCE` finding (negative-case false-positive rate). Report
positive-case coverage alongside finding-unit recall; historical coverage must
not regress, and native and v2 fixture finding precision and coverage must stay
at 100%. Case count and emitted finding count remain separate measurements.
Raw scores and frozen v1 score changes are reported independently. A failed
gate remains failed even when the runner exits successfully for native targets.

The sample is purposive and does not estimate prevalence, semantic prose recall,
confidence intervals or repository-wide readiness. Changed documentation is not
automatically correct, and an unchanged example that still accepts a compatible
API is not automatically stale. Unsupported citation syntax/extraction remains
visible as an FN. Every remaining FP/FN must be explained against source and
document evidence; gold cannot be rewritten to fit the engine.
