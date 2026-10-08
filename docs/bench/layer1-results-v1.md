---
owner: maintainers
lifecycle: active
sourceOfTruth: docs/bench/layer1-cases-v1.json
validationPath: node scripts/bench-layer1.mjs --self-check
---

# Layer-1 benchmark results v1

Native included documentation findings: precision **100.00%**, coverage **93.33%** (TP 14, FP 0, FN 1). Targets: native precision ≥95% met; native coverage ≥90% met.

The headline uses shipped default policy routing. Included means proposed or routed-to-L2; excluded and pending-version candidates are reported separately. Review candidates, including CHANGED_REFERENCE (stale-or-unverified, routed-to-L2), are not confirmed divergences.

Vocabulary alignment: frozen FACT_CHANGE expectations now use the shipped CHANGED_REFERENCE code. All 53 cases, expected locations, operations and tokens remain unchanged. This is contract vocabulary maintenance, not engine tuning.

Engine revision: `faed4b0dc5d9eab911883e42d2d0dfb41f8b03b4`. Engine bundle SHA-256: `601322f51a9f49d22e31def06fbe268586aaf54a63d9fa71fb688d2208e34c1e`.
Frozen case SHA-256: `0264264d3b390b8dc0cbf48b1d721ea336abcf26c51e9dab1bead42543e5ff0f`.

Coverage is recall: TP / (TP + FN). Precision is TP / (TP + FP). Units are distinct (case, channel, kind, operation, token, path); repeated citations in one document count once. Facts measure extraction/change detection separately from documentation findings.

Measured cases: 53; unavailable: 0; invalid: 0.

## Policy dispositions in frozen document scopes

Policy counts use diagnostic identities; scores deduplicate assertion units, so totals can differ.

| Origin | Proposed | Routed to L2 | Excluded | Pending version |
| --- | ---: | ---: | ---: | ---: |
| native | 11 | 3 | 0 | 0 |
| fixture-backed | 15 | 3 | 9 | 3 |
| historical | 0 | 0 | 0 | 0 |

## Default included scores

| Origin / channel / kind | TP | FP | FN | Precision | Coverage |
| --- | ---: | ---: | ---: | ---: | ---: |
| native: fact/cli-command | 4 | 0 | 0 | 100.00% | 100.00% |
| native: fact/cli-flag | 4 | 0 | 0 | 100.00% | 100.00% |
| native: fact/config-key | 3 | 0 | 0 | 100.00% | 100.00% |
| native: fact/signature | 2 | 0 | 0 | 100.00% | 100.00% |
| native: fact/symbol | 6 | 0 | 0 | 100.00% | 100.00% |
| native: finding/BROKEN_REFERENCE | 11 | 0 | 0 | 100.00% | 100.00% |
| native: finding/CHANGED_REFERENCE | 3 | 0 | 1 | 100.00% | 75.00% |
| native: finding-overall | 14 | 0 | 1 | 100.00% | 93.33% |
| native: fact-overall | 19 | 0 | 0 | 100.00% | 100.00% |
| fixture-backed: fact/cli-command | 4 | 0 | 2 | 100.00% | 66.67% |
| fixture-backed: fact/cli-flag | 4 | 0 | 2 | 100.00% | 66.67% |
| fixture-backed: fact/config-key | 9 | 0 | 0 | 100.00% | 100.00% |
| fixture-backed: fact/signature | 3 | 0 | 0 | 100.00% | 100.00% |
| fixture-backed: fact/symbol | 15 | 0 | 0 | 100.00% | 100.00% |
| fixture-backed: finding/AMBIGUOUS_REFERENCE | 3 | 0 | 0 | 100.00% | 100.00% |
| fixture-backed: finding/BROKEN_REFERENCE | 7 | 2 | 5 | 77.78% | 58.33% |
| fixture-backed: finding/CHANGED_REFERENCE | 3 | 0 | 3 | 100.00% | 50.00% |
| fixture-backed: finding-overall | 13 | 2 | 8 | 86.67% | 61.90% |
| fixture-backed: fact-overall | 35 | 0 | 4 | 100.00% | 89.74% |
| historical: finding-overall | 0 | 0 | 0 | n/a | n/a |
| historical: fact-overall | 0 | 0 | 0 | n/a | n/a |

## Secondary raw scores (--no-policy equivalent)

| Origin / channel / kind | TP | FP | FN | Precision | Coverage |
| --- | ---: | ---: | ---: | ---: | ---: |
| native: fact/cli-command | 4 | 0 | 0 | 100.00% | 100.00% |
| native: fact/cli-flag | 4 | 0 | 0 | 100.00% | 100.00% |
| native: fact/config-key | 3 | 0 | 0 | 100.00% | 100.00% |
| native: fact/signature | 2 | 0 | 0 | 100.00% | 100.00% |
| native: fact/symbol | 6 | 0 | 0 | 100.00% | 100.00% |
| native: finding/BROKEN_REFERENCE | 11 | 0 | 0 | 100.00% | 100.00% |
| native: finding/CHANGED_REFERENCE | 3 | 0 | 1 | 100.00% | 75.00% |
| native: finding-overall | 14 | 0 | 1 | 100.00% | 93.33% |
| native: fact-overall | 19 | 0 | 0 | 100.00% | 100.00% |
| fixture-backed: fact/cli-command | 4 | 0 | 2 | 100.00% | 66.67% |
| fixture-backed: fact/cli-flag | 4 | 0 | 2 | 100.00% | 66.67% |
| fixture-backed: fact/config-key | 9 | 0 | 0 | 100.00% | 100.00% |
| fixture-backed: fact/signature | 3 | 0 | 0 | 100.00% | 100.00% |
| fixture-backed: fact/symbol | 15 | 0 | 0 | 100.00% | 100.00% |
| fixture-backed: finding/AMBIGUOUS_REFERENCE | 3 | 0 | 0 | 100.00% | 100.00% |
| fixture-backed: finding/BROKEN_REFERENCE | 7 | 14 | 5 | 33.33% | 58.33% |
| fixture-backed: finding/CHANGED_REFERENCE | 3 | 0 | 3 | 100.00% | 50.00% |
| fixture-backed: finding-overall | 13 | 14 | 8 | 48.15% | 61.90% |
| fixture-backed: fact-overall | 35 | 0 | 4 | 100.00% | 89.74% |
| historical: finding-overall | 0 | 0 | 0 | n/a | n/a |
| historical: fact-overall | 0 | 0 | 0 | n/a | n/a |

## Case results

| Case | Origin | State | Default TP / FP / FN | Raw TP / FP / FN |
| --- | --- | --- | --- | --- |
| doc-bridge-symbol-rename | native | measured | 4 / 0 / 0 | 4 / 0 / 0 |
| doc-bridge-signature-change | native | measured | 3 / 0 / 0 | 3 / 0 / 0 |
| doc-bridge-config-rename | native | measured | 3 / 0 / 0 | 3 / 0 / 0 |
| doc-bridge-flag-rename | native | measured | 3 / 0 / 0 | 3 / 0 / 0 |
| doc-bridge-command-rename | native | measured | 3 / 0 / 0 | 3 / 0 / 0 |
| doc-bridge-default-change | native | measured | 1 / 0 / 1 | 1 / 0 / 1 |
| doc-bridge-internal-refactor | native | measured | 0 / 0 / 0 | 0 / 0 / 0 |
| doc-bridge-fixture-symbol-rename | fixture-backed | measured | 3 / 0 / 0 | 3 / 0 / 0 |
| doc-bridge-fixture-uncited-rename | fixture-backed | measured | 2 / 0 / 0 | 2 / 0 / 0 |
| doc-bridge-fixture-signature-change | fixture-backed | measured | 2 / 0 / 0 | 2 / 0 / 0 |
| doc-bridge-fixture-config-rename | fixture-backed | measured | 2 / 0 / 1 | 2 / 0 / 1 |
| doc-bridge-fixture-default-change | fixture-backed | measured | 1 / 0 / 1 | 1 / 0 / 1 |
| doc-bridge-fixture-flag-rename | fixture-backed | measured | 0 / 0 / 3 | 0 / 0 / 3 |
| doc-bridge-fixture-command-rename | fixture-backed | measured | 0 / 0 / 3 | 0 / 0 / 3 |
| doc-bridge-fixture-internal-refactor | fixture-backed | measured | 0 / 0 / 0 | 0 / 0 / 0 |
| doc-bridge-fixture-ambiguous | fixture-backed | measured | 2 / 0 / 0 | 2 / 0 / 0 |
| doc-bridge-fixture-negative-adr | fixture-backed | measured | 0 / 0 / 0 | 0 / 1 / 0 |
| doc-bridge-fixture-negative-changelog | fixture-backed | measured | 0 / 0 / 0 | 0 / 1 / 0 |
| doc-bridge-fixture-negative-historical | fixture-backed | measured | 0 / 0 / 0 | 0 / 1 / 0 |
| doc-bridge-fixture-negative-pinned-version | fixture-backed | measured | 0 / 0 / 0 | 0 / 1 / 0 |
| chat-symbol-rename | native | measured | 4 / 0 / 0 | 4 / 0 / 0 |
| chat-signature-change | native | measured | 2 / 0 / 0 | 2 / 0 / 0 |
| chat-internal-refactor | native | measured | 0 / 0 / 0 | 0 / 0 / 0 |
| chat-fixture-symbol-rename | fixture-backed | measured | 3 / 0 / 0 | 3 / 0 / 0 |
| chat-fixture-uncited-rename | fixture-backed | measured | 2 / 0 / 0 | 2 / 0 / 0 |
| chat-fixture-signature-change | fixture-backed | measured | 2 / 0 / 0 | 2 / 0 / 0 |
| chat-fixture-config-rename | fixture-backed | measured | 2 / 0 / 1 | 2 / 0 / 1 |
| chat-fixture-default-change | fixture-backed | measured | 1 / 0 / 1 | 1 / 0 / 1 |
| chat-fixture-flag-rename | fixture-backed | measured | 3 / 0 / 0 | 3 / 0 / 0 |
| chat-fixture-command-rename | fixture-backed | measured | 3 / 1 / 0 | 3 / 1 / 0 |
| chat-fixture-internal-refactor | fixture-backed | measured | 0 / 0 / 0 | 0 / 0 / 0 |
| chat-fixture-ambiguous | fixture-backed | measured | 2 / 0 / 0 | 2 / 0 / 0 |
| chat-fixture-negative-adr | fixture-backed | measured | 0 / 0 / 0 | 0 / 1 / 0 |
| chat-fixture-negative-changelog | fixture-backed | measured | 0 / 0 / 0 | 0 / 1 / 0 |
| chat-fixture-negative-historical | fixture-backed | measured | 0 / 0 / 0 | 0 / 1 / 0 |
| chat-fixture-negative-pinned-version | fixture-backed | measured | 0 / 0 / 0 | 0 / 1 / 0 |
| playbook-uncited-rename | native | measured | 2 / 0 / 0 | 2 / 0 / 0 |
| playbook-flag-rename | native | measured | 4 / 0 / 0 | 4 / 0 / 0 |
| playbook-command-rename | native | measured | 4 / 0 / 0 | 4 / 0 / 0 |
| playbook-internal-refactor | native | measured | 0 / 0 / 0 | 0 / 0 / 0 |
| playbook-fixture-symbol-rename | fixture-backed | measured | 3 / 0 / 0 | 3 / 0 / 0 |
| playbook-fixture-uncited-rename | fixture-backed | measured | 2 / 0 / 0 | 2 / 0 / 0 |
| playbook-fixture-signature-change | fixture-backed | measured | 2 / 0 / 0 | 2 / 0 / 0 |
| playbook-fixture-config-rename | fixture-backed | measured | 2 / 0 / 1 | 2 / 0 / 1 |
| playbook-fixture-default-change | fixture-backed | measured | 1 / 0 / 1 | 1 / 0 / 1 |
| playbook-fixture-flag-rename | fixture-backed | measured | 3 / 0 / 0 | 3 / 0 / 0 |
| playbook-fixture-command-rename | fixture-backed | measured | 3 / 1 / 0 | 3 / 1 / 0 |
| playbook-fixture-internal-refactor | fixture-backed | measured | 0 / 0 / 0 | 0 / 0 / 0 |
| playbook-fixture-ambiguous | fixture-backed | measured | 2 / 0 / 0 | 2 / 0 / 0 |
| playbook-fixture-negative-adr | fixture-backed | measured | 0 / 0 / 0 | 0 / 1 / 0 |
| playbook-fixture-negative-changelog | fixture-backed | measured | 0 / 0 / 0 | 0 / 1 / 0 |
| playbook-fixture-negative-historical | fixture-backed | measured | 0 / 0 / 0 | 0 / 1 / 0 |
| playbook-fixture-negative-pinned-version | fixture-backed | measured | 0 / 0 / 0 | 0 / 1 / 0 |

## Default false positives and false negatives

- doc-bridge-default-change FN: `["finding","CHANGED_REFERENCE","","surfaces.cli.bin","docs/spec/config-v1.md"]`. The native documentation uses bin?: string with a default comment. The strict-context matcher deliberately leaves this property signature unresolved: no owned base citation links it to surfaces.cli.bin, despite the extracted default delta. This remains an explicit native limitation.
- doc-bridge-fixture-config-rename FN: `["finding","BROKEN_REFERENCE","","benchLimit","packages/layer1-benchmark/docs/api.md"]`. Fixture-design limit: Set benchLimit to 10 by default has no schema or configuration-owner anchor. Strict owner scoping leaves this bare token unresolved; the frozen fixture is retained and matchers are not loosened to improve its score.
- doc-bridge-fixture-default-change FN: `["finding","CHANGED_REFERENCE","","benchLimit","packages/layer1-benchmark/docs/api.md"]`. Fixture-design limit: Set benchLimit to 10 by default has no schema or configuration-owner anchor. Strict owner scoping leaves this bare token unresolved; the frozen fixture is retained and matchers are not loosened to improve its score.
- doc-bridge-fixture-flag-rename FN: `["fact","cli-flag","removed","--bench-strict","packages/layer1-benchmark/src/cli.ts"]`. The pinned workspace manifest includes only the root package. The added fixture package bin is not an owned workspace CLI, so neither fixture CLI facts nor their documentation relations exist.
- doc-bridge-fixture-flag-rename FN: `["fact","cli-flag","added","--benchmarkbench-strict","packages/layer1-benchmark/src/cli.ts"]`. The pinned workspace manifest includes only the root package. The added fixture package bin is not an owned workspace CLI, so neither fixture CLI facts nor their documentation relations exist.
- doc-bridge-fixture-flag-rename FN: `["finding","BROKEN_REFERENCE","","--bench-strict","packages/layer1-benchmark/docs/api.md"]`. The pinned workspace manifest includes only the root package. The added fixture package bin is not an owned workspace CLI, so neither fixture CLI facts nor their documentation relations exist.
- doc-bridge-fixture-command-rename FN: `["fact","cli-command","removed","ak-bench-fixture inspect","packages/layer1-benchmark/src/cli.ts"]`. The pinned workspace manifest includes only the root package. The added fixture package bin is not an owned workspace CLI, so neither fixture CLI facts nor their documentation relations exist.
- doc-bridge-fixture-command-rename FN: `["fact","cli-command","added","ak-bench-fixture benchmark-inspect","packages/layer1-benchmark/src/cli.ts"]`. The pinned workspace manifest includes only the root package. The added fixture package bin is not an owned workspace CLI, so neither fixture CLI facts nor their documentation relations exist.
- doc-bridge-fixture-command-rename FN: `["finding","BROKEN_REFERENCE","","ak-bench-fixture inspect","packages/layer1-benchmark/docs/api.md"]`. The pinned workspace manifest includes only the root package. The added fixture package bin is not an owned workspace CLI, so neither fixture CLI facts nor their documentation relations exist.
- chat-fixture-config-rename FN: `["finding","BROKEN_REFERENCE","","benchLimit","packages/layer1-benchmark/docs/api.md"]`. Fixture-design limit: Set benchLimit to 10 by default has no schema or configuration-owner anchor. Strict owner scoping leaves this bare token unresolved; the frozen fixture is retained and matchers are not loosened to improve its score.
- chat-fixture-default-change FN: `["finding","CHANGED_REFERENCE","","benchLimit","packages/layer1-benchmark/docs/api.md"]`. Fixture-design limit: Set benchLimit to 10 by default has no schema or configuration-owner anchor. Strict owner scoping leaves this bare token unresolved; the frozen fixture is retained and matchers are not loosened to improve its score.
- chat-fixture-command-rename FP: `["finding","BROKEN_REFERENCE","","--bench-strict","packages/layer1-benchmark/docs/api.md"]`. A command rename also removes the old flag owner: this secondary flag diagnostic was not annotated in the command-only ground truth. This is an annotation limit, not established engine error.
- playbook-fixture-config-rename FN: `["finding","BROKEN_REFERENCE","","benchLimit","packages/layer1-benchmark/docs/api.md"]`. Fixture-design limit: Set benchLimit to 10 by default has no schema or configuration-owner anchor. Strict owner scoping leaves this bare token unresolved; the frozen fixture is retained and matchers are not loosened to improve its score.
- playbook-fixture-default-change FN: `["finding","CHANGED_REFERENCE","","benchLimit","packages/layer1-benchmark/docs/api.md"]`. Fixture-design limit: Set benchLimit to 10 by default has no schema or configuration-owner anchor. Strict owner scoping leaves this bare token unresolved; the frozen fixture is retained and matchers are not loosened to improve its score.
- playbook-fixture-command-rename FP: `["finding","BROKEN_REFERENCE","","--bench-strict","packages/layer1-benchmark/docs/api.md"]`. A command rename also removes the old flag owner: this secondary flag diagnostic was not annotated in the command-only ground truth. This is an annotation limit, not established engine error.

## Raw false positives and false negatives

- doc-bridge-default-change FN: `["finding","CHANGED_REFERENCE","","surfaces.cli.bin","docs/spec/config-v1.md"]`. The native documentation uses bin?: string with a default comment. The strict-context matcher deliberately leaves this property signature unresolved: no owned base citation links it to surfaces.cli.bin, despite the extracted default delta. This remains an explicit native limitation.
- doc-bridge-fixture-config-rename FN: `["finding","BROKEN_REFERENCE","","benchLimit","packages/layer1-benchmark/docs/api.md"]`. Fixture-design limit: Set benchLimit to 10 by default has no schema or configuration-owner anchor. Strict owner scoping leaves this bare token unresolved; the frozen fixture is retained and matchers are not loosened to improve its score.
- doc-bridge-fixture-default-change FN: `["finding","CHANGED_REFERENCE","","benchLimit","packages/layer1-benchmark/docs/api.md"]`. Fixture-design limit: Set benchLimit to 10 by default has no schema or configuration-owner anchor. Strict owner scoping leaves this bare token unresolved; the frozen fixture is retained and matchers are not loosened to improve its score.
- doc-bridge-fixture-flag-rename FN: `["fact","cli-flag","removed","--bench-strict","packages/layer1-benchmark/src/cli.ts"]`. The pinned workspace manifest includes only the root package. The added fixture package bin is not an owned workspace CLI, so neither fixture CLI facts nor their documentation relations exist.
- doc-bridge-fixture-flag-rename FN: `["fact","cli-flag","added","--benchmarkbench-strict","packages/layer1-benchmark/src/cli.ts"]`. The pinned workspace manifest includes only the root package. The added fixture package bin is not an owned workspace CLI, so neither fixture CLI facts nor their documentation relations exist.
- doc-bridge-fixture-flag-rename FN: `["finding","BROKEN_REFERENCE","","--bench-strict","packages/layer1-benchmark/docs/api.md"]`. The pinned workspace manifest includes only the root package. The added fixture package bin is not an owned workspace CLI, so neither fixture CLI facts nor their documentation relations exist.
- doc-bridge-fixture-command-rename FN: `["fact","cli-command","removed","ak-bench-fixture inspect","packages/layer1-benchmark/src/cli.ts"]`. The pinned workspace manifest includes only the root package. The added fixture package bin is not an owned workspace CLI, so neither fixture CLI facts nor their documentation relations exist.
- doc-bridge-fixture-command-rename FN: `["fact","cli-command","added","ak-bench-fixture benchmark-inspect","packages/layer1-benchmark/src/cli.ts"]`. The pinned workspace manifest includes only the root package. The added fixture package bin is not an owned workspace CLI, so neither fixture CLI facts nor their documentation relations exist.
- doc-bridge-fixture-command-rename FN: `["finding","BROKEN_REFERENCE","","ak-bench-fixture inspect","packages/layer1-benchmark/docs/api.md"]`. The pinned workspace manifest includes only the root package. The added fixture package bin is not an owned workspace CLI, so neither fixture CLI facts nor their documentation relations exist.
- doc-bridge-fixture-negative-adr FP: `["finding","BROKEN_REFERENCE","","benchCited","packages/layer1-benchmark/docs/adr/0001-api.md"]`. Raw includes policy excluded: Historical/archived documentation remains visible without patches.
- doc-bridge-fixture-negative-changelog FP: `["finding","BROKEN_REFERENCE","","benchCited","packages/layer1-benchmark/CHANGELOG.md"]`. Raw includes policy excluded: Historical/archived documentation remains visible without patches.
- doc-bridge-fixture-negative-historical FP: `["finding","BROKEN_REFERENCE","","benchCited","packages/layer1-benchmark/docs/historical/api.md"]`. Raw includes policy excluded: Historical/archived documentation remains visible without patches.
- doc-bridge-fixture-negative-pinned-version FP: `["finding","BROKEN_REFERENCE","","benchCited","packages/layer1-benchmark/docs/pinned.md"]`. Raw includes policy pending-version: Target outside eligible release range.
- chat-fixture-config-rename FN: `["finding","BROKEN_REFERENCE","","benchLimit","packages/layer1-benchmark/docs/api.md"]`. Fixture-design limit: Set benchLimit to 10 by default has no schema or configuration-owner anchor. Strict owner scoping leaves this bare token unresolved; the frozen fixture is retained and matchers are not loosened to improve its score.
- chat-fixture-default-change FN: `["finding","CHANGED_REFERENCE","","benchLimit","packages/layer1-benchmark/docs/api.md"]`. Fixture-design limit: Set benchLimit to 10 by default has no schema or configuration-owner anchor. Strict owner scoping leaves this bare token unresolved; the frozen fixture is retained and matchers are not loosened to improve its score.
- chat-fixture-command-rename FP: `["finding","BROKEN_REFERENCE","","--bench-strict","packages/layer1-benchmark/docs/api.md"]`. A command rename also removes the old flag owner: this secondary flag diagnostic was not annotated in the command-only ground truth. This is an annotation limit, not established engine error.
- chat-fixture-negative-adr FP: `["finding","BROKEN_REFERENCE","","benchCited","packages/layer1-benchmark/docs/adr/0001-api.md"]`. Raw includes policy excluded: Historical/archived documentation remains visible without patches.
- chat-fixture-negative-changelog FP: `["finding","BROKEN_REFERENCE","","benchCited","packages/layer1-benchmark/CHANGELOG.md"]`. Raw includes policy excluded: Historical/archived documentation remains visible without patches.
- chat-fixture-negative-historical FP: `["finding","BROKEN_REFERENCE","","benchCited","packages/layer1-benchmark/docs/historical/api.md"]`. Raw includes policy excluded: Historical/archived documentation remains visible without patches.
- chat-fixture-negative-pinned-version FP: `["finding","BROKEN_REFERENCE","","benchCited","packages/layer1-benchmark/docs/pinned.md"]`. Raw includes policy pending-version: Target outside eligible release range.
- playbook-fixture-config-rename FN: `["finding","BROKEN_REFERENCE","","benchLimit","packages/layer1-benchmark/docs/api.md"]`. Fixture-design limit: Set benchLimit to 10 by default has no schema or configuration-owner anchor. Strict owner scoping leaves this bare token unresolved; the frozen fixture is retained and matchers are not loosened to improve its score.
- playbook-fixture-default-change FN: `["finding","CHANGED_REFERENCE","","benchLimit","packages/layer1-benchmark/docs/api.md"]`. Fixture-design limit: Set benchLimit to 10 by default has no schema or configuration-owner anchor. Strict owner scoping leaves this bare token unresolved; the frozen fixture is retained and matchers are not loosened to improve its score.
- playbook-fixture-command-rename FP: `["finding","BROKEN_REFERENCE","","--bench-strict","packages/layer1-benchmark/docs/api.md"]`. A command rename also removes the old flag owner: this secondary flag diagnostic was not annotated in the command-only ground truth. This is an annotation limit, not established engine error.
- playbook-fixture-negative-adr FP: `["finding","BROKEN_REFERENCE","","benchCited","packages/layer1-benchmark/docs/adr/0001-api.md"]`. Raw includes policy excluded: Historical/archived documentation remains visible without patches.
- playbook-fixture-negative-changelog FP: `["finding","BROKEN_REFERENCE","","benchCited","packages/layer1-benchmark/CHANGELOG.md"]`. Raw includes policy excluded: Historical/archived documentation remains visible without patches.
- playbook-fixture-negative-historical FP: `["finding","BROKEN_REFERENCE","","benchCited","packages/layer1-benchmark/docs/historical/api.md"]`. Raw includes policy excluded: Historical/archived documentation remains visible without patches.
- playbook-fixture-negative-pinned-version FP: `["finding","BROKEN_REFERENCE","","benchCited","packages/layer1-benchmark/docs/pinned.md"]`. Raw includes policy pending-version: Target outside eligible release range.

## Limits and maintenance

Acquisition fetches exact pinned commits directly, rather than relying on a moving shallow default-branch history. All 53 cases now execute; the earlier preview failures are not reproduced on this pinned corpus and engine bundle. No fixture precondition repair was needed or claimed; fixture mutations remain unchanged. No case or expected location was removed. The runner records concrete mutation/citation/acquisition failures and never publishes subprocess output.

Confirmed historical cases: 0. First-parent mining inspected 149 doc-bridge, 115 chat and 77 playbook commits. Export-token/doc-diff overlap shortlisted 29 pairs; manually inspected examples were concurrent changes, release rollups, new observer APIs, import-path migration or new docs rather than a later stale-claim fix. Zero delayed fixes confirmed; bounded search does not prove none exist.
Historical recall is not analyzed.

Native numbers are the headline; fixture-backed results never mix into native numbers. Frozen scopes select fact kinds/tokens and affected doc files; other findings within those doc files are FP. CHANGED_REFERENCE replaces the frozen placeholder FACT_CHANGE to match the shipped stale-or-unverified review-candidate contract; expected tokens and locations are unchanged. Fact extraction and reference findings have separate denominators. Small purposive cases are not a random sample or release-readiness claim. Historical recall is not analyzed: no confirmed delayed-doc cases within the bounded search. No upstream code is executed or installed. Authored fixtures exist only in temporary checkouts. Plain command/token citations are matched by file/token; distinct lines in one file count once.

The two included finding-overall fixture FPs are secondary flag-removal findings missing from command-only gold annotations. They remain scored as FPs; the frozen v1 set is kept for comparability. Raw-only negative-control FPs reflect intentionally disabled exclusions/version routing and are listed individually above. Fixture misses and annotation limits are accepted measurement limits, not reasons to loosen the engine matchers.

No engine tuning was performed. Unavailable or invalid cases are excluded from score denominators, remain visible, and prevent a complete-corpus measurement claim. Scores below target are benchmark failures, not execution failures or release-readiness evidence.
