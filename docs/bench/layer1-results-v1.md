---
owner: maintainers
lifecycle: active
sourceOfTruth: docs/bench/layer1-cases-v1.json
validationPath: node scripts/bench-layer1.mjs --self-check
---

# Layer-1 benchmark results v1

Native documentation findings: precision **100.00%**, coverage **13.33%** (TP 2, FP 0, FN 13). Targets: precision ≥95%, coverage ≥90%.

These are emitted diagnostic candidates: 0 conflict, 2 stale-or-unverified, 0 unresolved. Candidate precision does not establish confirmed-finding precision.

Engine revision: `888e288fc974ed22485840e0f977aa110c529b79`. Engine bundle SHA-256: `ad8479ff5b3bce5159a273a8e0dcf7e12b91d3b8a3eb2437f9aaf69594f5351d`.
Frozen case SHA-256: `51537a72654f18a3924972f7e4bfc4d067fd154745ca4abe2cc8e6049d7c777b`.

Coverage is recall: TP / (TP + FN). Precision is TP / (TP + FP). Units are distinct (case, channel, kind, operation, token, path); repeated citations in one document count once.

| Channel / kind | TP | FP | FN | Precision | Coverage |
| --- | ---: | ---: | ---: | ---: | ---: |
| native: fact/cli-command | 0 | 0 | 4 | n/a | 0.00% |
| native: fact/cli-flag | 0 | 0 | 4 | n/a | 0.00% |
| native: fact/config-key | 2 | 0 | 1 | 100.00% | 66.67% |
| native: fact/signature | 2 | 0 | 0 | 100.00% | 100.00% |
| native: fact/symbol | 6 | 0 | 0 | 100.00% | 100.00% |
| native: finding/BROKEN_REFERENCE | 2 | 0 | 9 | 100.00% | 18.18% |
| native: finding/FACT_CHANGE | 0 | 0 | 4 | n/a | 0.00% |
| native: finding-overall | 2 | 0 | 13 | 100.00% | 13.33% |
| native: fact-overall | 10 | 0 | 9 | 100.00% | 52.63% |
| fixture-backed: fact/cli-command | 4 | 0 | 2 | 100.00% | 66.67% |
| fixture-backed: fact/cli-flag | 4 | 0 | 2 | 100.00% | 66.67% |
| fixture-backed: fact/config-key | 9 | 0 | 0 | 100.00% | 100.00% |
| fixture-backed: fact/signature | 3 | 0 | 0 | 100.00% | 100.00% |
| fixture-backed: fact/symbol | 15 | 0 | 0 | 100.00% | 100.00% |
| fixture-backed: finding/AMBIGUOUS_REFERENCE | 3 | 0 | 0 | 100.00% | 100.00% |
| fixture-backed: finding/BROKEN_REFERENCE | 7 | 14 | 5 | 33.33% | 58.33% |
| fixture-backed: finding/FACT_CHANGE | 0 | 0 | 6 | n/a | 0.00% |
| fixture-backed: finding-overall | 10 | 14 | 11 | 41.67% | 47.62% |
| fixture-backed: fact-overall | 35 | 0 | 4 | 100.00% | 89.74% |
| historical: finding-overall | 0 | 0 | 0 | n/a | n/a |
| historical: fact-overall | 0 | 0 | 0 | n/a | n/a |

Fact deltas establish extraction/change detection only. They do not establish that a stale document was diagnosed. Raw diff findings are scored separately; classification/version routing is not applied by this API.

Measured cases: 53; unavailable: 0; invalid: 0.
Confirmed historical cases: 0. First-parent mining inspected 149 doc-bridge, 115 chat and 77 playbook commits. Export-token/doc-diff overlap shortlisted 29 pairs; manually inspected examples were concurrent changes, release rollups, new observer APIs, import-path migration or new docs rather than a later stale-claim fix. Zero delayed fixes confirmed; bounded search does not prove none exist.
Historical recall is not analyzed. Future real cases will come from advisory dogfood in these repositories.

## Case results

| Case | Origin | State | TP / FP / FN (all units) |
| --- | --- | --- | --- |
| doc-bridge-symbol-rename | native | measured | 3 / 0 / 1 |
| doc-bridge-signature-change | native | measured | 1 / 0 / 2 |
| doc-bridge-config-rename | native | measured | 2 / 0 / 1 |
| doc-bridge-flag-rename | native | measured | 0 / 0 / 3 |
| doc-bridge-command-rename | native | measured | 0 / 0 / 3 |
| doc-bridge-default-change | native | measured | 0 / 0 / 2 |
| doc-bridge-internal-refactor | native | measured | 0 / 0 / 0 |
| doc-bridge-fixture-symbol-rename | fixture-backed | measured | 3 / 0 / 0 |
| doc-bridge-fixture-uncited-rename | fixture-backed | measured | 2 / 0 / 0 |
| doc-bridge-fixture-signature-change | fixture-backed | measured | 1 / 0 / 1 |
| doc-bridge-fixture-config-rename | fixture-backed | measured | 2 / 0 / 1 |
| doc-bridge-fixture-default-change | fixture-backed | measured | 1 / 0 / 1 |
| doc-bridge-fixture-flag-rename | fixture-backed | measured | 0 / 0 / 3 |
| doc-bridge-fixture-command-rename | fixture-backed | measured | 0 / 0 / 3 |
| doc-bridge-fixture-internal-refactor | fixture-backed | measured | 0 / 0 / 0 |
| doc-bridge-fixture-ambiguous | fixture-backed | measured | 2 / 0 / 0 |
| doc-bridge-fixture-negative-adr | fixture-backed | measured | 0 / 1 / 0 |
| doc-bridge-fixture-negative-changelog | fixture-backed | measured | 0 / 1 / 0 |
| doc-bridge-fixture-negative-historical | fixture-backed | measured | 0 / 1 / 0 |
| doc-bridge-fixture-negative-pinned-version | fixture-backed | measured | 0 / 1 / 0 |
| chat-symbol-rename | native | measured | 3 / 0 / 1 |
| chat-signature-change | native | measured | 1 / 0 / 1 |
| chat-internal-refactor | native | measured | 0 / 0 / 0 |
| chat-fixture-symbol-rename | fixture-backed | measured | 3 / 0 / 0 |
| chat-fixture-uncited-rename | fixture-backed | measured | 2 / 0 / 0 |
| chat-fixture-signature-change | fixture-backed | measured | 1 / 0 / 1 |
| chat-fixture-config-rename | fixture-backed | measured | 2 / 0 / 1 |
| chat-fixture-default-change | fixture-backed | measured | 1 / 0 / 1 |
| chat-fixture-flag-rename | fixture-backed | measured | 3 / 0 / 0 |
| chat-fixture-command-rename | fixture-backed | measured | 3 / 1 / 0 |
| chat-fixture-internal-refactor | fixture-backed | measured | 0 / 0 / 0 |
| chat-fixture-ambiguous | fixture-backed | measured | 2 / 0 / 0 |
| chat-fixture-negative-adr | fixture-backed | measured | 0 / 1 / 0 |
| chat-fixture-negative-changelog | fixture-backed | measured | 0 / 1 / 0 |
| chat-fixture-negative-historical | fixture-backed | measured | 0 / 1 / 0 |
| chat-fixture-negative-pinned-version | fixture-backed | measured | 0 / 1 / 0 |
| playbook-uncited-rename | native | measured | 2 / 0 / 0 |
| playbook-flag-rename | native | measured | 0 / 0 / 4 |
| playbook-command-rename | native | measured | 0 / 0 / 4 |
| playbook-internal-refactor | native | measured | 0 / 0 / 0 |
| playbook-fixture-symbol-rename | fixture-backed | measured | 3 / 0 / 0 |
| playbook-fixture-uncited-rename | fixture-backed | measured | 2 / 0 / 0 |
| playbook-fixture-signature-change | fixture-backed | measured | 1 / 0 / 1 |
| playbook-fixture-config-rename | fixture-backed | measured | 2 / 0 / 1 |
| playbook-fixture-default-change | fixture-backed | measured | 1 / 0 / 1 |
| playbook-fixture-flag-rename | fixture-backed | measured | 3 / 0 / 0 |
| playbook-fixture-command-rename | fixture-backed | measured | 3 / 1 / 0 |
| playbook-fixture-internal-refactor | fixture-backed | measured | 0 / 0 / 0 |
| playbook-fixture-ambiguous | fixture-backed | measured | 2 / 0 / 0 |
| playbook-fixture-negative-adr | fixture-backed | measured | 0 / 1 / 0 |
| playbook-fixture-negative-changelog | fixture-backed | measured | 0 / 1 / 0 |
| playbook-fixture-negative-historical | fixture-backed | measured | 0 / 1 / 0 |
| playbook-fixture-negative-pinned-version | fixture-backed | measured | 0 / 1 / 0 |

## False positives and false negatives

- doc-bridge-symbol-rename FN: `["finding","BROKEN_REFERENCE","","defineConfig","docs/spec/cli.md"]`. No base citation relation: TypeScript code fences are not symbol-tokenized.
- doc-bridge-signature-change FN: `["finding","FACT_CHANGE","","defineConfig","docs/spec/config-v1.md"]`. Fact deltas are not documentation divergence diagnostics: diff only checks removed/ambiguous targets.
- doc-bridge-signature-change FN: `["finding","FACT_CHANGE","","defineConfig","docs/spec/cli.md"]`. Fact deltas are not documentation divergence diagnostics: diff only checks removed/ambiguous targets.
- doc-bridge-config-rename FN: `["finding","BROKEN_REFERENCE","","schemaVersion","docs/spec/config-v1.md"]`. No base citation relation: the bare configuration token remains unresolved under configuration owner scoping.
- doc-bridge-flag-rename FN: `["fact","cli-flag","removed","--explain","src/cli/program.ts"]`. Extraction follows unchanged usage text instead of the mutated implementation; the declared command/flag fact persists.
- doc-bridge-flag-rename FN: `["fact","cli-flag","added","--benchmark-explain","src/cli/program.ts"]`. Extraction partial: CLI declarations contain dynamic, unsupported, conflicting or unrecognized registration; absence does not prove removal..
- doc-bridge-flag-rename FN: `["finding","BROKEN_REFERENCE","","--explain","docs/spec/cli.md"]`. Extraction follows the unchanged usage text instead of the mutated command/flag implementation; no removed target is recorded.
- doc-bridge-command-rename FN: `["fact","cli-command","removed","ak-docs query","src/cli/program.ts"]`. Extraction follows unchanged usage text instead of the mutated implementation; the declared command/flag fact persists.
- doc-bridge-command-rename FN: `["fact","cli-command","added","ak-docs benchmark-query","src/cli/program.ts"]`. Extraction partial: CLI declarations contain dynamic, unsupported, conflicting or unrecognized registration; absence does not prove removal..
- doc-bridge-command-rename FN: `["finding","BROKEN_REFERENCE","","ak-docs query","docs/spec/cli.md"]`. Extraction follows the unchanged usage text instead of the mutated command/flag implementation; no removed target is recorded.
- doc-bridge-default-change FN: `["fact","config-key","changed","surfaces.cli.bin","src/config/defaults.ts"]`. Operational defaults are assigned outside declarative schema extraction; no default-value fact delta is observed.
- doc-bridge-default-change FN: `["finding","FACT_CHANGE","","surfaces.cli.bin","docs/spec/config-v1.md"]`. Fact deltas are not documentation divergence diagnostics: diff only checks removed/ambiguous targets.
- doc-bridge-fixture-signature-change FN: `["finding","FACT_CHANGE","","benchCited","packages/layer1-benchmark/docs/api.md"]`. Fact deltas are not documentation divergence diagnostics: diff only checks removed/ambiguous targets.
- doc-bridge-fixture-config-rename FN: `["finding","BROKEN_REFERENCE","","benchLimit","packages/layer1-benchmark/docs/api.md"]`. No base citation relation: the bare configuration token remains unresolved under configuration owner scoping.
- doc-bridge-fixture-default-change FN: `["finding","FACT_CHANGE","","benchLimit","packages/layer1-benchmark/docs/api.md"]`. Fact deltas are not documentation divergence diagnostics: diff only checks removed/ambiguous targets.
- doc-bridge-fixture-flag-rename FN: `["fact","cli-flag","removed","--bench-strict","packages/layer1-benchmark/src/cli.ts"]`. Extraction partial: CLI declarations contain dynamic, unsupported, conflicting or unrecognized registration; absence does not prove removal..
- doc-bridge-fixture-flag-rename FN: `["fact","cli-flag","added","--benchmarkbench-strict","packages/layer1-benchmark/src/cli.ts"]`. Extraction partial: CLI declarations contain dynamic, unsupported, conflicting or unrecognized registration; absence does not prove removal..
- doc-bridge-fixture-flag-rename FN: `["finding","BROKEN_REFERENCE","","--bench-strict","packages/layer1-benchmark/docs/api.md"]`. No base citation relation: owned CLI extraction is unavailable under the custom handler or native workspace boundary.
- doc-bridge-fixture-command-rename FN: `["fact","cli-command","removed","ak-bench-fixture inspect","packages/layer1-benchmark/src/cli.ts"]`. Extraction partial: CLI declarations contain dynamic, unsupported, conflicting or unrecognized registration; absence does not prove removal..
- doc-bridge-fixture-command-rename FN: `["fact","cli-command","added","ak-bench-fixture benchmark-inspect","packages/layer1-benchmark/src/cli.ts"]`. Extraction partial: CLI declarations contain dynamic, unsupported, conflicting or unrecognized registration; absence does not prove removal..
- doc-bridge-fixture-command-rename FN: `["finding","BROKEN_REFERENCE","","ak-bench-fixture inspect","packages/layer1-benchmark/docs/api.md"]`. No base citation relation: owned CLI extraction is unavailable under the custom handler or native workspace boundary.
- doc-bridge-fixture-negative-adr FP: `["finding","BROKEN_REFERENCE","","benchCited","packages/layer1-benchmark/docs/adr/0001-api.md"]`. Raw diff retains the reference diagnostic; classification/version policy is not applied at this measured boundary.
- doc-bridge-fixture-negative-changelog FP: `["finding","BROKEN_REFERENCE","","benchCited","packages/layer1-benchmark/CHANGELOG.md"]`. Raw diff retains the reference diagnostic; classification/version policy is not applied at this measured boundary.
- doc-bridge-fixture-negative-historical FP: `["finding","BROKEN_REFERENCE","","benchCited","packages/layer1-benchmark/docs/historical/api.md"]`. Raw diff retains the reference diagnostic; classification/version policy is not applied at this measured boundary.
- doc-bridge-fixture-negative-pinned-version FP: `["finding","BROKEN_REFERENCE","","benchCited","packages/layer1-benchmark/docs/pinned.md"]`. Raw diff retains the reference diagnostic; classification/version policy is not applied at this measured boundary.
- chat-symbol-rename FN: `["finding","BROKEN_REFERENCE","","createAssistantContentEncoder","docs/protocol/v1.md"]`. No base citation relation: TypeScript code fences are not symbol-tokenized.
- chat-signature-change FN: `["finding","FACT_CHANGE","","createAssistantContentEncoder","docs/protocol/v1.md"]`. Fact deltas are not documentation divergence diagnostics: diff only checks removed/ambiguous targets.
- chat-fixture-signature-change FN: `["finding","FACT_CHANGE","","benchCited","packages/layer1-benchmark/docs/api.md"]`. Fact deltas are not documentation divergence diagnostics: diff only checks removed/ambiguous targets.
- chat-fixture-config-rename FN: `["finding","BROKEN_REFERENCE","","benchLimit","packages/layer1-benchmark/docs/api.md"]`. No base citation relation: the bare configuration token remains unresolved under configuration owner scoping.
- chat-fixture-default-change FN: `["finding","FACT_CHANGE","","benchLimit","packages/layer1-benchmark/docs/api.md"]`. Fact deltas are not documentation divergence diagnostics: diff only checks removed/ambiguous targets.
- chat-fixture-command-rename FP: `["finding","BROKEN_REFERENCE","","--bench-strict","packages/layer1-benchmark/docs/api.md"]`. A command rename also removes the old flag owner: this secondary flag diagnostic was not annotated in the command-only ground truth. This is an annotation limit, not established engine error.
- chat-fixture-negative-adr FP: `["finding","BROKEN_REFERENCE","","benchCited","packages/layer1-benchmark/docs/adr/0001-api.md"]`. Raw diff retains the reference diagnostic; classification/version policy is not applied at this measured boundary.
- chat-fixture-negative-changelog FP: `["finding","BROKEN_REFERENCE","","benchCited","packages/layer1-benchmark/CHANGELOG.md"]`. Raw diff retains the reference diagnostic; classification/version policy is not applied at this measured boundary.
- chat-fixture-negative-historical FP: `["finding","BROKEN_REFERENCE","","benchCited","packages/layer1-benchmark/docs/historical/api.md"]`. Raw diff retains the reference diagnostic; classification/version policy is not applied at this measured boundary.
- chat-fixture-negative-pinned-version FP: `["finding","BROKEN_REFERENCE","","benchCited","packages/layer1-benchmark/docs/pinned.md"]`. Raw diff retains the reference diagnostic; classification/version policy is not applied at this measured boundary.
- playbook-flag-rename FN: `["fact","cli-flag","removed","--fast","packages/playbook/bin/agents-playbook.mjs"]`. Extraction partial: CLI declarations contain dynamic, unsupported, conflicting or unrecognized registration; absence does not prove removal..
- playbook-flag-rename FN: `["fact","cli-flag","added","--benchmark-fast","packages/playbook/bin/agents-playbook.mjs"]`. Extraction partial: CLI declarations contain dynamic, unsupported, conflicting or unrecognized registration; absence does not prove removal..
- playbook-flag-rename FN: `["finding","BROKEN_REFERENCE","","--fast","packages/playbook/README.md"]`. No base citation relation: owned CLI extraction is unavailable under the custom handler or native workspace boundary.
- playbook-flag-rename FN: `["finding","BROKEN_REFERENCE","","--fast","content/docs/scripts/index.md"]`. No base citation relation: owned CLI extraction is unavailable under the custom handler or native workspace boundary.
- playbook-command-rename FN: `["fact","cli-command","removed","agents-playbook run","packages/playbook/bin/agents-playbook.mjs"]`. Extraction partial: CLI declarations contain dynamic, unsupported, conflicting or unrecognized registration; absence does not prove removal..
- playbook-command-rename FN: `["fact","cli-command","added","agents-playbook benchmark-run","packages/playbook/bin/agents-playbook.mjs"]`. Extraction partial: CLI declarations contain dynamic, unsupported, conflicting or unrecognized registration; absence does not prove removal..
- playbook-command-rename FN: `["finding","BROKEN_REFERENCE","","agents-playbook run","packages/playbook/README.md"]`. No base citation relation: owned CLI extraction is unavailable under the custom handler or native workspace boundary.
- playbook-command-rename FN: `["finding","BROKEN_REFERENCE","","agents-playbook run","content/docs/scripts/index.md"]`. No base citation relation: owned CLI extraction is unavailable under the custom handler or native workspace boundary.
- playbook-fixture-signature-change FN: `["finding","FACT_CHANGE","","benchCited","packages/layer1-benchmark/docs/api.md"]`. Fact deltas are not documentation divergence diagnostics: diff only checks removed/ambiguous targets.
- playbook-fixture-config-rename FN: `["finding","BROKEN_REFERENCE","","benchLimit","packages/layer1-benchmark/docs/api.md"]`. No base citation relation: the bare configuration token remains unresolved under configuration owner scoping.
- playbook-fixture-default-change FN: `["finding","FACT_CHANGE","","benchLimit","packages/layer1-benchmark/docs/api.md"]`. Fact deltas are not documentation divergence diagnostics: diff only checks removed/ambiguous targets.
- playbook-fixture-command-rename FP: `["finding","BROKEN_REFERENCE","","--bench-strict","packages/layer1-benchmark/docs/api.md"]`. A command rename also removes the old flag owner: this secondary flag diagnostic was not annotated in the command-only ground truth. This is an annotation limit, not established engine error.
- playbook-fixture-negative-adr FP: `["finding","BROKEN_REFERENCE","","benchCited","packages/layer1-benchmark/docs/adr/0001-api.md"]`. Raw diff retains the reference diagnostic; classification/version policy is not applied at this measured boundary.
- playbook-fixture-negative-changelog FP: `["finding","BROKEN_REFERENCE","","benchCited","packages/layer1-benchmark/CHANGELOG.md"]`. Raw diff retains the reference diagnostic; classification/version policy is not applied at this measured boundary.
- playbook-fixture-negative-historical FP: `["finding","BROKEN_REFERENCE","","benchCited","packages/layer1-benchmark/docs/historical/api.md"]`. Raw diff retains the reference diagnostic; classification/version policy is not applied at this measured boundary.
- playbook-fixture-negative-pinned-version FP: `["finding","BROKEN_REFERENCE","","benchCited","packages/layer1-benchmark/docs/pinned.md"]`. Raw diff retains the reference diagnostic; classification/version policy is not applied at this measured boundary.

## Limits

Native numbers are the headline; fixture-backed results never mix into native numbers. Frozen scopes select fact kinds/tokens and affected doc files; other findings within those doc files are FP. FACT_CHANGE is a benchmark expectation for diagnosed stale values/signatures, not an engine diagnostic contract. Fact extraction and reference findings have separate denominators. Small purposive cases are not a random sample or release-readiness claim. Historical recall is not analyzed: no confirmed delayed-doc cases within the bounded search. No upstream code is executed or installed. Authored fixtures exist only in temporary checkouts. Plain command/token citations are matched by file/token; distinct lines in one file count once.

No engine tuning or expectation changes were made in response to the measurements. An unavailable corpus is omitted from the denominator and prevents a three-repository acceptance claim.
