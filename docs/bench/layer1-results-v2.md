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

Base revision (working-tree bundle below): `150eccb473c785bab802735761d79a49428af2bc`. Engine bundle SHA-256: `0349d3e286b7d8da974938bd734b0fe67dc7e3b2ec8493cf138244b132c6df8f`.
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
| history-doc-bridge-4a5fa2f2-createmarkdownpluginv2 | historical | measured | 1 / 1 / 0 | 1 / 1 / 0 |
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
| history-chat-5e47de83-createaskadapter | historical | measured | 1 / 0 / 0 | 1 / 0 / 0 |
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

- history-doc-bridge-4a5fa2f2-createmarkdownpluginv2 FP: `["finding","CHANGED_REFERENCE","","createMarkdownPluginV2","docs/spec/discovery-plugin-v2.md"]`. Unexpected diagnostic in the frozen document scope; cause requires review of raw evidence.
- history-doc-bridge-9a775a55-reconciliation-scope FP: `["finding","CHANGED_REFERENCE","","reconciliation.scope","docs/spec/config-v1.md"]`. Unexpected diagnostic in the frozen document scope; cause requires review of raw evidence.
- history-doc-bridge-9a775a55-reconciliation-scope FP: `["finding","CHANGED_REFERENCE","","surfaces.mcp.tools","docs/spec/config-v1.md"]`. Unexpected diagnostic in the frozen document scope; cause requires review of raw evidence.

## Raw false positives and false negatives

- history-doc-bridge-4a5fa2f2-createmarkdownpluginv2 FP: `["finding","CHANGED_REFERENCE","","createMarkdownPluginV2","docs/spec/discovery-plugin-v2.md"]`. Unexpected diagnostic in the frozen document scope; cause requires review of raw evidence.
- history-doc-bridge-9a775a55-reconciliation-scope FP: `["finding","CHANGED_REFERENCE","","reconciliation.scope","docs/spec/config-v1.md"]`. Unexpected diagnostic in the frozen document scope; cause requires review of raw evidence.
- history-doc-bridge-9a775a55-reconciliation-scope FP: `["finding","CHANGED_REFERENCE","","surfaces.mcp.tools","docs/spec/config-v1.md"]`. Unexpected diagnostic in the frozen document scope; cause requires review of raw evidence.

## Limits and maintenance

V1 case bytes are unchanged. V2 adds workspace membership, schema-owner anchors, secondary command-owner flag gold and separate raw expectations for policy-excluded documents. Acquisition and measurement failures remain visible; the recorded engine bundle measures citation attribution and region-update behavior without changing existing gold.

Confirmed historical cases: 20. Reviewed 149/115/77 first-parent commits at the three frozen pins. Twenty selected assertion cases span nine real transitions; twelve negative assertions share one package-retirement transition and README. Two positive assertions confirm stale defaults/tool vocabulary; no delayed repair is claimed. This purposive, correlated sample is not a repository-wide prevalence or independent-commit estimate.
Historical positives and correctly updated negatives are scored separately from authored and native mutations; purposive sampling does not establish historical prevalence.

Native mutations, authored workspace fixtures and real historical transitions are separate origins. Review candidates are not confirmed semantic divergences. Scope is explicitly bounded by fact tokens and document paths; all findings within each selected document are scored. Raw gold includes policy-excluded/historical/version-pinned citations. No upstream code is installed or executed. Existing corpus gold is retained; this run measures the recorded engine bundle.

Raw policy-excluded findings have explicit gold and are not mislabeled as engine false positives. Every remaining mismatch above requires the recorded evidence and cause; updated citation regions remain review candidates, never confirmed corrections.

Unavailable or invalid cases are excluded from score denominators, remain visible, and prevent a complete-corpus measurement claim. Scores below target are benchmark failures, not execution failures or release-readiness evidence.

## Compatibility review

The factory returning a directly extending imported interface now suppresses its
changed-reference candidate with evidence labeled `heritage proof (assumes head
compiles)`. Its base is external; this is a narrow declaration-only conditional
proof, not validation of external members or the historical head build. Other
external shapes remain unproven.

The historical sample still has three changed-reference FPs and no FNs:

- The optional/defaulted adapter-list addition in `createMarkdownPluginV2` has an
  unchanged return whose imported dependency closure contains unsupported external
  types/type queries. Modern snapshot resolution retains the candidate conservatively.
- `reconciliation.scope` is updated in the same change; the engine records the
  changed document region but does not semantically reconcile it.
- `surfaces.mcp.tools` has a stale union in that same document outside the updated
  region. The frozen negative assertion covers reconciliation rather than this
  concurrent tools candidate, which remains an FP in that denominator.

The target factory FP is removed, while the conservative adapter-list FP is added;
aggregate historical precision is unchanged. Frozen case/gold inputs are not
rewritten. These purposive samples do not establish release readiness or historical
prevalence. Dependency-only changes with unchanged callable hashes are not checked.

## Measured cost

Fixed source corpora, three serial full discoveries/index builds and nine changed-callable diffs per engine. Values below are medians; diff includes the real full snapshot/document flow, not an isolated checker timer. The mutation adds an optional boolean parameter to a real callable. No checker runs during indexing. Timings include local load noise.

| Corpus | Full index bytes before / after | Snapshot bytes before / after | Index ms before / after | Diff ms before / after | Retained context bytes / maximum module |
| --- | ---: | ---: | ---: | ---: | ---: |
| doc-bridge | 1,536,551 / 1,536,551 | 4,607,803 / 4,907,255 | 3514.4 / 3675.2 | 3598.6 / 3653.4 | 284,696 / 31,772 |
| AgentsKit monorepo | 5,629,619 / 5,629,619 | 15,957,388 / 16,622,505 | 12613.8 / 14388.9 | 4089.7 / 4493.2 | 601,772 / 5,489 |

Corpus revisions: doc-bridge `cfa03a40db1c59b1e068140e21eb90ca0909ca57`, AgentsKit monorepo `7e9f42fb6582b93c0f3bc239f9eb3f5dbba14e9f`.

Full monorepo indexing succeeds in both engines. Index sizes are unchanged; retained syntax increases snapshot size. All three snapshots per corpus have identical semantic hashes. The monorepo mutation remains unproven under modern context checking because its imported closure is unsupported; this cost sample does not establish compatibility coverage across the whole repository.

## Fresh frozen v1 comparison

The v1 cases, protocol, gold and published results remain unchanged. All 53 cases are measured, with zero unavailable or invalid cases. Every included and raw per-case score matches the prior compatible-signature engine. Case SHA-256: `0264264d3b390b8dc0cbf48b1d721ea336abcf26c51e9dab1bead42543e5ff0f`. The v2 native and fixture scores likewise match that baseline.
