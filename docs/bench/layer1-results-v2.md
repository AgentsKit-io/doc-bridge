---
owner: maintainers
lifecycle: active
sourceOfTruth: docs/bench/layer1-cases-v2.json
validationPath: node scripts/bench-layer1.mjs --self-check
---

# Layer-1 benchmark results v2

Native included documentation findings: precision **100.00%**, coverage **100.00%** (TP 15, FP 0, FN 0). Targets: native precision ≥95% met; native coverage ≥90% met.

The headline uses shipped default policy routing. Included means proposed or routed-to-L2; excluded and pending-version candidates are reported separately. Review candidates, including CHANGED_REFERENCE (stale-or-unverified, routed-to-L2), are not confirmed divergences.

V2 retains v1 native cases and repairs authored fixture ownership, configuration anchors and raw policy gold. Historical cases compare unmodified public first-parent revisions; their reasoning is recorded in the case file.

Engine revision: `cfa03a40db1c59b1e068140e21eb90ca0909ca57`. Engine bundle SHA-256: `486e7019e15901c095b56f0bd6fa38682566bd9776c5b05da5f6b7afbf18dae6`.
Case SHA-256: `16c390d9122be1b36dc0891213949021d51cc662acfe78e294fa0b44a7e61fc9`.
Harness SHA-256: `06c98e1a2f3bd7c2e3d47f4afa8620bfb23a3ce9336dde653ea0b9d6eaf3a6fa`.

Coverage is recall: TP / (TP + FN). Precision is TP / (TP + FP). Units are distinct (case, channel, kind, operation, token, path); repeated citations in one document count once. Facts measure extraction/change detection separately from documentation findings.

Measured cases: 75; unavailable: 0; invalid: 0.

## Policy dispositions in frozen document scopes

Policy counts use diagnostic identities; scores deduplicate assertion units, so totals can differ.

| Origin | Proposed | Routed to L2 | Excluded | Pending version |
| --- | ---: | ---: | ---: | ---: |
| native | 11 | 4 | 0 | 0 |
| fixture-backed | 21 | 8 | 9 | 3 |
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
| historical: fact/config-key | 3 | 0 | 0 | 100.00% | 100.00% |
| historical: fact/signature | 4 | 0 | 0 | 100.00% | 100.00% |
| historical: fact/symbol | 23 | 0 | 0 | 100.00% | 100.00% |
| historical: finding/CHANGED_REFERENCE | 4 | 3 | 0 | 57.14% | 100.00% |
| historical: finding-overall | 4 | 3 | 0 | 57.14% | 100.00% |
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
| historical: fact/config-key | 3 | 0 | 0 | 100.00% | 100.00% |
| historical: fact/signature | 4 | 0 | 0 | 100.00% | 100.00% |
| historical: fact/symbol | 23 | 0 | 0 | 100.00% | 100.00% |
| historical: finding/CHANGED_REFERENCE | 4 | 3 | 0 | 57.14% | 100.00% |
| historical: finding-overall | 4 | 3 | 0 | 57.14% | 100.00% |
| historical: fact-overall | 30 | 0 | 0 | 100.00% | 100.00% |

## Historical assertion controls

| Label | Cases | Finding TP | FP | FN |
| --- | ---: | ---: | ---: | ---: |
| positive | 2 | 4 | 0 | 0 |
| negative | 18 | 0 | 3 | 0 |

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
| history-doc-bridge-9a775a55-reconciliation-scope | historical | measured | 1 / 2 / 0 | 1 / 2 / 0 |
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

- history-doc-bridge-9a775a55-reconciliation-scope FP: `["finding","CHANGED_REFERENCE","","reconciliation.scope","docs/spec/config-v1.md"]`. Unexpected diagnostic in the frozen document scope; cause requires review of raw evidence.
- history-doc-bridge-9a775a55-reconciliation-scope FP: `["finding","CHANGED_REFERENCE","","surfaces.mcp.tools","docs/spec/config-v1.md"]`. Unexpected diagnostic in the frozen document scope; cause requires review of raw evidence.
- history-chat-5e47de83-createaskadapter FP: `["finding","CHANGED_REFERENCE","","createAskAdapter","packages/chat/README.md"]`. Unexpected diagnostic in the frozen document scope; cause requires review of raw evidence.

## Raw false positives and false negatives

- history-doc-bridge-9a775a55-reconciliation-scope FP: `["finding","CHANGED_REFERENCE","","reconciliation.scope","docs/spec/config-v1.md"]`. Unexpected diagnostic in the frozen document scope; cause requires review of raw evidence.
- history-doc-bridge-9a775a55-reconciliation-scope FP: `["finding","CHANGED_REFERENCE","","surfaces.mcp.tools","docs/spec/config-v1.md"]`. Unexpected diagnostic in the frozen document scope; cause requires review of raw evidence.
- history-chat-5e47de83-createaskadapter FP: `["finding","CHANGED_REFERENCE","","createAskAdapter","packages/chat/README.md"]`. Unexpected diagnostic in the frozen document scope; cause requires review of raw evidence.

## Limits and maintenance

V1 case bytes are unchanged. V2 adds workspace membership, schema-owner anchors, secondary command-owner flag gold and separate raw expectations for policy-excluded documents. Acquisition and measurement failures remain visible; the recorded engine bundle measures citation attribution and region-update behavior without changing existing gold.

Confirmed historical cases: 20. Reviewed 149/115/77 first-parent commits at the three frozen pins. Twenty selected assertion cases span nine real transitions; twelve negative assertions share one package-retirement transition and README. Two positive assertions confirm stale defaults/tool vocabulary; no delayed repair is claimed. This purposive, correlated sample is not a repository-wide prevalence or independent-commit estimate.
Historical positives and correctly updated negatives are scored separately from authored and native mutations; purposive sampling does not establish historical prevalence.

Native mutations, authored workspace fixtures and real historical transitions are separate origins. Review candidates are not confirmed semantic divergences. Scope is explicitly bounded by fact tokens and document paths; all findings within each selected document are scored. Raw gold includes policy-excluded/historical/version-pinned citations. No upstream code is installed or executed. Existing corpus gold is retained; this run measures the recorded engine bundle.

Raw policy-excluded findings have explicit gold and are not mislabeled as engine false positives. Every remaining mismatch above requires the recorded evidence and cause; updated citation regions remain review candidates, never confirmed corrections.

Unavailable or invalid cases are excluded from score denominators, remain visible, and prevent a complete-corpus measurement claim. Scores below target are benchmark failures, not execution failures or release-readiness evidence.

## Compatibility and citation-cap review

Historical CHANGED_REFERENCE precision improves from 37.50% to **57.14%**
(4 TP, 3 FP); coverage improves from 75.00% to **100.00%** (zero FN).
Native included findings improve from 14 TP / 0 FP / 1 FN to 15 TP / 0 FP /
0 FN. Fixture included findings remain 26 TP / 0 FP / 0 FN; fact extraction
scores do not regress. Neither frozen case file nor its gold was modified.

Every remaining historical mismatch is still counted:

- `history-doc-bridge-9a775a55-reconciliation-scope`,
  `reconciliation.scope` FP: the head specification's union at line 424 correctly
  adds `area`, matching the schema. The recovered specific citation detects a
  changed value and marks its region `updated-in-this-change`; region change
  does not prove semantic reconciliation, so this review candidate remains.
- The same case's `surfaces.mcp.tools` FP: the commit independently adds
  `knowledge.search` and `knowledge.lookup` to the schema/defaults. The recovered
  tools citation is at line 656, and the unchanged `McpToolId` union below it
  omits these IDs. The frozen negative case annotates the reconciliation update,
  while scoring all findings in the document and supplies no tools positive
  gold. This concurrent candidate remains an FP in the published denominator;
  the gold is not rewritten or narrowed to remove it.
- `history-chat-5e47de83-createaskadapter`, `createAskAdapter` FP: the return
  changes to a local extending interface, but its base and request context are
  imported. The bounded module-local proof cannot resolve those declarations;
  the checker therefore cannot prove assignability and retains the candidate.
  Its changed README region is separately marked `updated-in-this-change`.

There are no historical FNs. The cap recovers the previously omitted
`surfaces.mcp.tools` positive. The native `surfaces.cli.bin` miss is also
recovered: the old base graph lacks that fact citation after retaining 64 fact
relations, while the new base graph retains the exact owned citation.
Optional/defaulted parameters and purely additive child keys no longer produce
those prior false positives. Unsupported compatibility is conservative coverage,
not proof of a break or semantic divergence. These purposive samples do not
establish release readiness or historical prevalence.

## Measured cost

Measurements use the same fixed source corpora before and after, three serial
runs, medians, and compact JSON byte counts. Timings include normal local noise.
On doc-bridge, full index size remains 1,536,551 bytes; median indexing time is
4.05s before and 3.83s after. Retained callable proofs are bounded to 16 KiB per
fact and no checker runs at index time.

Full monorepo indexing is blocked in both engines by the existing discovery
coverage ceiling (2023 entries against a 1000-entry bound). It is not reported
as a passing index measurement. Separate extraction measures 886 documents:
citations increase 3978 to 3989, bytes 3,274,483 to 3,281,988, and fact-cap
truncated documents decrease one to zero. Retained fact bytes increase
4,440,787 to 5,066,448. Median citation-only time is 7.08s before and 7.81s after;
median discovery time is 8.98s before and 9.34s after. The isolated extraction
measurement bypasses the envelope parser only to observe these costs behind the
known ceiling; it is not schema/gate/conformance evidence. No full-monorepo
index time or size claim is made.

## Fresh frozen v1 comparison

The v1 cases, protocol and published v1 results remain unchanged. The fresh run
executes all 53 cases, with zero unavailable or invalid cases, against the engine
bundle recorded above. Included and raw case scores differ from the baseline
only for `doc-bridge-default-change`: the missing owned `surfaces.cli.bin`
citation is recovered by the higher, specificity-ranked cap (1 TP / 0 FP / 1 FN
becomes 2 TP / 0 FP / 0 FN in each mode).

Every score change versus the published v1 report follows from that one recovery:

| V1 metric (included and raw) | Published | Current |
| --- | --- | --- |
| Native CHANGED_REFERENCE | 3 TP / 0 FP / 1 FN; 100% precision, 75% coverage | 4 TP / 0 FP / 0 FN; 100% precision, 100% coverage |
| Native finding overall | 14 TP / 0 FP / 1 FN; 100% precision, 93.33% coverage | 15 TP / 0 FP / 0 FN; 100% precision, 100% coverage |
| Native routed-to-L2 candidates | 3 | 4 |

Native facts remain 19 TP / 0 FP / 0 FN. Included v1 fixture facts remain
35 TP / 0 FP / 4 FN (100% precision, 89.74% coverage); included fixture findings
remain 13 TP / 2 FP / 8 FN (86.67% precision, 61.90% coverage).
All other per-case/per-kind included and raw scores are unchanged. This preserves
the frozen fixture limits and annotation FPs rather than repairing v1 gold to
improve the score. V1 case SHA-256 remains
`0264264d3b390b8dc0cbf48b1d721ea336abcf26c51e9dab1bead42543e5ff0f`.
