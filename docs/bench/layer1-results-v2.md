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

Engine revision: `d7887056e21b61614c992e922b0f62037956e7fb`. Engine bundle SHA-256: `3df5592a72ffa3f7958ab03e55db874693170168e50be547381148b94d0a6b90`.
Case SHA-256: `e9e6c5e665364ba93fd74d2cedf9f9f148882a7272adf0f72731e5a1be0e27b3`.
Harness SHA-256: `faeda9ac27aec1d4d1630dede0d63e8b916b2d07d028c76a08a68a91878ebd7b`.

Coverage is recall: TP / (TP + FN). Precision is TP / (TP + FP). Units are distinct (case, channel, kind, operation, token, path); repeated citations in one document count once. Facts measure extraction/change detection separately from documentation findings.

Measured cases: 73; unavailable: 0; invalid: 0.

## Policy dispositions in frozen document scopes

Policy counts use diagnostic identities; scores deduplicate assertion units, so totals can differ.

| Origin | Proposed | Routed to L2 | Excluded | Pending version |
| --- | ---: | ---: | ---: | ---: |
| native | 11 | 3 | 0 | 0 |
| fixture-backed | 21 | 6 | 9 | 3 |
| historical | 0 | 7 | 0 | 0 |

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
| fixture-backed: fact/config-key | 9 | 0 | 0 | 100.00% | 100.00% |
| fixture-backed: fact/signature | 3 | 0 | 0 | 100.00% | 100.00% |
| fixture-backed: fact/symbol | 15 | 0 | 0 | 100.00% | 100.00% |
| fixture-backed: finding/AMBIGUOUS_REFERENCE | 3 | 0 | 0 | 100.00% | 100.00% |
| fixture-backed: finding/BROKEN_REFERENCE | 15 | 0 | 0 | 100.00% | 100.00% |
| fixture-backed: finding/CHANGED_REFERENCE | 6 | 0 | 0 | 100.00% | 100.00% |
| fixture-backed: finding-overall | 24 | 0 | 0 | 100.00% | 100.00% |
| fixture-backed: fact-overall | 39 | 0 | 0 | 100.00% | 100.00% |
| historical: fact/config-key | 3 | 0 | 0 | 100.00% | 100.00% |
| historical: fact/signature | 4 | 0 | 0 | 100.00% | 100.00% |
| historical: fact/symbol | 23 | 0 | 0 | 100.00% | 100.00% |
| historical: finding/CHANGED_REFERENCE | 2 | 5 | 2 | 28.57% | 50.00% |
| historical: finding-overall | 2 | 5 | 2 | 28.57% | 50.00% |
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
| fixture-backed: fact/config-key | 9 | 0 | 0 | 100.00% | 100.00% |
| fixture-backed: fact/signature | 3 | 0 | 0 | 100.00% | 100.00% |
| fixture-backed: fact/symbol | 15 | 0 | 0 | 100.00% | 100.00% |
| fixture-backed: finding/AMBIGUOUS_REFERENCE | 3 | 0 | 0 | 100.00% | 100.00% |
| fixture-backed: finding/BROKEN_REFERENCE | 27 | 0 | 0 | 100.00% | 100.00% |
| fixture-backed: finding/CHANGED_REFERENCE | 6 | 0 | 0 | 100.00% | 100.00% |
| fixture-backed: finding-overall | 36 | 0 | 0 | 100.00% | 100.00% |
| fixture-backed: fact-overall | 39 | 0 | 0 | 100.00% | 100.00% |
| historical: fact/config-key | 3 | 0 | 0 | 100.00% | 100.00% |
| historical: fact/signature | 4 | 0 | 0 | 100.00% | 100.00% |
| historical: fact/symbol | 23 | 0 | 0 | 100.00% | 100.00% |
| historical: finding/CHANGED_REFERENCE | 2 | 5 | 2 | 28.57% | 50.00% |
| historical: finding-overall | 2 | 5 | 2 | 28.57% | 50.00% |
| historical: fact-overall | 30 | 0 | 0 | 100.00% | 100.00% |

## Historical assertion controls

| Label | Cases | Finding TP | FP | FN |
| --- | ---: | ---: | ---: | ---: |
| positive | 2 | 2 | 2 | 2 |
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
| history-doc-bridge-ab68bd6d-corpus-agent-include | historical | measured | 3 / 1 / 1 | 3 / 1 / 1 |
| history-doc-bridge-1695826b-surfaces-mcp-tools | historical | measured | 1 / 1 / 1 | 1 / 1 / 1 |
| history-doc-bridge-9a775a55-reconciliation-scope | historical | measured | 1 / 1 / 0 | 1 / 1 / 0 |
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
- history-doc-bridge-ab68bd6d-corpus-agent-include FP: `["finding","CHANGED_REFERENCE","","corpus.agent","docs/spec/config-v1.md"]`. Unexpected diagnostic in the frozen document scope; cause requires review of raw evidence.
- history-doc-bridge-ab68bd6d-corpus-agent-include FN: `["finding","CHANGED_REFERENCE","","corpus.agent.include","docs/spec/config-v1.md"]`. No owned base citation relation for the changed fact; no documentation review candidate can be emitted.
- history-doc-bridge-1695826b-surfaces-mcp-tools FP: `["finding","CHANGED_REFERENCE","","surfaces.mcp","docs/spec/config-v1.md"]`. Unexpected diagnostic in the frozen document scope; cause requires review of raw evidence.
- history-doc-bridge-1695826b-surfaces-mcp-tools FN: `["finding","CHANGED_REFERENCE","","surfaces.mcp.tools","docs/spec/config-v1.md"]`. No owned base citation relation for the changed fact; no documentation review candidate can be emitted.
- history-doc-bridge-9a775a55-reconciliation-scope FP: `["finding","CHANGED_REFERENCE","","surfaces.mcp","docs/spec/config-v1.md"]`. Unexpected diagnostic in the frozen document scope; cause requires review of raw evidence.
- history-chat-5e47de83-createaskadapter FP: `["finding","CHANGED_REFERENCE","","createAskAdapter","packages/chat/README.md"]`. Unexpected diagnostic in the frozen document scope; cause requires review of raw evidence.

## Raw false positives and false negatives

- doc-bridge-default-change FN: `["finding","CHANGED_REFERENCE","","surfaces.cli.bin","docs/spec/config-v1.md"]`. The native documentation uses bin?: string with a default comment. The strict-context matcher deliberately leaves this property signature unresolved: no owned base citation links it to surfaces.cli.bin, despite the extracted default delta. This remains an explicit native limitation.
- history-doc-bridge-4a5fa2f2-createmarkdownpluginv2 FP: `["finding","CHANGED_REFERENCE","","createMarkdownPluginV2","docs/spec/discovery-plugin-v2.md"]`. Unexpected diagnostic in the frozen document scope; cause requires review of raw evidence.
- history-doc-bridge-ab68bd6d-corpus-agent-include FP: `["finding","CHANGED_REFERENCE","","corpus.agent","docs/spec/config-v1.md"]`. Unexpected diagnostic in the frozen document scope; cause requires review of raw evidence.
- history-doc-bridge-ab68bd6d-corpus-agent-include FN: `["finding","CHANGED_REFERENCE","","corpus.agent.include","docs/spec/config-v1.md"]`. No owned base citation relation for the changed fact; no documentation review candidate can be emitted.
- history-doc-bridge-1695826b-surfaces-mcp-tools FP: `["finding","CHANGED_REFERENCE","","surfaces.mcp","docs/spec/config-v1.md"]`. Unexpected diagnostic in the frozen document scope; cause requires review of raw evidence.
- history-doc-bridge-1695826b-surfaces-mcp-tools FN: `["finding","CHANGED_REFERENCE","","surfaces.mcp.tools","docs/spec/config-v1.md"]`. No owned base citation relation for the changed fact; no documentation review candidate can be emitted.
- history-doc-bridge-9a775a55-reconciliation-scope FP: `["finding","CHANGED_REFERENCE","","surfaces.mcp","docs/spec/config-v1.md"]`. Unexpected diagnostic in the frozen document scope; cause requires review of raw evidence.
- history-chat-5e47de83-createaskadapter FP: `["finding","CHANGED_REFERENCE","","createAskAdapter","packages/chat/README.md"]`. Unexpected diagnostic in the frozen document scope; cause requires review of raw evidence.

## Limits and maintenance

V1 case bytes are unchanged. V2 adds workspace membership, schema-owner anchors, secondary command-owner flag gold and separate raw expectations for policy-excluded documents. Acquisition and measurement failures remain visible; no engine tuning was performed.

Confirmed historical cases: 20. Reviewed 149/115/77 first-parent commits at the three frozen pins. Twenty selected assertion cases span nine real transitions; twelve negative assertions share one package-retirement transition and README. Two positive assertions confirm stale defaults/tool vocabulary; no delayed repair is claimed. This purposive, correlated sample is not a repository-wide prevalence or independent-commit estimate.
Historical positives and correctly updated negatives are scored separately from authored and native mutations; purposive sampling does not establish historical prevalence.

Native mutations, authored workspace fixtures and real historical transitions are separate origins. Review candidates are not confirmed semantic divergences. Scope is explicitly bounded by fact tokens and document paths; all findings within each selected document are scored. Raw gold includes policy-excluded/historical/version-pinned citations. No upstream code is installed or executed. No engine changes are included.

Raw policy-excluded findings have explicit gold and are not mislabeled as engine false positives. Every remaining mismatch above is a measurement limit or follow-up; no engine change is included.

No engine tuning was performed. Unavailable or invalid cases are excluded from score denominators, remain visible, and prevent a complete-corpus measurement claim. Scores below target are benchmark failures, not execution failures or release-readiness evidence.

## Reviewed discrepancies and follow-up boundary

These explanations apply to both default and raw rows above. Gold remains
independent source/document inspection; review candidates are not confirmed
semantic divergences. Negative labels refer to the selected changed fact, not a
claim that every assertion elsewhere in the repository is correct.

- `doc-bridge-default-change`, `surfaces.cli.bin` FN: the fact/default change is
  extracted, but `bin?: string` with a default comment is a type signature, not
  an anchored configuration example. There is no owned base key citation. This
  unchanged v1 native limitation remains a precise-documentation coverage gap.
- `history-doc-bridge-4a5fa2f2-createmarkdownpluginv2`, `createMarkdownPluginV2`
  FP: the new adapter parameter is optional and defaulted. The specification was
  updated in the same commit and its no-argument use remains valid. The engine
  emits a generic signature review candidate for the surviving symbol citation;
  it does not determine whether the documented call became invalid. This is
  candidate calibration against a compatible-change negative, not a confirmed
  false divergence finding.
- `history-doc-bridge-ab68bd6d-corpus-agent-include`, `corpus.agent` FP and
  `corpus.agent.include` FN: the ancestor object's value changes when the child
  default changes, producing a coarse candidate at `corpus.agent` references.
  The stale precise include-default claim is a type-property/comment declaration
  and has no owned leaf citation. Exact token/path scoring cannot substitute the
  ancestor for that missing leaf. Independent full-commit review also confirmed
  the added `playbook` preset and `pattern-files` routing values were absent from
  the unchanged exhaustive documentation unions; those two leaf candidates are
  true positives, not discarded unrelated diagnostics.
- `history-doc-bridge-1695826b-surfaces-mcp-tools`, `surfaces.mcp` FP and
  `surfaces.mcp.tools` FN: the nested allowed/enabled tool set grows while the
  documented `McpToolId` union remains incomplete. The CLI mapping's broad
  `surfaces.mcp` citation emits an ancestor candidate, but `tools?: McpToolId[]`
  has no owned leaf citation. The broad mapping remains a correct section
  mapping and cannot establish precise tools-key recall.
- `history-doc-bridge-9a775a55-reconciliation-scope`, `surfaces.mcp` FP: the
  selected scope enum and documented union are correctly updated together.
  This larger commit also adds tool IDs, producing an ancestor candidate in the
  same document. Frozen scoring counts every diagnostic in a scoped document;
  this is a collateral candidate outside the selected scope-key assertion, not
  proof that the unrelated tool documentation is correct or that its candidate
  is semantically erroneous. Other fact kinds/tokens are not scored in this case.
- `history-chat-5e47de83-createaskadapter`, `createAskAdapter` FP: the return
  interface extends the prior factory interface, preserving existing adapter
  use. The README is concurrently updated for additive request behavior. The
  engine still routes the signature citation for interpretation, so this
  compatible-change control receives a candidate despite correct documentation.

Follow-up candidates, without engine changes here: precise configuration
citations for documented property signatures/default comments; ancestor versus
leaf review granularity; and compatible or concurrently updated signature
candidate calibration. The sample does not justify automatically loosening
matchers. The two raw/included fixture command-owner flag omissions in frozen v1
are annotation limits, and v1's unowned CLI/unanchored config fixtures are setup
limits; repaired v2 keeps those denominators separate. V2 fixture negatives have
explicit raw gold for excluded/historical/pinned documents.

Historical extraction has 30 expected symbol/signature/config units, including
ten explicitly named removed entrypoint re-exports verified in the prior public
source. Those re-export facts are not engine false positives. Twelve retirement
cases share one transition and deleted README; their successful no-finding
controls are correlated. Twenty cases span nine transitions, not twenty
independent change commits. No delayed repair case was confirmed.

## Frozen v1 comparison on the same engine

Both suites use the engine revision, bundle and harness hashes above. V1 remains
53 frozen cases; v2 retains its 14 native and 39 authored case identities and
adds 20 historical assertion cases. Fixture inputs and annotations change in v2,
so the fixture improvement is not an engine improvement.

| Suite / origin / mode | Finding TP | FP | FN | Precision | Coverage |
| --- | ---: | ---: | ---: | ---: | ---: |
| v1 / native / default | 14 | 0 | 1 | 100.00% | 93.33% |
| v1 / native / raw | 14 | 0 | 1 | 100.00% | 93.33% |
| v1 / fixture-backed / default | 13 | 2 | 8 | 86.67% | 61.90% |
| v1 / fixture-backed / raw | 13 | 14 | 8 | 48.15% | 61.90% |
| v1 / historical / default | 0 | 0 | 0 | n/a | n/a |
| v1 / historical / raw | 0 | 0 | 0 | n/a | n/a |
| v2 / native / default | 14 | 0 | 1 | 100.00% | 93.33% |
| v2 / native / raw | 14 | 0 | 1 | 100.00% | 93.33% |
| v2 / fixture-backed / default | 24 | 0 | 0 | 100.00% | 100.00% |
| v2 / fixture-backed / raw | 36 | 0 | 0 | 100.00% | 100.00% |
| v2 / historical / default | 2 | 5 | 2 | 28.57% | 50.00% |
| v2 / historical / raw | 2 | 5 | 2 | 28.57% | 50.00% |

### V1 discrepancies retained for comparison

The frozen [v1 results](layer1-results-v1.md) remain published and unchanged.
The following complete discrepancy lists come from the fresh v1 comparison run
on this engine; v1 keeps its single gold for default and raw modes. Raw policy
exclusions therefore still count as frozen annotation FPs.

#### V1 default false positives and false negatives

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

#### V1 raw false positives and false negatives

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

## Reproducibility evidence

Two complete runs per suite measured every case with zero unavailable/invalid
states and exited 0. Both raw JSON and runner-rendered Markdown are byte-identical.
These hashes bind the generated outputs; the reviewed narrative and comparison
appendices in this publication are maintained separately.

| Suite / artifact | Run A SHA-256 | Run B SHA-256 |
| --- | --- | --- |
| v1 / json | `ef15a6c5663e6aa02f8cf65e78957dfeff0b5615b20bcf0fc6b68b80af36162e` | `ef15a6c5663e6aa02f8cf65e78957dfeff0b5615b20bcf0fc6b68b80af36162e` |
| v1 / md | `ed89a3252605bf25280b707e9fba1f9cfb01ea7513ceb57ae1f666f578668d68` | `ed89a3252605bf25280b707e9fba1f9cfb01ea7513ceb57ae1f666f578668d68` |
| v2 / json | `5cb2e9b8cc95e1f90ed940168a7481f0c60ace732da5740f2d210cf52156af52` | `5cb2e9b8cc95e1f90ed940168a7481f0c60ace732da5740f2d210cf52156af52` |
| v2 / md | `8aaa5ae6fab665d0fdb0e6a58be05d78c95c278ae3aa3f97d062d791284b12c6` | `8aaa5ae6fab665d0fdb0e6a58be05d78c95c278ae3aa3f97d062d791284b12c6` |
