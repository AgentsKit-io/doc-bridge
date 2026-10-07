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
have no synthetic diff `not-analyzed` entry; unsupported kinds retain one.

Rename detection remains `not-analyzed`: no adapter rename-proof contract is
available in this producer, and neither value equality nor similar paths proves a
rename. Moved identities appear as removal and addition. Release state remains
`unreleased`; mapping package facts does not implement release eligibility or
version routing. Version comparison and caller-event release mapping belong to
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
Policy routing, region remediation, release eligibility and acceptance are later
contracts, not guarantees of this delta flow.

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
Verified head inline-code tokens outside generated regions establish current
citations. Competing head owners of the same kind/name produce
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
