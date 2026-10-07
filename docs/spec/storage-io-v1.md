---
title: Storage I/O v1
description: Exact repository and revision capabilities for bounded local reads and atomic artifact publication.
owner: maintainers
lifecycle: active
sourceOfTruth: src/storage/contract.ts
validationPath: pnpm vitest run tests/storage.test.ts
---

# Storage I/O v1

`RepositoryReadV1` and `ArtifactIOV1` are separate asynchronous capabilities.
Neither grants shell, network, repository-source writes, or arbitrary destinations.
The implementation lives in `src/storage/`; public type exports are additive.
Existing synchronous APIs, `DocBridgeIndexV1` and `AgentHandoffV1` remain unchanged.
Discovery, indexing and query do not use these capabilities yet.

## Partitions and admission

A caller supplies `{ repositoryId, revision }`, with nonempty identifiers bounded
at 256 characters, and a root authorized for that exact partition. Every request
includes the same partition and an `AbortSignal`. Requests and artifact envelopes
with unequal partitions fail before returning bytes. Identity is never inferred
from a directory name, package name, Git HEAD, or the latest stored artifact.
Graph entity and relation IDs are unchanged by partitioning.

`createLocalRepositoryRead` requires a caller-confirmed frozen revision inventory,
a mapping from relative path to `ContentRef`. The adapter copies and freezes it;
reads verify actual bytes against the pinned reference even without `expected`.
Initial inventory capture and revision resolution are caller responsibilities.
An added or removed visible listing entry is a revision mismatch; explicit
reads of missing paths remain missing;
modified content returns mismatch rather than blending revisions. Listing metadata
is an observation, not verified file content: use `read` before citing evidence.
Artifacts and default safety exclusions cannot be source inventory reads.

Paths are relative POSIX identifiers of at most 512 characters. Absolute paths,
empty segments, `.`, `..`, backslashes, colons (including drive paths), and NUL
are denied. Only listing accepts `.` as its root selector. Both internal and
external symlinks are denied for explicit reads/stats and skipped during listing.
The local adapter checks ancestor containment, opens with no-follow, verifies
regular-file descriptors and inode/device identity, bounds allocation before
reading, rechecks metadata/containment after reading, and closes descriptors.
Caller-selected root aliases are canonicalized once; replacing that root with an
alias later is denied. This is a local capability, not an OS sandbox against a
hostile process with permission to mutate its root concurrently.

## Limits, results and cancellation

`StorageLimits` requires positive `maxFiles`, `maxBytes`, `maxFileBytes`,
`maxTimeMs`, and `maxMemoryMb`. `intersectStorageLimits` freezes the per-field
minimum across caller/repository/plugin limits. A capability has one cumulative
ledger for its lifetime: actual traversal entries and descriptor/stat operations,
read bytes, listed file sizes, elapsed time and current process heap memory.
Repeated operations consume the same budget; create a new capability for a new
run. Setup of caller-owned visibility policy is outside this operation ledger.
Memory/time enforcement is cooperative at asynchronous checkpoints, not process
isolation or a per-plugin accounting guarantee. Memory uses heap MiB, not RSS.

Listing walks in sorted order, applies the existing Git/nested-ignore policy and
`DEFAULT_SAFETY_EXCLUDES`, then request include/exclude patterns. Traversal entries
consume `maxFiles` before filtering, so excluded names cannot evade that limit.
Pruned safety/ignore directories consume an entry but are never descended into.
Directory names are gathered through bounded iteration before sorting; if a
directory exceeds the remaining entry budget, it contributes no entries (rather
than an enumeration-order-dependent subset). Time, memory, entry or byte
exhaustion returns an explicit sorted partial list:
`{ entries, complete: false, limitation, visibilityPolicyHash }`. The policy hash
binds policy mode, default excludes, and observed visibility decisions; it does
not claim completeness when the listing is partial. Other failures are never an
empty successful list. A request filter controls selection, not authorization.

`read` returns raw `Uint8Array` bytes and a `ContentRef` using the unchanged
`fileContentHash` / `sha256-normalized-v1` algorithm on UTF-8 text. It does not
invent a new BOM/newline normalization. Both the pinned reference and an optional
`expected` reference must match. Raw artifact bytes use a separate SHA-256 hash.
`stat` verifies file bytes, rather than claiming that filesystem metadata proves
revision identity. Directory stats do not provide content evidence.

All results are `{ status: 'ok', value }` or `{ status, code }`. Failure statuses
are `missing`, `mismatch`, `denied`, `limit`, `cancelled`, and `error`; codes come
from `StorageFailureCodeSchema`. Native exception messages and backend paths are
never returned. Malformed requests are denied with `INVALID_CONTRACT`.
Aborted requests return `ABORTED`; cancellation is checked before subsequent
operations and between bounded read chunks/traversal entries.

## Artifact envelopes and atomic replacement

Artifact kinds are snapshot, index, overlay, cache, approval, workflow and
proposal. Names use a bounded alphanumeric/dot/dash/underscore identifier.
`ArtifactEnvelope` includes I/O version, partition, key, payload schema/version,
content hash algorithm/hash, payload encoding, raw payload and byte hash.
The caller still validates its declared payload schema before consumption; storage
validates envelope structure, key/partition and payload integrity. Supported
wrapper hash algorithms are `sha256-normalized-v1` (canonical JSON value or UTF-8
text) and `sha256-raw-v1` (payload bytes). Payload-internal index/snapshot semantic
hashes and schema algorithms are preserved independently.

JSON payloads use `payloadEncoding: 'json'`, canonical JSON bytes in memory and an
embedded readable JSON value on disk. Non-JSON bytes use `base64`. Encoding is
explicit; binary payloads never silently become JSON. `createArtifactEnvelope`
canonicalizes JSON and computes both hashes. The canonical wire envelope omits
`byteHash` to avoid self-reference; returned `byteHash` is SHA-256 of its exact
serialized bytes. `parseArtifactEnvelope` checks canonical encoding and content
integrity and reconstructs canonical JSON payload bytes. Unknown fields fail.
No envelope is inserted into a legacy strict index or handoff payload.

`createLocalArtifactIO` stores each partition below a hash of the canonical
partition tuple, then kind/name. It never reads unpartitioned legacy files.
`replaceAtomic` acquires an exclusive filesystem lock per artifact, compares the
current verified envelope's exact byte hash, writes a same-directory temporary
file, closes it, checks cancellation, and atomically renames it. A `null`
precondition means create-if-absent. Conflicts (including a concurrent lock owner)
return `CAS_CONFLICT`; at most one publisher can win a stale precondition.
No implicit retry overwrites a newer artifact.

Handled errors/cancellation remove task-owned temporary files and release locks.
If filesystem permissions prevent cleanup, the operation returns a safe error and
the caller must clean the abandoned files after restoring access.
Fault injection before rename proves that truncated temporary writes leave the
old complete artifact visible. Successful rename exposes the new complete file.
This adapter promises atomic visibility, not power-loss durability: it does not
fsync files/directories. Process death can leave a lock/temp file; fail closed
until the caller verifies the writer exited and removes its abandoned files.
There is no automatic stale-lock eviction. Artifact listing is bounded; exceeding
`maxItems` returns a limit failure rather than an apparently complete subset.

## Validation and performance

`tests/storage.test.ts` uses real temporary directories, files and symlinks for
partition isolation, pinned reads, deterministic partial listing, containment,
cancellation, byte/time/memory limits, wire integrity and concurrent atomic CAS.
Native Windows/junction behavior requires a Windows run and is not established
by POSIX-host drive/backslash string checks.

After building, run `node scripts/bench-index-io.mjs` and
`node scripts/bench-index-io.mjs tests/fixtures/sample-project`. The script copies
Git-visible inputs outside the worktree and measures five fresh-process cold and
warm index invocations, reporting medians and peak RSS without committing
machine-specific numbers. Cold removes artifacts; warm retains the previous
index. This CLI currently does not accept a prior discovery snapshot; the script
does not claim incremental-discovery or OS page-cache warmth. Physical I/O counts
are not instrumented. Integrated adapter performance requires the later consumer
migration; capturing this baseline alone does not prove its performance budget.

## Index and artifact integration

The index builder's `buildStoredDocBridgeIndex` accepts `RepositoryReadV1`,
`ArtifactIOV1`, an explicit partition/signal, effective configuration and an
already captured snapshot. It hydrates verified text once for the existing
corpus, workspace/Nx routing, human adapters, declarations and freshness policy.
There is no native-file or unpartitioned-index fallback. The caller must bind the
snapshot and frozen reader inventory to the requested partition; project display
names are not authorization identities.

`readJsonArtifact` and `writeJsonArtifact` check capability/envelope partition,
key, schema/version, encoding and integrity, delegating atomic CAS to the store.
They support snapshot/index/overlay/cache/approval/workflow/proposal kinds.
Typed snapshot, index, overlay, cache, approval and workflow persistence functions
reuse existing payload schemas and hashes. Envelopes are persistence metadata;
legacy index and handoff payloads have no extra fields. Missing artifacts and
store failures are distinct results. Approval storage errors throw through the
existing approval-store contract; they never become an absent approval.

Workflow manifest revisions must match their partition. Workflow step artifacts
are create-only, keyed by stage/input hash, and checked against the requested
step's input/output hashes. Local workflow execution and process locking remain
in the synchronous compatibility flow; this is not an injected workflow runner.

The synchronous local APIs explicitly select local compatibility by their
root/config arguments. They retain unpartitioned publication and the committed
legacy drift diagnostic before regeneration. Injected APIs never import a legacy
artifact implicitly. New public entrypoint/CLI orchestration wiring is separate
from the module-level integration.

The local repository reader optionally accepts explicit `excludes`; the effective
list is included in `visibilityPolicyHash`. Omission keeps the strict safety
excludes. Only an explicitly authorized local compatibility caller should pass
the legacy curated/human walk excludes (`.git`, `node_modules`, `dist`, `coverage`,
`.doc-bridge`). The strict injected default also excludes build/output directories
(`build`, `.next`, `out`, `.turbo`, `.svelte-kit`, `.mcpb-build`, `.mcpb-output`)
and secret-shaped paths (`.env*`, names containing `secret`/`credential`, PEM/key
files). Git/nested ignore behavior is preserved in either policy. Policy differences
are not payload parity evidence; compare builders only under matching visibility.

File `ContentRef` and Markdown evidence are distinct identities: the file hash
preserves BOM bytes under the existing normalized-file algorithm, while
`markdownContentHash` removes a leading BOM. Body reads pass the listing/inventory
file reference as `read(expected)` and independently verify returned raw text
against the snapshot's Markdown evidence. Original raw text reaches corpus/human
parsers unchanged. Neither algorithm is replaced, and either mismatch reports
an exact partition/path availability limitation without substitute bytes.

An optional `SnapshotReadBinding` sidecar carries `{partition, snapshotHash,
visibilityPolicyHash}` from the trusted caller's verified discovery capture.
When it matches the requested partition, snapshot revision/hash and current
complete listing policy, source-only input fingerprints can reuse frozen
inventory references whose hashes match all corresponding snapshot code evidence.
Unbound, absent or conflicting evidence falls back to physical verification.
Documents, manifests, configuration and configured sidebars are still physically
read with expected file references; freshness loading also verifies every input.
A configured byte cutoff disables this optimization because a ContentRef does
not record the captured file size. This avoids mixing live size metadata into a
bounded prior capture. Missing/invalid receipts retain full-verification behavior.
Verified file hashes are reused for freshness and non-BOM Markdown evidence;
BOM documents retain their separate Markdown hash calculation.

## Caller execution metadata

Partitioned artifact APIs accept an optional caller `profile` on `StorageRequest`.
The [service profile](service-profile-v1.md) propagates the immutable ceiling
through storage callbacks. This field is stripped before strict storage wire
requests; envelope and index schemas remain unchanged. Repository configuration
never supplies this metadata.

## Operation observation

Injected discovery, partitioned index building and injected diff accept caller
`OperationOptions`: `signal`, `limits` (a partial `StorageLimits` ceiling),
`maxDurationMs` (positive integer milliseconds), `onProgress` and opt-in
`collectMetrics: true`. Limits intersect
with the reader ceiling; they cannot broaden authority. Discovery's existing
`maxFiles`/`maxBytes` options also tighten the run ledger. Each operation has a
fresh cumulative ledger, in addition to the capability's lifetime ledger.
Listed entries, listed sizes, stat/read operations and acquired bytes consume
that ledger. A bounded prior source receipt is not reused when the caller sets a
byte cutoff. Time/heap limits include synchronous computation and are checked
at stages and existing host checkpoints; they are cooperative, not preemptive.

Progress events contain `stage`, nonnegative `processed`, optional `total` and
`elapsedMs`. Acquisition reports the listing total when known; reads report the
first file and every 64th file through 8192, plus stage boundaries, capped at 256 events per operation. Counts and
stage order are deterministic for the same input and options; elapsed time is
observational. Events carry no paths or wall-clock timestamps. Callbacks must
not throw or mutate inputs. Callback presence changes neither serialized
artifacts nor their hashes. Callback execution time consumes the duration budget.

`RunMetrics` is returned beside artifacts only with `collectMetrics: true`: `durationMs`, duration by stage in
`stages`, `filesRead`, `bytesRead`, and `peakHeapBytes` sampled at progress/stage
boundaries and completion. Read counts describe successful capability reads,
including bytes rejected by the operation budget, rather than physical system
calls. They exclude capability-internal stat verification. Metrics are not
persisted in snapshots, indexes or change sets and do not affect semantic hashes.

Stopped discovery returns `status: partial|cancelled`, optional metrics, and a valid
snapshot whose `partial` coverage names `limits:<stage>` and the storage failure
code. If acquisition/analysis cannot finish, the conservative snapshot contains
no asserted entities or relations. Partial listings retain existing scan limit
coverage. Stopped diff retains the snapshot-derived delta, adds the same stage
coverage, and downgrades unverified conflict findings. An injected diff adds `partial|cancelled` status only when stopped, separately
from the change set's capability coverage. Completed discovery/diff retain their
legacy result shape; no success status or metrics field is added by default.
Stopped index building returns the storage failure with optional metrics and stage
coverage; it never publishes an index after a limit/cancellation. Cancellation
is passed through to atomic replacement, whose adapter must check it before
rename and clean owned temporary files. Strict index/handoff schemas are unchanged.
