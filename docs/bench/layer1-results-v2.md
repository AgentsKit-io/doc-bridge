---
title: Layer-1 benchmark results v2
description: Native, fixture and historical drift measurements with explicit limitations.
owner: maintainers
lifecycle: active
sourceOfTruth: docs/bench/layer1-cases-v2.json
validationPath: node scripts/bench-layer1.mjs --self-check
---

# Layer-1 benchmark results v2

Current historical precision gate: **PASS**, at **83.33%** (TP 10, FP 2, FN 0).
See the [precision-tail measurement](#precision-tail-gate-measurement) for current
controls, limits and provenance. Frozen cases and earlier measurements follow.

Earlier claim-policy gate: **BLOCKED**. CHANGED_REFERENCE precision is **66.67%** (TP 10, FP 5, FN 0), below the required 80%.

Native included documentation findings: precision **100.00%**, coverage **100.00%** (TP 15, FP 0, FN 0). Targets: native precision ≥95% met; native coverage ≥90% met.

The headline uses shipped default policy routing. Included means proposed or routed-to-L2; excluded and pending-version candidates are reported separately. Review candidates, including CHANGED_REFERENCE (stale-or-unverified, routed-to-L2), are not confirmed divergences.

V2 retains v1 native cases and repairs authored fixture ownership, configuration anchors and raw policy gold. Historical cases compare unmodified public first-parent revisions; their reasoning is recorded in the case file.

Engine revision: `6cfe9078215030c83d526f1d4b6f1967c73f93db`. Engine bundle SHA-256: `3314698bf9827d1552e912d20b908d95136e8007666a08f3b2ae69cbb182aa09`.
Case SHA-256: `a75743e479eb976270a9186483a1a05cf5039e63bc341f5cc96f41dcd07eb92a`.
Harness SHA-256: `06c98e1a2f3bd7c2e3d47f4afa8620bfb23a3ce9336dde653ea0b9d6eaf3a6fa`.

Coverage is recall: TP / (TP + FN). Precision is TP / (TP + FP). Units are distinct (case, channel, kind, operation, token, path); repeated citations in one document count once. Facts measure extraction/change detection separately from documentation findings.

Measured cases: 94; unavailable: 0; invalid: 0.

## Policy dispositions in frozen document scopes

Policy counts use diagnostic identities; scores deduplicate assertion units, so totals can differ.

| Origin | Proposed | Routed to L2 | Excluded | Pending version |
| --- | ---: | ---: | ---: | ---: |
| native | 11 | 4 | 0 | 0 |
| fixture-backed | 21 | 8 | 9 | 3 |
| historical | 0 | 15 | 0 | 0 |

## Default included scores

| Origin / channel / kind | TP | FP | FN | Precision | Coverage |
| --- | ---: | ---: | ---: | ---: | ---: |
| native: fact/cli-command | 4 | 0 | 0 | 100.00% | 100.00% |
| native: fact/cli-flag | 4 | 0 | 0 | 100.00% | 100.00% |
| native: fact/config-key | 3 | 0 | 0 | 100.00% | 100.00% |
| native: fact/signature | 2 | 0 | 0 | 100.00% | 100.00% |
| native: fact/symbol | 6 | 0 | 0 | 100.00% | 100.00% |
| native: finding/BROKEN_REFERENCE | 11 | 0 | 0 | 100.00% | 100.00% |
| native: finding/CHANGED_REFERENCE | 4 | 0 | 0 | 100.00% | 100.00% |
| native: finding-overall | 15 | 0 | 0 | 100.00% | 100.00% |
| native: fact-overall | 19 | 0 | 0 | 100.00% | 100.00% |
| fixture-backed: fact/cli-command | 6 | 0 | 0 | 100.00% | 100.00% |
| fixture-backed: fact/cli-flag | 6 | 0 | 0 | 100.00% | 100.00% |
| fixture-backed: fact/config-key | 11 | 0 | 0 | 100.00% | 100.00% |
| fixture-backed: fact/signature | 3 | 0 | 0 | 100.00% | 100.00% |
| fixture-backed: fact/symbol | 15 | 0 | 0 | 100.00% | 100.00% |
| fixture-backed: finding/AMBIGUOUS_REFERENCE | 3 | 0 | 0 | 100.00% | 100.00% |
| fixture-backed: finding/BROKEN_REFERENCE | 15 | 0 | 0 | 100.00% | 100.00% |
| fixture-backed: finding/CHANGED_REFERENCE | 8 | 0 | 0 | 100.00% | 100.00% |
| fixture-backed: finding-overall | 26 | 0 | 0 | 100.00% | 100.00% |
| fixture-backed: fact-overall | 41 | 0 | 0 | 100.00% | 100.00% |
| historical: fact/config-key | 4 | 0 | 0 | 100.00% | 100.00% |
| historical: fact/signature | 28 | 0 | 0 | 100.00% | 100.00% |
| historical: fact/symbol | 23 | 0 | 0 | 100.00% | 100.00% |
| historical: finding/CHANGED_REFERENCE | 10 | 5 | 0 | 66.67% | 100.00% |
| historical: finding-overall | 10 | 5 | 0 | 66.67% | 100.00% |
| historical: fact-overall | 55 | 0 | 0 | 100.00% | 100.00% |

## Secondary raw scores (--no-policy equivalent)

| Origin / channel / kind | TP | FP | FN | Precision | Coverage |
| --- | ---: | ---: | ---: | ---: | ---: |
| native: fact/cli-command | 4 | 0 | 0 | 100.00% | 100.00% |
| native: fact/cli-flag | 4 | 0 | 0 | 100.00% | 100.00% |
| native: fact/config-key | 3 | 0 | 0 | 100.00% | 100.00% |
| native: fact/signature | 2 | 0 | 0 | 100.00% | 100.00% |
| native: fact/symbol | 6 | 0 | 0 | 100.00% | 100.00% |
| native: finding/BROKEN_REFERENCE | 11 | 0 | 0 | 100.00% | 100.00% |
| native: finding/CHANGED_REFERENCE | 4 | 0 | 0 | 100.00% | 100.00% |
| native: finding-overall | 15 | 0 | 0 | 100.00% | 100.00% |
| native: fact-overall | 19 | 0 | 0 | 100.00% | 100.00% |
| fixture-backed: fact/cli-command | 6 | 0 | 0 | 100.00% | 100.00% |
| fixture-backed: fact/cli-flag | 6 | 0 | 0 | 100.00% | 100.00% |
| fixture-backed: fact/config-key | 11 | 0 | 0 | 100.00% | 100.00% |
| fixture-backed: fact/signature | 3 | 0 | 0 | 100.00% | 100.00% |
| fixture-backed: fact/symbol | 15 | 0 | 0 | 100.00% | 100.00% |
| fixture-backed: finding/AMBIGUOUS_REFERENCE | 3 | 0 | 0 | 100.00% | 100.00% |
| fixture-backed: finding/BROKEN_REFERENCE | 27 | 0 | 0 | 100.00% | 100.00% |
| fixture-backed: finding/CHANGED_REFERENCE | 8 | 0 | 0 | 100.00% | 100.00% |
| fixture-backed: finding-overall | 38 | 0 | 0 | 100.00% | 100.00% |
| fixture-backed: fact-overall | 41 | 0 | 0 | 100.00% | 100.00% |
| historical: fact/config-key | 4 | 0 | 0 | 100.00% | 100.00% |
| historical: fact/signature | 28 | 0 | 0 | 100.00% | 100.00% |
| historical: fact/symbol | 23 | 0 | 0 | 100.00% | 100.00% |
| historical: finding/CHANGED_REFERENCE | 10 | 5 | 0 | 66.67% | 100.00% |
| historical: finding-overall | 10 | 5 | 0 | 66.67% | 100.00% |
| historical: fact-overall | 55 | 0 | 0 | 100.00% | 100.00% |

## Historical assertion controls

| Label | Cases | Finding TP | FP | FN |
| --- | ---: | ---: | ---: | ---: |
| positive | 7 | 10 | 0 | 0 |
| negative | 32 | 0 | 5 | 0 |

## Case results

| Case | Origin | State | Default TP / FP / FN | Raw TP / FP / FN |
| --- | --- | --- | --- | --- |
| doc-bridge-symbol-rename | native | measured | 4 / 0 / 0 | 4 / 0 / 0 |
| doc-bridge-signature-change | native | measured | 3 / 0 / 0 | 3 / 0 / 0 |
| doc-bridge-config-rename | native | measured | 3 / 0 / 0 | 3 / 0 / 0 |
| doc-bridge-flag-rename | native | measured | 3 / 0 / 0 | 3 / 0 / 0 |
| doc-bridge-command-rename | native | measured | 3 / 0 / 0 | 3 / 0 / 0 |
| doc-bridge-default-change | native | measured | 2 / 0 / 0 | 2 / 0 / 0 |
| doc-bridge-internal-refactor | native | measured | 0 / 0 / 0 | 0 / 0 / 0 |
| doc-bridge-fixture-symbol-rename | fixture-backed | measured | 3 / 0 / 0 | 3 / 0 / 0 |
| doc-bridge-fixture-uncited-rename | fixture-backed | measured | 2 / 0 / 0 | 2 / 0 / 0 |
| doc-bridge-fixture-signature-change | fixture-backed | measured | 2 / 0 / 0 | 2 / 0 / 0 |
| doc-bridge-fixture-config-rename | fixture-backed | measured | 3 / 0 / 0 | 3 / 0 / 0 |
| doc-bridge-fixture-default-change | fixture-backed | measured | 2 / 0 / 0 | 2 / 0 / 0 |
| doc-bridge-fixture-flag-rename | fixture-backed | measured | 3 / 0 / 0 | 3 / 0 / 0 |
| doc-bridge-fixture-command-rename | fixture-backed | measured | 4 / 0 / 0 | 4 / 0 / 0 |
| doc-bridge-fixture-internal-refactor | fixture-backed | measured | 0 / 0 / 0 | 0 / 0 / 0 |
| doc-bridge-fixture-ambiguous | fixture-backed | measured | 2 / 0 / 0 | 2 / 0 / 0 |
| doc-bridge-fixture-negative-adr | fixture-backed | measured | 0 / 0 / 0 | 1 / 0 / 0 |
| doc-bridge-fixture-negative-changelog | fixture-backed | measured | 0 / 0 / 0 | 1 / 0 / 0 |
| doc-bridge-fixture-negative-historical | fixture-backed | measured | 0 / 0 / 0 | 1 / 0 / 0 |
| doc-bridge-fixture-negative-pinned-version | fixture-backed | measured | 0 / 0 / 0 | 1 / 0 / 0 |
| history-doc-bridge-35f22939-normalizeagenthandoff | historical | measured | 1 / 0 / 0 | 1 / 0 / 0 |
| history-doc-bridge-4a5fa2f2-createmarkdownpluginv2 | historical | measured | 1 / 0 / 0 | 1 / 0 / 0 |
| history-doc-bridge-14337aea-diffsnapshots | historical | measured | 1 / 0 / 0 | 1 / 0 / 0 |
| history-doc-bridge-ab68bd6d-corpus-agent-include | historical | measured | 4 / 0 / 0 | 4 / 0 / 0 |
| history-doc-bridge-1695826b-surfaces-mcp-tools | historical | measured | 2 / 0 / 0 | 2 / 0 / 0 |
| history-doc-bridge-9a775a55-reconciliation-scope | historical | measured | 1 / 1 / 0 | 1 / 1 / 0 |
| doc-bridge-fixture-same-change-adequate | fixture-backed | measured | 2 / 0 / 0 | 2 / 0 / 0 |
| doc-bridge-fixture-same-change-incomplete | fixture-backed | measured | 2 / 0 / 0 | 2 / 0 / 0 |
| history-doc-bridge-8c8ec5a9-compatible-controls | historical | measured | 2 / 2 / 0 | 2 / 2 / 0 |
| history-doc-bridge-4a5fa2f2-compatible-controls | historical | measured | 2 / 0 / 0 | 2 / 0 / 0 |
| history-doc-bridge-39157425-compatible-controls | historical | measured | 2 / 2 / 0 | 2 / 2 / 0 |
| history-doc-bridge-222e1e4c-markdownresolution-review | historical | measured | 1 / 0 / 0 | 1 / 0 / 0 |
| history-doc-bridge-14337aea-markdownresolution-review | historical | measured | 1 / 0 / 0 | 1 / 0 / 0 |
| history-doc-bridge-548060c4-intelligence.retriever.mode-review | historical | measured | 3 / 0 / 0 | 3 / 0 / 0 |
| chat-symbol-rename | native | measured | 4 / 0 / 0 | 4 / 0 / 0 |
| chat-signature-change | native | measured | 2 / 0 / 0 | 2 / 0 / 0 |
| chat-internal-refactor | native | measured | 0 / 0 / 0 | 0 / 0 / 0 |
| chat-fixture-symbol-rename | fixture-backed | measured | 3 / 0 / 0 | 3 / 0 / 0 |
| chat-fixture-uncited-rename | fixture-backed | measured | 2 / 0 / 0 | 2 / 0 / 0 |
| chat-fixture-signature-change | fixture-backed | measured | 2 / 0 / 0 | 2 / 0 / 0 |
| chat-fixture-config-rename | fixture-backed | measured | 3 / 0 / 0 | 3 / 0 / 0 |
| chat-fixture-default-change | fixture-backed | measured | 2 / 0 / 0 | 2 / 0 / 0 |
| chat-fixture-flag-rename | fixture-backed | measured | 3 / 0 / 0 | 3 / 0 / 0 |
| chat-fixture-command-rename | fixture-backed | measured | 4 / 0 / 0 | 4 / 0 / 0 |
| chat-fixture-internal-refactor | fixture-backed | measured | 0 / 0 / 0 | 0 / 0 / 0 |
| chat-fixture-ambiguous | fixture-backed | measured | 2 / 0 / 0 | 2 / 0 / 0 |
| chat-fixture-negative-adr | fixture-backed | measured | 0 / 0 / 0 | 1 / 0 / 0 |
| chat-fixture-negative-changelog | fixture-backed | measured | 0 / 0 / 0 | 1 / 0 / 0 |
| chat-fixture-negative-historical | fixture-backed | measured | 0 / 0 / 0 | 1 / 0 / 0 |
| chat-fixture-negative-pinned-version | fixture-backed | measured | 0 / 0 / 0 | 1 / 0 / 0 |
| history-chat-5e47de83-createaskadapter | historical | measured | 1 / 0 / 0 | 1 / 0 / 0 |
| history-chat-68f5bf7e-withabort | historical | measured | 1 / 0 / 0 | 1 / 0 / 0 |
| history-chat-79d8ccac-standardcomponent-review | historical | measured | 1 / 0 / 0 | 1 / 0 / 0 |
| history-chat-891be155-chatdefinition-review | historical | measured | 1 / 0 / 0 | 1 / 0 / 0 |
| history-chat-0141229e-sessionstorage-review | historical | measured | 1 / 0 / 0 | 1 / 0 / 0 |
| history-chat-daa15aab-compatible-controls | historical | measured | 3 / 0 / 0 | 3 / 0 / 0 |
| history-chat-75bb10aa-compatible-controls | historical | measured | 2 / 0 / 0 | 2 / 0 / 0 |
| history-chat-69a46efa-chatdefinition-review | historical | measured | 1 / 0 / 0 | 1 / 0 / 0 |
| history-chat-e9c3d45c-chatdefinition-review | historical | measured | 1 / 0 / 0 | 1 / 0 / 0 |
| playbook-uncited-rename | native | measured | 2 / 0 / 0 | 2 / 0 / 0 |
| playbook-flag-rename | native | measured | 4 / 0 / 0 | 4 / 0 / 0 |
| playbook-command-rename | native | measured | 4 / 0 / 0 | 4 / 0 / 0 |
| playbook-internal-refactor | native | measured | 0 / 0 / 0 | 0 / 0 / 0 |
| playbook-fixture-symbol-rename | fixture-backed | measured | 3 / 0 / 0 | 3 / 0 / 0 |
| playbook-fixture-uncited-rename | fixture-backed | measured | 2 / 0 / 0 | 2 / 0 / 0 |
| playbook-fixture-signature-change | fixture-backed | measured | 2 / 0 / 0 | 2 / 0 / 0 |
| playbook-fixture-config-rename | fixture-backed | measured | 3 / 0 / 0 | 3 / 0 / 0 |
| playbook-fixture-default-change | fixture-backed | measured | 2 / 0 / 0 | 2 / 0 / 0 |
| playbook-fixture-flag-rename | fixture-backed | measured | 3 / 0 / 0 | 3 / 0 / 0 |
| playbook-fixture-command-rename | fixture-backed | measured | 4 / 0 / 0 | 4 / 0 / 0 |
| playbook-fixture-internal-refactor | fixture-backed | measured | 0 / 0 / 0 | 0 / 0 / 0 |
| playbook-fixture-ambiguous | fixture-backed | measured | 2 / 0 / 0 | 2 / 0 / 0 |
| playbook-fixture-negative-adr | fixture-backed | measured | 0 / 0 / 0 | 1 / 0 / 0 |
| playbook-fixture-negative-changelog | fixture-backed | measured | 0 / 0 / 0 | 1 / 0 / 0 |
| playbook-fixture-negative-historical | fixture-backed | measured | 0 / 0 / 0 | 1 / 0 / 0 |
| playbook-fixture-negative-pinned-version | fixture-backed | measured | 0 / 0 / 0 | 1 / 0 / 0 |
| history-playbook-55df31c2-createdocbridgecontextprovider | historical | measured | 2 / 0 / 0 | 2 / 0 / 0 |
| history-playbook-55df31c2-createsessionrecorder | historical | measured | 2 / 0 / 0 | 2 / 0 / 0 |
| history-playbook-55df31c2-contextprovider | historical | measured | 1 / 0 / 0 | 1 / 0 / 0 |
| history-playbook-55df31c2-context-provider-slot | historical | measured | 2 / 0 / 0 | 2 / 0 / 0 |
| history-playbook-55df31c2-createpluginslot | historical | measured | 2 / 0 / 0 | 2 / 0 / 0 |
| history-playbook-55df31c2-createpluginregistry | historical | measured | 2 / 0 / 0 | 2 / 0 / 0 |
| history-playbook-55df31c2-policygate | historical | measured | 1 / 0 / 0 | 1 / 0 / 0 |
| history-playbook-55df31c2-createpolicygate | historical | measured | 2 / 0 / 0 | 2 / 0 / 0 |
| history-playbook-55df31c2-createtoolruntime | historical | measured | 2 / 0 / 0 | 2 / 0 / 0 |
| history-playbook-55df31c2-createprocesstoolruntime | historical | measured | 2 / 0 / 0 | 2 / 0 / 0 |
| history-playbook-55df31c2-createdockertoolruntime | historical | measured | 2 / 0 / 0 | 2 / 0 / 0 |
| history-playbook-55df31c2-planrun | historical | measured | 2 / 0 / 0 | 2 / 0 / 0 |
| history-agentskit-a0c1845a-streamchunk-review | historical | measured | 2 / 0 / 0 | 2 / 0 / 0 |
| history-agentskit-a0c1845a-chatstate-review | historical | measured | 1 / 0 / 0 | 1 / 0 / 0 |
| history-agentskit-81ee4e63-adapterrequest-review | historical | measured | 1 / 0 / 0 | 1 / 0 / 0 |
| history-agentskit-4c6d0b86-scaffoldtype | historical | measured | 2 / 0 / 0 | 2 / 0 / 0 |
| history-agentskit-5ddb1a5d-scaffoldtype | historical | measured | 2 / 0 / 0 | 2 / 0 / 0 |
| history-agentskit-c8e5f39e-scaffoldtype | historical | measured | 2 / 0 / 0 | 2 / 0 / 0 |

## Default false positives and false negatives

- history-doc-bridge-9a775a55-reconciliation-scope FP: `["finding","CHANGED_REFERENCE","","surfaces.mcp.tools","docs/spec/config-v1.md"]`. Unexpected diagnostic in the frozen document scope; cause requires review of raw evidence.
- history-doc-bridge-8c8ec5a9-compatible-controls FP: `["finding","CHANGED_REFERENCE","","buildStoredDocBridgeIndex","docs/guides/injected-storage.md"]`. Unexpected diagnostic in the frozen document scope; cause requires review of raw evidence.
- history-doc-bridge-8c8ec5a9-compatible-controls FP: `["finding","CHANGED_REFERENCE","","buildStoredDocBridgeIndex","docs/spec/storage-io-v1.md"]`. Unexpected diagnostic in the frozen document scope; cause requires review of raw evidence.
- history-doc-bridge-39157425-compatible-controls FP: `["finding","CHANGED_REFERENCE","","buildStoredDocBridgeIndex","docs/guides/injected-storage.md"]`. Unexpected diagnostic in the frozen document scope; cause requires review of raw evidence.
- history-doc-bridge-39157425-compatible-controls FP: `["finding","CHANGED_REFERENCE","","buildStoredDocBridgeIndex","docs/spec/storage-io-v1.md"]`. Unexpected diagnostic in the frozen document scope; cause requires review of raw evidence.

## Raw false positives and false negatives

- history-doc-bridge-9a775a55-reconciliation-scope FP: `["finding","CHANGED_REFERENCE","","surfaces.mcp.tools","docs/spec/config-v1.md"]`. Unexpected diagnostic in the frozen document scope; cause requires review of raw evidence.
- history-doc-bridge-8c8ec5a9-compatible-controls FP: `["finding","CHANGED_REFERENCE","","buildStoredDocBridgeIndex","docs/guides/injected-storage.md"]`. Unexpected diagnostic in the frozen document scope; cause requires review of raw evidence.
- history-doc-bridge-8c8ec5a9-compatible-controls FP: `["finding","CHANGED_REFERENCE","","buildStoredDocBridgeIndex","docs/spec/storage-io-v1.md"]`. Unexpected diagnostic in the frozen document scope; cause requires review of raw evidence.
- history-doc-bridge-39157425-compatible-controls FP: `["finding","CHANGED_REFERENCE","","buildStoredDocBridgeIndex","docs/guides/injected-storage.md"]`. Unexpected diagnostic in the frozen document scope; cause requires review of raw evidence.
- history-doc-bridge-39157425-compatible-controls FP: `["finding","CHANGED_REFERENCE","","buildStoredDocBridgeIndex","docs/spec/storage-io-v1.md"]`. Unexpected diagnostic in the frozen document scope; cause requires review of raw evidence.

## Limits and maintenance

V1 case bytes are unchanged. V2 adds workspace membership, schema-owner anchors, secondary command-owner flag gold and separate raw expectations for policy-excluded documents. Acquisition and measurement failures remain visible; the recorded engine bundle measures citation attribution and region-update behavior without changing existing gold.

Confirmed historical cases: 39. First-parent mining reviewed 149/115/77 commits at the three original immutable pins and 835 at the additional public AgentsKit pin. 39 hand-reviewed cases include stale exhaustive value/type claims, compatible additions, correctly updated documentation and retired documents. Parallel documentation sites, multiple tokens in one document and retirement controls are correlated assertion units, not independent commits. No prevalence or release-readiness estimate is claimed. Added cases with overlapping document scopes in the same transition are consolidated, so shared diagnostics cannot inflate the retained finding denominator.
Historical positives and correctly updated negatives are scored separately from authored and native mutations; purposive sampling does not establish historical prevalence.

Native mutations, authored workspace fixtures and real historical transitions are separate origins. Review candidates are not confirmed semantic divergences. Scope is explicitly bounded by fact tokens and document paths; all findings within each selected document are scored. Raw gold includes policy-excluded/historical/version-pinned citations. No upstream code is installed or executed. Existing corpus gold is retained; this run measures the recorded engine bundle.

Raw policy-excluded findings have explicit gold and are not mislabeled as engine false positives. Every remaining mismatch above requires the recorded evidence and cause; updated citation regions remain review candidates, never confirmed corrections.

Unavailable or invalid cases are excluded from score denominators, remain visible, and prevent a complete-corpus measurement claim. Scores below target are benchmark failures, not execution failures or release-readiness evidence.

## Historical release gate and independent review

| Criterion | Current evidence | Result |
| --- | --- | --- |
| At least 30 reviewed historical cases | 39: 7 positive, 32 negative | Pass |
| CHANGED_REFERENCE precision at least 80% | 10/15 = 66.67% | **Blocked** |
| Negative-case FP rate at most 20% | 3/32 = 9.38% | Pass |
| Positive-case coverage reported | 7/7 = 100% | Pass |
| Historical finding recall does not regress | 10 TP, 0 FN; baseline 10 TP, 0 FN | Pass |
| V2 native and fixture finding precision/coverage | Native 15/0/0; fixture 26/0/0 (TP/FP/FN) | Pass |

The gate counts reviewed cases separately from emitted finding units. Four pinned public sources contribute 39 cases across 25 distinct first-parent transitions. Twelve retirement controls share one deleted-document transition; three scaffold-union changes revisit one unrepaired document, and parallel documentation sites are correlated. This purposive sample does not estimate prevalence or repository-wide semantic recall.

All 75 pre-existing v2 records and the first three pins are unchanged. Added review projections have comments/whitespace normalized for hygiene; all tokens, expected units, source/document bytes and citation scopes remain unchanged. The cached baseline suite hash can be reconstructed exactly by restoring only that review trivia.

## Before/after cause review

The final pre-change 94-case run had historical TP 10 / FP 35 / FN 0: 22.22% precision, negative-case FP rate 13/32 (40.63%), positive-case coverage 7/7. The current run has TP 10 / FP 5 / FN 0: 66.67% precision, negative-case FP rate 3/32 (9.38%), positive-case coverage 7/7. The baseline was measured at the earlier source base; the current branch was subsequently rebased onto the 2.0 prerelease. Intermediate bundles measured the claim-filter reduction before that rebase. Bundle/suite hashes bind each run; the aggregate is not a claim that every change came from one proof.

Gold, citation ownership matchers and frozen v1 bytes were not loosened. ADR 0023 records the approved claim/mention contract. The input-prose candidates below preserve uncertainty when local/inherited declarations cannot prove compatibility. No residual candidate is discarded to pass the gate.

### Every current historical mismatch

| Case | Finding / document | Hand-reviewed cause |
| --- | --- | --- |
| history-doc-bridge-9a775a55-reconciliation-scope | surfaces.mcp.tools / docs/spec/config-v1.md | The current allowed string union is verified, but its informal “core set” default comment cannot be proven from that enum claim. It remains a conservative default candidate; hand review confirms the document is valid. |
| history-doc-bridge-8c8ec5a9-compatible-controls | buildStoredDocBridgeIndex / docs/guides/injected-storage.md | This transition extends optional controls and restructures return variants. The guarded existing call remains supported. Retained context cannot resolve the inherited schema type query, so the classifier cannot prove the unchanged call/input aspect and retains a candidate. |
| history-doc-bridge-8c8ec5a9-compatible-controls | buildStoredDocBridgeIndex / docs/spec/storage-io-v1.md | This transition extends optional controls and restructures return variants. The listed reader/artifact/configuration inputs remain supported. Retained context cannot resolve the inherited schema type query, so the classifier cannot prove the unchanged call/input aspect and retains a candidate. |
| history-doc-bridge-39157425-compatible-controls | buildStoredDocBridgeIndex / docs/guides/injected-storage.md | This transition adds optional profile/coverage fields. The guarded existing call remains supported. Retained context cannot resolve the inherited schema type query, so the classifier cannot prove the unchanged call/input aspect and retains a candidate. |
| history-doc-bridge-39157425-compatible-controls | buildStoredDocBridgeIndex / docs/spec/storage-io-v1.md | This transition adds optional profile/coverage fields. The listed reader/artifact/configuration inputs remain supported. Retained context cannot resolve the inherited schema type query, so the classifier cannot prove the unchanged call/input aspect and retains a candidate. |

There are no current historical false negatives. Native and v2 fixture finding/fact scores have no mismatches; raw historical candidates have the same five mismatches.

### Every baseline historical false positive

| Case | Finding / document | Current disposition and cause |
| --- | --- | --- |
| history-doc-bridge-4a5fa2f2-createmarkdownpluginv2 | createMarkdownPluginV2 / docs/spec/discovery-plugin-v2.md | Omitted: Bare adapter mentions are separated from unrelated signature claims; unchanged optional call aspects use bounded proofs. Independent review: The Markdown adapter gained an optional adapter list with a default. The specification added package/version adapter responsibilities in the same commit. Existing no-argument use remains valid; the document does not assert that additional arguments are forbidden. |
| history-doc-bridge-9a775a55-reconciliation-scope | reconciliation.scope / docs/spec/config-v1.md | Omitted: Changed-aspect claim classification separates mentions and unchanged member/call usage from an owner hash delta. Independent review: The schema adds 'area' to the enum and the same commit changes the specification scope union to 'file' \| 'module' \| 'area' \| 'package'. The documented allowed values match the real head schema; no stale claim remains. |
| history-doc-bridge-9a775a55-reconciliation-scope | surfaces.mcp.tools / docs/spec/config-v1.md | Retained: The current allowed string union is verified, but its informal “core set” default comment cannot be proven from that enum claim. It remains a conservative default candidate; hand review confirms the document is valid. |
| history-doc-bridge-8c8ec5a9-compatible-controls | buildStoredDocBridgeIndex / docs/guides/injected-storage.md | Retained: This transition extends optional controls and restructures return variants. The guarded existing call remains supported. Retained context cannot resolve the inherited schema type query, so the classifier cannot prove the unchanged call/input aspect and retains a candidate. |
| history-doc-bridge-8c8ec5a9-compatible-controls | buildStoredDocBridgeIndex / docs/spec/retrieval-index-v1.md | Omitted: Changed-aspect claim classification separates mentions and unchanged member/call usage from an owner hash delta. Independent review: The return adds optional metrics and allows failures without limitations. These documents describe guarded status handling and acquisition rather than asserting limitations on every failure; the guarded examples remain valid. |
| history-doc-bridge-8c8ec5a9-compatible-controls | buildStoredDocBridgeIndex / docs/spec/service-profile-v1.md | Omitted: Changed-aspect claim classification separates mentions and unchanged member/call usage from an owner hash delta. Independent review: The return adds optional metrics and allows failures without limitations. These documents describe guarded status handling and acquisition rather than asserting limitations on every failure; the guarded examples remain valid. |
| history-doc-bridge-8c8ec5a9-compatible-controls | buildStoredDocBridgeIndex / docs/spec/storage-io-v1.md | Retained: This transition extends optional controls and restructures return variants. The listed reader/artifact/configuration inputs remain supported. Retained context cannot resolve the inherited schema type query, so the classifier cannot prove the unchanged call/input aspect and retains a candidate. |
| history-doc-bridge-8c8ec5a9-compatible-controls | diffSnapshotsWithRead / docs/guides/injected-storage.md | Omitted: Parameter-only and shallow owned-option proofs ignore unused optional additions without requiring unrelated return types. Independent review: The optional operation controls extend the prior signal/branch call. The cited calls remain supported; none claims an exhaustive option list. |
| history-doc-bridge-8c8ec5a9-compatible-controls | diffSnapshotsWithRead / docs/spec/cli.md | Omitted: Parameter-only and shallow owned-option proofs ignore unused optional additions without requiring unrelated return types. Independent review: The optional operation controls extend the prior signal/branch call. The cited calls remain supported; none claims an exhaustive option list. |
| history-doc-bridge-4a5fa2f2-compatible-controls | createMarkdownPluginV2 / docs/guides/injected-storage.md | Omitted: Bare adapter mentions are separated from unrelated signature claims; unchanged optional call aspects use bounded proofs. Independent review: The new adapter parameter is defaulted. The guide identifies the built-in factory without asserting that arguments are forbidden; existing no-argument use remains supported. |
| history-doc-bridge-4a5fa2f2-compatible-controls | DiscoveryPluginV2 / docs/guides/injected-storage.md | Omitted: Bare adapter mentions are separated from unrelated signature claims; unchanged optional call aspects use bounded proofs. Independent review: The interface adds an optional normalizeRange hook. The guide describes caller-registered instances without asserting an exhaustive hook set; existing implementations remain valid. |
| history-doc-bridge-39157425-compatible-controls | buildStoredDocBridgeIndex / docs/guides/injected-storage.md | Retained: This transition adds optional profile/coverage fields. The guarded existing call remains supported. Retained context cannot resolve the inherited schema type query, so the classifier cannot prove the unchanged call/input aspect and retains a candidate. |
| history-doc-bridge-39157425-compatible-controls | buildStoredDocBridgeIndex / docs/spec/retrieval-index-v1.md | Omitted: Changed-aspect claim classification separates mentions and unchanged member/call usage from an owner hash delta. Independent review: Coverage is an optional return field. The cited documents and guarded examples do not assert an exhaustive return property list; prior calls remain valid. |
| history-doc-bridge-39157425-compatible-controls | buildStoredDocBridgeIndex / docs/spec/storage-io-v1.md | Retained: This transition adds optional profile/coverage fields. The listed reader/artifact/configuration inputs remain supported. Retained context cannot resolve the inherited schema type query, so the classifier cannot prove the unchanged call/input aspect and retains a candidate. |
| history-doc-bridge-39157425-compatible-controls | diffSnapshotsWithRead / docs/guides/injected-storage.md | Omitted: Parameter-only and shallow owned-option proofs ignore unused optional additions without requiring unrelated return types. Independent review: An optional execution profile is added to defaulted options. Existing signal/branch calls remain valid; the same commit adds service-profile documentation. |
| history-doc-bridge-39157425-compatible-controls | diffSnapshotsWithRead / docs/spec/cli.md | Omitted: Parameter-only and shallow owned-option proofs ignore unused optional additions without requiring unrelated return types. Independent review: An optional execution profile is added to defaulted options. Existing signal/branch calls remain valid; the same commit adds service-profile documentation. |
| history-doc-bridge-548060c4-intelligence.retriever.mode-review | gates.exclude / docs/spec/config-v1.md | Omitted: Changed-aspect claim classification separates mentions and unchanged member/call usage from an owner hash delta. Independent review: The schema adds agentskit-rag to intelligence.retriever.mode and four values to the allowed MCP tool enum. The head configuration contract still prints the old local/remote/bm25 mode union and the old five-value McpToolId union, while its GateId union is correctly updated to include docs-style. Thus the mode and tool-enum claims are positives and the simultaneously updated gate include/exclude unions are negative controls within the same document. The MCP default core set is not asserted to have changed in this transition. |
| history-doc-bridge-548060c4-intelligence.retriever.mode-review | gates.include / docs/spec/config-v1.md | Omitted: Changed-aspect claim classification separates mentions and unchanged member/call usage from an owner hash delta. Independent review: The schema adds agentskit-rag to intelligence.retriever.mode and four values to the allowed MCP tool enum. The head configuration contract still prints the old local/remote/bm25 mode union and the old five-value McpToolId union, while its GateId union is correctly updated to include docs-style. Thus the mode and tool-enum claims are positives and the simultaneously updated gate include/exclude unions are negative controls within the same document. The MCP default core set is not asserted to have changed in this transition. |
| history-chat-891be155-chatdefinition-review | ChatDefinition / docs/components/catalog.md | Omitted: Subject sentences, bare type mentions and exact-symbol association keep unrelated adjacent examples/claims separate. Independent review: The definition adds an optional choiceSubmission callback. Existing definitions in the cited documents remain valid and the same commit adds reserved deterministic-answer documentation; these references do not assert that additional optional fields are forbidden. |
| history-chat-891be155-chatdefinition-review | ChatDefinition / docs/theming-and-composition.md | Omitted: Subject sentences, bare type mentions and exact-symbol association keep unrelated adjacent examples/claims separate. Independent review: The definition adds an optional choiceSubmission callback. Existing definitions in the cited documents remain valid and the same commit adds reserved deterministic-answer documentation; these references do not assert that additional optional fields are forbidden. |
| history-chat-0141229e-sessionstorage-review | SessionStorage / docs/sessions.md | Omitted: Subject sentences, bare type mentions and exact-symbol association keep unrelated adjacent examples/claims separate. Independent review: Storage callbacks gain optional AbortSignal arguments. The documented two-argument CAS save and single-argument load remain valid; the atomicity requirement is unchanged. |
| history-chat-daa15aab-compatible-controls | ChatDefinition / apps/example-react/README.md | Omitted: Subject sentences, bare type mentions and exact-symbol association keep unrelated adjacent examples/claims separate. Independent review: The definition adds an optional revision field. Existing definitions remain valid; the same commit documents revision compatibility and session metadata. |
| history-chat-daa15aab-compatible-controls | createActionConfirmation / docs/components/choice-list.md | Omitted: The input word describes the unchanged returned handle, not a changed argument claim. Independent review: Confirmation options add defaulted initialRecords and optional persistence callbacks. Existing session/chat calls remain valid; the same commit documents durable session metadata and restored confirmation behavior. |
| history-chat-daa15aab-compatible-controls | createActionConfirmation / docs/for-agents/packages/chat.md | Omitted: The input word describes the unchanged returned handle, not a changed argument claim. Independent review: Confirmation options add defaulted initialRecords and optional persistence callbacks. Existing session/chat calls remain valid; the same commit documents durable session metadata and restored confirmation behavior. |
| history-chat-daa15aab-compatible-controls | createActionConfirmation / packages/chat/README.md | Omitted: The input word describes the unchanged returned handle, not a changed argument claim. Independent review: Confirmation options add defaulted initialRecords and optional persistence callbacks. Existing session/chat calls remain valid; the same commit documents durable session metadata and restored confirmation behavior. |
| history-chat-daa15aab-compatible-controls | createChatSession / docs/for-agents/packages/chat.md | Omitted: Changed-aspect claim classification separates mentions and unchanged member/call usage from an owner hash delta. Independent review: Session creation gains a defaulted options parameter. Existing single-argument calls remain valid; the same commit documents the new session metadata behavior. |
| history-chat-75bb10aa-compatible-controls | ChoiceListNative / packages/react-native/README.md | Omitted: Changed-aspect claim classification separates mentions and unchanged member/call usage from an owner hash delta. Independent review: ChoiceListNative adds a defaulted disabled binding in its props destructuring. Existing frame/manifest/onSelect usage remains valid; no cited document prohibits disabled state. |
| history-chat-69a46efa-chatdefinition-review | ChatDefinition / apps/example-react/README.md | Omitted: Subject sentences, bare type mentions and exact-symbol association keep unrelated adjacent examples/claims separate. Independent review: The definition adds an optional component manifest. Existing definitions remain valid and the same commit documents closed component manifests; optional additive fields do not invalidate the existing examples. |
| history-chat-e9c3d45c-chatdefinition-review | ChatDefinition / apps/example-react/README.md | Omitted: Subject sentences, bare type mentions and exact-symbol association keep unrelated adjacent examples/claims separate. Independent review: The definition adds an optional conversation. Existing simple chat definitions remain valid; the same commit documents deterministic conversation routes. |
| history-agentskit-a0c1845a-chatstate-review | AgentsKitConfig / apps/docs/docs/packages/core.md | Omitted: Changed-aspect claim classification separates mentions and unchanged member/call usage from an owner hash delta. Independent review: ChatState gains required usage output. The cited package tables only identify the exported type and link to full signatures; neither prints an old state literal or asserts an exhaustive field list. Existing consumers may need review, but these particular document claims remain true. These two parallel sites are correlated controls for one transition. |
| history-agentskit-a0c1845a-chatstate-review | ChatState / apps/docs-next/content/docs/packages/core.mdx | Omitted: Changed-aspect claim classification separates mentions and unchanged member/call usage from an owner hash delta. Independent review: ChatState gains required usage output. The cited package tables only identify the exported type and link to full signatures; neither prints an old state literal or asserts an exhaustive field list. Existing consumers may need review, but these particular document claims remain true. These two parallel sites are correlated controls for one transition. |
| history-agentskit-a0c1845a-chatstate-review | ChatState / apps/docs/docs/packages/core.md | Omitted: Changed-aspect claim classification separates mentions and unchanged member/call usage from an owner hash delta. Independent review: ChatState gains required usage output. The cited package tables only identify the exported type and link to full signatures; neither prints an old state literal or asserts an exhaustive field list. Existing consumers may need review, but these particular document claims remain true. These two parallel sites are correlated controls for one transition. |
| history-agentskit-a0c1845a-chatstate-review | StreamChunk / apps/docs-next/content/docs/packages/core.mdx | Omitted: Changed-aspect claim classification separates mentions and unchanged member/call usage from an owner hash delta. Independent review: ChatState gains required usage output. The cited package tables only identify the exported type and link to full signatures; neither prints an old state literal or asserts an exhaustive field list. Existing consumers may need review, but these particular document claims remain true. These two parallel sites are correlated controls for one transition. |
| history-agentskit-a0c1845a-chatstate-review | StreamChunk / apps/docs/docs/packages/core.md | Omitted: Changed-aspect claim classification separates mentions and unchanged member/call usage from an owner hash delta. Independent review: ChatState gains required usage output. The cited package tables only identify the exported type and link to full signatures; neither prints an old state literal or asserts an exhaustive field list. Existing consumers may need review, but these particular document claims remain true. These two parallel sites are correlated controls for one transition. |
| history-agentskit-81ee4e63-adapterrequest-review | AdapterRequest / apps/docs-next/content/docs/reference/recipes/custom-adapter.mdx | Omitted: Recognized fence metadata and changed-member usage checks avoid treating an unchanged messages read as a correlation-field claim. Independent review: AdapterRequest gains an optional correlation field. The custom adapter recipe reads messages and retains its annotated request argument; it does not assert that correlation is forbidden. The same commit documents propagated event identity, and the existing recipe remains valid. |

The second intermediate run and the current run both have five FPs, with different units: the option-only diff call and confirmation-return prose are now omitted; two index-builder input-prose candidates are retained after removing the unsafe assumption that an unchanged parameter type name implies an unchanged local declaration. Aggregate equality does not hide that change.

## Fresh frozen v1 comparison

The frozen case file remains SHA-256 `0264264d3b390b8dc0cbf48b1d721ea336abcf26c51e9dab1bead42543e5ff0f`; its published v1 report is unchanged. All 53 fresh cases were acquired and measured. V1 fixture/annotation limits remain separate from the repaired v2 fixture set.

| Origin / mode | TP | FP | FN |
| --- | ---: | ---: | ---: |
| native / default | 15 | 0 | 0 |
| native / raw | 15 | 0 | 0 |
| fixture-backed / default | 13 | 2 | 8 |
| fixture-backed / raw | 13 | 14 | 8 |

Changed frozen-v1 case scores versus the unchanged published report:

- doc-bridge-default-change: default/raw TP, FP, FN 1/0/1/1/0/1 → 2/0/0/2/0/0; compare its mismatch details below with the published v1 report. The native default finding was already present in the pre-change 94-case baseline: the intervening configuration citation refinement associates the owned default comment. This task does not receive credit for that earlier recovery; all other frozen-v1 scores are unchanged.

### Every frozen v1 mismatch and cause

#### Default false positives and false negatives

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

#### Raw false positives and false negatives

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

#### Limits and maintenance

Acquisition fetches exact pinned commits directly, rather than relying on a moving shallow default-branch history. All 53 cases now execute; the earlier preview failures are not reproduced on this pinned corpus and engine bundle. No fixture precondition repair was needed or claimed; fixture mutations remain unchanged. No case or expected location was removed. The runner records concrete mutation/citation/acquisition failures and never publishes subprocess output.

Confirmed historical cases: 0. First-parent mining inspected 149 doc-bridge, 115 chat and 77 playbook commits. Export-token/doc-diff overlap shortlisted 29 pairs; manually inspected examples were concurrent changes, release rollups, new observer APIs, import-path migration or new docs rather than a later stale-claim fix. Zero delayed fixes confirmed; bounded search does not prove none exist.
Historical recall is not analyzed.

Native numbers are the headline; fixture-backed results never mix into native numbers. Frozen scopes select fact kinds/tokens and affected doc files; other findings within those doc files are FP. CHANGED_REFERENCE replaces the frozen placeholder FACT_CHANGE to match the shipped stale-or-unverified review-candidate contract; expected tokens and locations are unchanged. Fact extraction and reference findings have separate denominators. Small purposive cases are not a random sample or release-readiness claim. Historical recall is not analyzed: no confirmed delayed-doc cases within the bounded search. No upstream code is executed or installed. Authored fixtures exist only in temporary checkouts. Plain command/token citations are matched by file/token; distinct lines in one file count once.

The two included finding-overall fixture FPs are secondary flag-removal findings missing from command-only gold annotations. They remain scored as FPs; the frozen v1 set is kept for comparability. Raw-only negative-control FPs reflect intentionally disabled exclusions/version routing and are listed individually above. Fixture misses and annotation limits are accepted measurement limits, not reasons to loosen the engine matchers.

Unavailable or invalid cases are excluded from score denominators, remain visible, and prevent a complete-corpus measurement claim. Scores below target are benchmark failures, not execution failures or release-readiness evidence.


## Reproducibility and validation scope

Two fresh v2 raw JSON files and runner-rendered Markdown files are byte-identical; the two fresh v1 outputs are likewise byte-identical. Maintained narrative appendices are separate from those runner bytes.

- v2 runner json SHA-256: `841e56137f19b0640e627714e34bf55749ac9b039965b4e791def29e03f0539a`.
- v2 runner md SHA-256: `47078dc6fe15358b8cad34a42e81b57678ca2ba0c6a13eaae3077209a02f37dd`.
- v1 runner json SHA-256: `805e16c1e9c9be02c535006247257cd06abcd4064a33b8197b4e1f0bf713f19d`.
- v1 runner md SHA-256: `bc0c804278243153bd161c08b826fbd08580f8a40efafa6f9cf78ee608c251e7`.

Current-source validation passed 1,059 Vitest tests with two workers, all five plugin/upstream test scripts, all 19 real marketplace Action tests, typecheck/build, no-legacy imports, cross-platform checks, pinned upstream/marketplace contracts, README standard, parity, index generation, configured gates and documentation-standard conformance. The initial full run failed on a shared remediation bare-mention fixture; its explicit claim was corrected and the one authorized full rerun passed. These checks do not override the failed historical precision criterion.

Index/handoff schemas, citation relations, changed facts and surviving finding identities are unchanged by this work. Layer 0 performs syntax/read verification without an LLM, API key or network request; benchmark Git downloads acquire the public corpus separately. No new dependency was added.

Not analyzed: broader semantic prose/architecture coverage, dependency-only changes with unchanged callable hashes, unknown schema/type-query compatibility, current large-repository latency/heap cost, UI and production endpoint/database behavior. Prior cost measurements belong to their earlier bundle and are not current validation. The next engine step needs a conservative proof for inherited schema-backed inputs/returns, with an ADR and fresh compatibility/privacy/cost evidence if retained context changes.

The historical release gate remains blocked; maintainer review and CI are still required.


## Precision-tail gate measurement

The numerical historical gate **passes** on all 94 acquired and measured v2
cases, including 39 hand-reviewed historical cases. No case, gold expectation,
threshold or benchmark matcher changed. The prior claim policy result remains
above as the comparison baseline. This purposive sample is not a claim of
repository-wide semantic accuracy or general release readiness.

| Finding control | TP | FP | FN | Precision | Coverage |
| --- | ---: | ---: | ---: | ---: | ---: |
| Historical CHANGED_REFERENCE | 10 | 2 | 0 | 83.33% | 100% |
| Native, default and raw | 15 | 0 | 0 | 100% | 100% |
| Fixtures, default | 26 | 0 | 0 | 100% | 100% |
| Fixtures, raw | 38 | 0 | 0 | 100% | 100% |

Historical positive-case coverage is 7/7. Negative-case false-positive rate is
2/32 = 6.25%, below the 20% gate. The preceding engine result was historical
10 TP / 5 FP / 0 FN (66.67% precision). Three schema-backed input/call candidates
are now positively proved compatible; no true positive was lost.

The two remaining false positives are deliberately retained:

- `history-doc-bridge-9a775a55-reconciliation-scope`: the configuration region
  still includes an informal MCP “core set” default claim. Matching its enum
  cannot prove that opaque default unchanged in effect.
- `history-doc-bridge-8c8ec5a9-compatible-controls`: the injected-storage example
  uses a guarded result, but the return union is restructured. The existing
  optional-member wrapper proof cannot establish that flow's compatibility.

There are no historical false negatives. Unknown syntax and unsupported schema
shapes remain candidates; they were not discarded to improve precision.

Measured engine bundle SHA-256:
`3123ad343536999af078de674c5661c85a0480f47374376f90a1ed10a10dfffb`.
V2 case SHA-256: `a75743e479eb976270a9186483a1a05cf5039e63bc341f5cc96f41dcd07eb92a`.
Runner SHA-256: `06c98e1a2f3bd7c2e3d47f4afa8620bfb23a3ce9336dde653ea0b9d6eaf3a6fa`.
Raw provenance records the baseline revision at measurement; bundle and source
manifest evidence bind the working implementation without rewriting provenance.


Frozen v1 was measured again on all 53 cases. Every default/raw case score
matches the preceding published engine run. Native findings remain 15 TP /
0 FP / 0 FN. Included fixture findings remain 13 TP / 2 FP / 8 FN; raw fixture
findings remain 13 TP / 14 FP / 8 FN. These frozen annotation/ownership limits
are still reported, and v1 fixture scores are not presented as passing the v2
control gate. V1 case bytes remain unchanged (SHA-256
`0264264d3b390b8dc0cbf48b1d721ea336abcf26c51e9dab1bead42543e5ff0f`).

This update uses one fresh complete run per suite. The earlier two-run
reproducibility measurements above belong to their earlier bundle, and are not
a new two-run claim for the precision-tail implementation.


### Local discovery retention cost

Three fresh process samples per engine/corpus compare the preceding adapter
against this bundle on immutable public corpora. Snapshot size is stable across
each set of three samples; the table reports median discovery time, excluding
module import and acquisition. No incremental snapshot was reused.

| Corpus | Baseline bytes | Current bytes | Growth | Baseline median | Current median |
| --- | ---: | ---: | ---: | ---: | ---: |
| doc-bridge | 5,304,273 | 5,441,007 | +2.578% | 2966.4 ms | 2878.0 ms |
| monorepo | 19,129,702 | 19,142,113 | +0.065% | 9511.5 ms | 8848.4 ms |

Both versions discover the same entity counts (3,375 and 9,813), with no partial
limit coverage. Samples use warm filesystem caches and were collected serially,
without randomized ordering; these timings establish local observations, not a
causal speed improvement or a production latency guarantee. Diff-time proof
latency and broader repository performance were not measured.
