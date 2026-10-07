---
title: Deterministic change sets
description: Compare revision snapshots with historical citation evidence and explicit extraction coverage.
owner: maintainers
lifecycle: active
sourceOfTruth: src/diff/change-set.ts
validationPath: pnpm vitest run tests/change-set.test.ts tests/render.test.ts
---

# Deterministic change sets

`diffSnapshots(base, head, { headRoot?, branch? })` compares two discovery
snapshots from the same project identity. Differing project identities fail
with an actionable error. The snapshots retain their own provenance and graph;
historical dangling references are never inserted into the head graph.

## Extraction and coverage

File-backed module, document and package entities are compared by stable ID and
content hash. Documents use change kind `doc-path`. Export name sets are compared
per module; added/removed exports use distinct symbol identities with `ownerId`.
Retained exports are not marked changed solely because another export or the
module body changed. Their owning module change still contributes review impact.
Legacy exports retain module file evidence. The built-in signature component
adds bounded declaration evidence and normalized syntactic value hashes; see
[signature facts v1](signature-facts-v1.md).

Codec-backed surface facts (`symbol`, `cli-command`, `cli-flag`, `config-key`,
`signature`) are compared by stable owner/name ID and adapter-provided value hash.
Each before/after identity retains `valueHash` and bounded original file evidence.
Package facts are compared by the canonical hash of purl, version and dependencies;
unchanged package values do not become changes solely because manifest bytes changed.
The head package mappings populate `packages`, sorted canonically. The legacy
file/export path remains unchanged when the built-in plugin emits no codec facts.

Extraction completeness is scoped to the capability (`symbols`, `cli-commands`,
`cli-flags`, `config-keys`, `signatures`, or `manifest`) and its extracting analyzer.
Base coverage evidence identifies relevant extractors by fact source path; absent
such attribution, all base analyzers reporting that capability must have complete
head extraction. Another analyzer's complete coverage cannot mask a failed,
partial or unsupported extractor. Repository limit coverage also prevents proof.
Absence under incomplete extraction remains a removal candidate with
`stale-or-unverified` findings, never a proven conflict. Supported complete kinds
and explicitly not-applicable kinds have no synthetic diff coverage entry. Extracted kinds with incomplete capability
or plugin coverage report diff `partial` with the extraction reason; kinds without
extractor evidence report `not-analyzed`.

Rename detection remains `not-analyzed`: no adapter rename-proof contract is
available in this producer, and neither value equality nor similar paths proves a
rename. Moved identities appear as removal and addition. Diff initially emits `unreleased`; a caller may stamp the result using an
adapter mapping and explicit release event. Version comparison and caller-event release mapping belong to
plugins and are exercised by the test-only toy adapter, without network access.

Changes and coverage are sorted by canonical JSON. Findings are sorted by stable
ID, impact by document path. Equal inputs and equal verified head text produce
identical JSON bytes. Revision-only changes preserve ChangeSet `contentHash`;
meaningful coverage and evidence changes invalidate it. Exact revision approval
bindings are not transferable through this semantic hash.

## Documentation impact

Impact considers `links-to`, `mentions`, `mentions-symbol` and `covers` from
**both** snapshots. It lists surviving unchanged documents referencing changed,
added or removed targets in `documentsToReview`, with sorted reasons. Historical
citations remain useful even when the current graph drops unresolved edges.
Changed or added head documents appear separately in `changedDocumentation`,
including documents that dropped all citations. Removed documents cannot require
head review. A changed document is not assumed to have resolved a divergence.
The change digest uses the same delta and impact functions while keeping its
existing file-level rendering contract.

## Findings

A base relation to a removed module/document, a removed export, or a codec fact,
creates a `BROKEN_REFERENCE` candidate. A relation merely failing to resolve,
without a corresponding removal delta, produces no broken-reference finding.
Fuzzy relations cannot prove a broken citation.

With `headRoot`, the engine reads the surviving head document through repository
path containment (including symlinks), verifies its parsed hash against the head
snapshot, and parses citations using the existing Markdown and declaration
analyzers against historical identities. Generated regions stay excluded. A
verified citation that still names the removed target produces status `conflict`.
A citation dropped in the head text produces no finding, even if the document
changed in the same delta. Residual citations still produce findings.

Without a head root, or if the text is unreadable, exceeds the 1 MB verification
limit, has drifted from the head snapshot, or parsing is truncated, removal
candidates have status `stale-or-unverified`. Partial source/workspace discovery
or extraction also prevents `conflict`: snapshot absence alone is not proof of
removal under incomplete coverage. Findings carry base citation locations, verified
head citation locations when available, target removal evidence and surviving
owner evidence when applicable. Export evidence is file-level and explicitly
bounded. Snapshot-only candidates cannot invent head citation locations.

When a cited symbol had exactly one base owner and appears in the head document's
`ambiguousSymbolReferences`, the engine emits `AMBIGUOUS_REFERENCE` with status
`unresolved`, separately from removal findings. It does not arbitrarily select
an owner or propose remediation. Findings reuse existing `DiagnosticSchema` and
are emitted in the envelope's `findings` array, outside ChangeSet identity.
Findings remain unchanged by version routing: consumers read each document
target from entity metadata and call the pure eligibility function. Policy
routing, region remediation and acceptance remain separate contracts.

Finding IDs hash the category, document entity ID, relation kind, cited target ID,
and cited symbol when present, plus the removed target identity recorded in the
delta (symbol, module or document ID) or the sorted, deduplicated candidate module
IDs for ambiguity. Citation line numbers, whole-file content hashes, revisions
and evidence ordering are excluded from identity; evidence retains locations and
hashes for review. Unrelated document edits and citation movement preserve the
ID, while a different removed target or ambiguity candidate set changes it.

## Generic citations and exact reads

Generic citations target the fact's owner in `relation.to`. Symbols use
`metadata.symbol`; other kinds use `metadata.factKind` and `metadata.factName`.
Package citations use kind `package`, the package ID as owner and its purl as name.
The diff resolves kind/name against codec facts rather than language syntax.
Verified head inline-code tokens establish current citations; surviving generated
citations are retained for generator policy routing without changing discovery graphs. Competing head owners of the same kind/name produce
`AMBIGUOUS_REFERENCE`; missing names without a removal delta do not prove breaks.
A changed document is still checked for residual citations. The generic locator
uses fact kind/name in place of the symbol, retaining the existing owner target
and removed identity (or sorted candidate owners). Evidence positions and hashes
remain excluded from finding identity.

Config-key ambiguity candidates reuse Markdown's package/fixture citation
boundary. Adding the same dotted key in another package does not make an
existing citation ambiguous.

`diffSnapshotsWithRead(base, head, read, { signal?, branch? })` is the async
module-level successor for injected callers. The reader must be bound to the head
revision; a mismatch fails before reading. Caller-owned partition authorization
and inventories remain required by Storage I/O v1. Reads are bounded, their
content references checked, and parsed document hashes must equal snapshot
hashes. Unavailable or drifting documents produce unverified candidates. No
local fallback or native file reads occur in this API. `diffSnapshots` retains
its synchronous signature and optional local head verification. Root package
exports and CLI wiring for the injected successor are a separate integration
step.

## Release stamping and eligibility

Root export `stampChangeSet(changeSet, releaseEvent, adapterMapping)` is pure and
performs no I/O. The caller obtains a `Resolution` mapping from its adapter and
supplies `{eventId, tag, revision, evidence}`. The event revision must equal
`headRevision`; a resolved mapping must identify exactly one purl present in
`changeSet.packages`. Unmatched, unsupported or ambiguous mappings return an
unresolved/ambiguous result with evidence and never stamp the delta. Multiple
package mappings require separate caller-scoped deltas; this scalar release
contract does not choose one package from a multi-package release event.

A successful result is `Resolution<ChangeSetV1>`. It has a released state with
purl, version and eventId, retains caller evidence in release-event coverage,
removes the missing-event coverage entry and recomputes semantic identity.
Repeating the same eventId/purl/version is idempotent. Any different stamp on an
already released delta throws `CONFLICTING_RELEASE_STAMP` for review; the input
is never mutated. No branch name, current manifest version or network lookup
constitutes a release event. The JS adapter recognizes `v1.2.3`, `1.2.3` and
`name@1.2.3` (including scoped names); a bare version is ambiguous when multiple
npm package facts are present.

Root export `changeSetEligibility(changeSet, target, adapterComparator?)`
returns `Resolution<boolean>`. The comparator is an object with the existing
adapter `satisfiesRange(purl, version, versRange)` hook. The core never parses or
compares ecosystem versions. Unresolved targets stay unresolved; a missing
comparator for a resolved range returns unsupported rather than eligibility.
The caller selects the adapter for the target's ecosystem.

| Target | Unreleased delta | Released delta |
| --- | --- | --- |
| latest-released (cross-package consumer default) | false | true |
| default-branch or workspace range | true for matching package | false |
| resolved range | false | adapter comparison for matching stamped purl |
| unresolved | unresolved | unresolved |

Default-branch and workspace targets track local sources, including numeric
workspace bounds. They already receive the unreleased delta, so its released
stamp is ineligible for those targets; stable finding identity also supports
consumer deduplication.

For example, `vers:npm/0.4.1` excludes release `0.5.0`, while
`vers:npm/>=0.4.1|<0.5.0-0` includes `0.4.2`. The toy adapter demonstrates numeric
`2 < 10` through the same API without semver in core. Latest-released means
follow caller-supplied released deltas; the engine does not fetch a release
catalog or infer which supplied event is newest.

Document `metadata.targets` holds at most 32 independent bounded target records
(see [Markdown targets](markdown-analyzer-v1.md#document-package-targets)).
Eligibility is evaluated per target; consumers retain independent outcomes for
multiple purls. Version eligibility preserves finding identities and retains all
deterministic evidence in the policy sidecar; excluded/pending findings leave the
default main list. Version eligibility never approves remediation. This contract implements the version-routing decisions in
[ADR 0010](../adr/0010-versioned-change-set-and-semantic-identity.md).

## Removal advisory quality

A removed export also represented as a signature produces only the symbol
finding, preserving its existing identity projection. Extraction completeness
is checked for the cited kind; unrelated partial signature coverage cannot
downgrade a proven symbol removal. Same-kind incomplete extraction and unverified
snapshot-only head citations remain `stale-or-unverified`. Identical evidence
entries are deduplicated while base and head contexts remain distinct.

## Changed references and default policy

A citation of a changed signature, configuration-key value, CLI flag value or
symbol with a changed signature produces `CHANGED_REFERENCE`. Its status is
always `stale-or-unverified`: a changed implementation value does not prove
that prose contradicts it. IDs retain the assertion/target projection and add
the before/after value-hash pair; citation movement, file hashes and revisions
do not change identity. Base/head target evidence contexts expose those hashes,
which are also structured in the corresponding ChangeSet identities. Current
codecs expose hashes only, so summaries are emitted only when a codec actually
provides them. Changed references require review/Layer 2, never automatic edits.

The diff envelope retains `findings` as KnowledgeDiagnostic objects and adds
`policy: {enabled, findings, counts}`. The sidecar retains full FindingV1 records
for every deterministic diagnostic, preserving its ID. Counts include each
routing status and `generator` (a subset of excluded findings). Policy is on
by default: historical/archived, ADR and CHANGELOG references are excluded;
nearby migration context routes to Layer 2; generated citations are excluded
and name their generator; explicit/consumer version targets can be pending.
Excluded and pending findings leave the main list, with full details in policy.
Policy never changes epistemic status. `policy: false` or CLI `--no-policy`
restores the raw main list; changed references still require interpretation.

Same-repository documentation without an explicit frontmatter target or resolved
dependency target on another package describes the code at the analyzed revision, so
routing treats it as branch-tracking and includes unreleased deltas. Existing
implicit latest-released metadata is retained for payload compatibility; it
does not make same-repository findings pending. Explicit targets and resolved
dependency targets on other packages retain adapter-owned version eligibility.
Unreadable head context is explicit partial policy coverage; snapshot metadata
can still establish historical classification and version targets.

## Verified fenced citations

Generic removal, ambiguity and changed-reference verification reads both inline
code tokens and the Markdown analyzer's bounded, language-filtered fence tokens
from verified head document bytes. Names must match exactly; the same owner and
completeness rules apply. A changed signature/value remains review-required
uncertainty. Correcting the head document to remove the old citation suppresses
that reference finding. Head citations moved into generated regions remain
visible to finding policy and are excluded with their generator; discovery still
skips generated regions. These changes add no snapshot/index/handoff fields.
