---
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
The current analyzer provides module file evidence for exports, without signature
or declaration-region extraction.

`cli-command`, `cli-flag`, `config-key` and `signature` extraction is explicitly
`not-analyzed`. Rename detection is also `not-analyzed`: matching hashes or
similar paths do not prove renames. Moved files therefore appear as removal and
addition. Package IDs and manifest changes are observed, but ecosystem-neutral
purl/version mappings and version routing remain `not-analyzed`; the `packages`
mapping array stays empty. Release state is always `unreleased`. No network,
release event inference, version comparison or remediation runs here.

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

A base relation to a removed module/document, or a removed export of its module,
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
Policy routing, region remediation, release eligibility and acceptance are later
contracts, not guarantees of this delta flow.

Finding IDs hash the category, document entity ID, relation kind, cited target ID,
and cited symbol when present, plus the removed target identity recorded in the
delta (symbol, module or document ID) or the sorted, deduplicated candidate module
IDs for ambiguity. Citation line numbers, whole-file content hashes, revisions
and evidence ordering are excluded from identity; evidence retains locations and
hashes for review. Unrelated document edits and citation movement preserve the
ID, while a different removed target or ambiguity candidate set changes it.
