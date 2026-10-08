---
owner: maintainers
lifecycle: active
sourceOfTruth: docs/bench/layer1-cases-v2.json
validationPath: node scripts/bench-layer1.mjs --self-check
---

# Layer-1 benchmark results v2

Native included documentation findings: precision **100.00%**, coverage **93.33%** (TP 14, FP 0, FN 1). Targets: native precision ≥95% met; native coverage ≥90% met.

The headline uses shipped default policy routing. Included means proposed or routed-to-L2; excluded and pending-version candidates are reported separately. Review candidates, including CHANGED_REFERENCE (stale-or-unverified, routed-to-L2), are not confirmed divergences.

V2 retains v1 native cases and repairs authored fixture ownership, configuration anchors and raw policy gold. Historical cases compare unmodified public first-parent revisions; their reasoning is recorded in the case file.

Engine revision: `2fa7b9653c83fcd80c791f2eea9a9980ca871ba9`. Engine bundle SHA-256: `8ae0c6e60edb1a142a33b461757db44fe30b63683ca0cfbe8b314916313756af`.
Case SHA-256: `16c390d9122be1b36dc0891213949021d51cc662acfe78e294fa0b44a7e61fc9`.
Harness SHA-256: `06c98e1a2f3bd7c2e3d47f4afa8620bfb23a3ce9336dde653ea0b9d6eaf3a6fa`.

Coverage is recall: TP / (TP + FN). Precision is TP / (TP + FP). Units are distinct (case, channel, kind, operation, token, path); repeated citations in one document count once. Facts measure extraction/change detection separately from documentation findings.

Measured cases: 75; unavailable: 0; invalid: 0.

## Policy dispositions in frozen document scopes

Policy counts use diagnostic identities; scores deduplicate assertion units, so totals can differ.

| Origin | Proposed | Routed to L2 | Excluded | Pending version |
| --- | ---: | ---: | ---: | ---: |
| native | 11 | 3 | 0 | 0 |
| fixture-backed | 21 | 8 | 9 | 3 |
| historical | 0 | 8 | 0 | 0 |

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
| historical: fact/config-key | 3 | 0 | 0 | 100.00% | 100.00% |
| historical: fact/signature | 4 | 0 | 0 | 100.00% | 100.00% |
| historical: fact/symbol | 23 | 0 | 0 | 100.00% | 100.00% |
| historical: finding/CHANGED_REFERENCE | 3 | 5 | 1 | 37.50% | 75.00% |
| historical: finding-overall | 3 | 5 | 1 | 37.50% | 75.00% |
| historical: fact-overall | 30 | 0 | 0 | 100.00% | 100.00% |

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
| historical: fact/config-key | 3 | 0 | 0 | 100.00% | 100.00% |
| historical: fact/signature | 4 | 0 | 0 | 100.00% | 100.00% |
| historical: fact/symbol | 23 | 0 | 0 | 100.00% | 100.00% |
| historical: finding/CHANGED_REFERENCE | 3 | 5 | 1 | 37.50% | 75.00% |
| historical: finding-overall | 3 | 5 | 1 | 37.50% | 75.00% |
| historical: fact-overall | 30 | 0 | 0 | 100.00% | 100.00% |

## Historical assertion controls

| Label | Cases | Finding TP | FP | FN |
| --- | ---: | ---: | ---: | ---: |
| positive | 2 | 3 | 2 | 1 |
| negative | 18 | 0 | 3 | 0 |

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
| history-doc-bridge-4a5fa2f2-createmarkdownpluginv2 | historical | measured | 1 / 1 / 0 | 1 / 1 / 0 |
| history-doc-bridge-14337aea-diffsnapshots | historical | measured | 1 / 0 / 0 | 1 / 0 / 0 |
| history-doc-bridge-ab68bd6d-corpus-agent-include | historical | measured | 4 / 1 / 0 | 4 / 1 / 0 |
| history-doc-bridge-1695826b-surfaces-mcp-tools | historical | measured | 1 / 1 / 1 | 1 / 1 / 1 |
| history-doc-bridge-9a775a55-reconciliation-scope | historical | measured | 1 / 1 / 0 | 1 / 1 / 0 |
| doc-bridge-fixture-same-change-adequate | fixture-backed | measured | 2 / 0 / 0 | 2 / 0 / 0 |
| doc-bridge-fixture-same-change-incomplete | fixture-backed | measured | 2 / 0 / 0 | 2 / 0 / 0 |
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
| history-chat-5e47de83-createaskadapter | historical | measured | 1 / 1 / 0 | 1 / 1 / 0 |
| history-chat-68f5bf7e-withabort | historical | measured | 1 / 0 / 0 | 1 / 0 / 0 |
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

## Default false positives and false negatives

- doc-bridge-default-change FN: `["finding","CHANGED_REFERENCE","","surfaces.cli.bin","docs/spec/config-v1.md"]`. The native documentation uses bin?: string with a default comment. The strict-context matcher deliberately leaves this property signature unresolved: no owned base citation links it to surfaces.cli.bin, despite the extracted default delta. This remains an explicit native limitation.
- history-doc-bridge-4a5fa2f2-createmarkdownpluginv2 FP: `["finding","CHANGED_REFERENCE","","createMarkdownPluginV2","docs/spec/discovery-plugin-v2.md"]`. Unexpected diagnostic in the frozen document scope; cause requires review of raw evidence.
- history-doc-bridge-ab68bd6d-corpus-agent-include FP: `["finding","CHANGED_REFERENCE","","routing.options","docs/spec/config-v1.md"]`. Unexpected diagnostic in the frozen document scope; cause requires review of raw evidence.
- history-doc-bridge-1695826b-surfaces-mcp-tools FP: `["finding","CHANGED_REFERENCE","","surfaces.mcp","docs/spec/config-v1.md"]`. Unexpected diagnostic in the frozen document scope; cause requires review of raw evidence.
- history-doc-bridge-1695826b-surfaces-mcp-tools FN: `["finding","CHANGED_REFERENCE","","surfaces.mcp.tools","docs/spec/config-v1.md"]`. No owned base citation relation for the changed fact; no documentation review candidate can be emitted.
- history-doc-bridge-9a775a55-reconciliation-scope FP: `["finding","CHANGED_REFERENCE","","surfaces.mcp","docs/spec/config-v1.md"]`. Unexpected diagnostic in the frozen document scope; cause requires review of raw evidence.
- history-chat-5e47de83-createaskadapter FP: `["finding","CHANGED_REFERENCE","","createAskAdapter","packages/chat/README.md"]`. Unexpected diagnostic in the frozen document scope; cause requires review of raw evidence.

## Raw false positives and false negatives

- doc-bridge-default-change FN: `["finding","CHANGED_REFERENCE","","surfaces.cli.bin","docs/spec/config-v1.md"]`. The native documentation uses bin?: string with a default comment. The strict-context matcher deliberately leaves this property signature unresolved: no owned base citation links it to surfaces.cli.bin, despite the extracted default delta. This remains an explicit native limitation.
- history-doc-bridge-4a5fa2f2-createmarkdownpluginv2 FP: `["finding","CHANGED_REFERENCE","","createMarkdownPluginV2","docs/spec/discovery-plugin-v2.md"]`. Unexpected diagnostic in the frozen document scope; cause requires review of raw evidence.
- history-doc-bridge-ab68bd6d-corpus-agent-include FP: `["finding","CHANGED_REFERENCE","","routing.options","docs/spec/config-v1.md"]`. Unexpected diagnostic in the frozen document scope; cause requires review of raw evidence.
- history-doc-bridge-1695826b-surfaces-mcp-tools FP: `["finding","CHANGED_REFERENCE","","surfaces.mcp","docs/spec/config-v1.md"]`. Unexpected diagnostic in the frozen document scope; cause requires review of raw evidence.
- history-doc-bridge-1695826b-surfaces-mcp-tools FN: `["finding","CHANGED_REFERENCE","","surfaces.mcp.tools","docs/spec/config-v1.md"]`. No owned base citation relation for the changed fact; no documentation review candidate can be emitted.
- history-doc-bridge-9a775a55-reconciliation-scope FP: `["finding","CHANGED_REFERENCE","","surfaces.mcp","docs/spec/config-v1.md"]`. Unexpected diagnostic in the frozen document scope; cause requires review of raw evidence.
- history-chat-5e47de83-createaskadapter FP: `["finding","CHANGED_REFERENCE","","createAskAdapter","packages/chat/README.md"]`. Unexpected diagnostic in the frozen document scope; cause requires review of raw evidence.

## Limits and maintenance

V1 case bytes are unchanged. V2 adds workspace membership, schema-owner anchors, secondary command-owner flag gold and separate raw expectations for policy-excluded documents. Acquisition and measurement failures remain visible; the recorded engine bundle measures citation attribution and region-update behavior without changing existing gold.

Confirmed historical cases: 20. Reviewed 149/115/77 first-parent commits at the three frozen pins. Twenty selected assertion cases span nine real transitions; twelve negative assertions share one package-retirement transition and README. Two positive assertions confirm stale defaults/tool vocabulary; no delayed repair is claimed. This purposive, correlated sample is not a repository-wide prevalence or independent-commit estimate.
Historical positives and correctly updated negatives are scored separately from authored and native mutations; purposive sampling does not establish historical prevalence.

Native mutations, authored workspace fixtures and real historical transitions are separate origins. Review candidates are not confirmed semantic divergences. Scope is explicitly bounded by fact tokens and document paths; all findings within each selected document are scored. Raw gold includes policy-excluded/historical/version-pinned citations. No upstream code is installed or executed. Existing corpus gold is retained; this run measures the recorded engine bundle.

Raw policy-excluded findings have explicit gold and are not mislabeled as engine false positives. Every remaining mismatch above requires the recorded evidence and cause; updated citation regions remain review candidates, never confirmed corrections.

Unavailable or invalid cases are excluded from score denominators, remain visible, and prevent a complete-corpus measurement claim. Scores below target are benchmark failures, not execution failures or release-readiness evidence.

## Historical mismatch cause review

All visible review candidates remain in the scoring denominator, including
`updated-in-this-change`; grouping does not suppress false positives.

- `createMarkdownPluginV2` FP: an optional adapter-list parameter changes the
  signature hash while the documented no-argument call remains valid. Changes
  elsewhere in the specification do not alter that citation region. Deterministic
  signature comparison cannot establish semantic incompatibility.
- `routing.options` FP in the corpus-default transition: the schema adds
  `routing.options.ownershipFromCorpus`. No base citation names the added child,
  so the containing key remains a lower-priority fallback with that path as
  evidence. The parent citation is not an exhaustive allowed-key assertion.
- `surfaces.mcp` FP and `surfaces.mcp.tools` FN in the tool-vocabulary transition:
  both snapshots explicitly report more than 64 fact references in the
  configuration specification. The retained graph lacks the child citation;
  the parent fallback cannot recover that omitted edge. The tools delta is
  extracted, but document attribution remains limited by recorded citation coverage.
- `surfaces.mcp` FP in the reconciliation transition: the same commit also adds
  `knowledge.search` and `knowledge.lookup` to the tool schema/defaults. The
  64-fact cap again omits the descendant citation, leaving a containing-key
  fallback. The separately updated reconciliation union is not the cited
  parent's region and cannot validate the tool assertion.
- `createAskAdapter` FP: the return type changes to an extending interface,
  preserving the documented call. Its README citation region changes, so the
  candidate is marked `updated-in-this-change` and is not pending. It remains
  visible and scored as an FP against the unchanged semantic-negative gold.

These five FPs and one FN remain explicit limits. Historical changed-reference
precision is 37.50% (3 TP / 5 FP), and coverage is 75.00% (3 TP / 1 FN), compared
with 28.57% and 50.00%. Native and existing fixture scores do not regress; the
new adequate and incomplete region-edit cases both retain review candidates.
