---
title: Discovery plugin contract v2
description: Versioned caller-registered discovery with bounded exact-partition reads and evidence validation.
owner: maintainers
lifecycle: active
sourceOfTruth: src/plugins/contract.ts
validationPath: pnpm vitest run tests/discovery-plugin-v2.test.ts tests/analyzer-plugin.test.ts
---

# Discovery plugin contract v2

V2 is additive alongside [analyzer v1](analyzer-plugin-v1.md); v1 strict field
sets, exports and registry behavior are unchanged. No repository discovery,
indexing, query or diff migration is included. Caller-registered plugins are
trusted in-process code, not dynamically imported repository code or a sandbox.

## Manifest and input

`DiscoveryPluginManifestV2Schema` strictly validates `contractVersion: 2`, bounded
id/version/languages, `knowledgeSchemaVersion: 1`, pipeline major, unique
capabilities, input patterns, unsupported constructs and all five storage limits.
Capabilities are manifest, lockfile, release-map, versions, symbols, cli-commands,
cli-flags, config-keys, signatures and markdown. A registry checks contract/schema/
pipeline compatibility, duplicates and plugin counts before execution.
Version capability requires normalize/compare/range methods; release-map requires
mapRelease. Registry order is sorted by ID, independent of registration order.

`DiscoveryPluginInputV2Schema` accepts only a `RepositoryReadV1`, signal,
configuration, optional prior validated extraction, and resolution entities/
relations. There is no root path, writable store, shell, network or untyped v1
`value`. Caller resolution supplies generic owners, independent of language.
Configuration, resolution and previous extraction are frozen before execution.

The caller must create a capability with the stricter intersection of caller,
repository and plugin limits (`intersectStorageLimits`). A broader supplied
capability is rejected before invoking a plugin, rather than pretending a wrapper
can count traversal entries hidden by another adapter. Configuration size is
bounded before execution. The registry binds cancellation to every forwarded I/O
request, verifies bytes returned by reads, and records their path/hash/line bounds.
The underlying caller-authorized capability is responsible for actual traversal
and operation budgets; the registry also charges cumulative issued read bytes.

## Extraction and evidence

`DiscoveryPluginOutputV2Schema` strictly requires entities, relations, facts,
packages, coverage and diagnostics. Existing knowledge schemas are reused.
The registry bounds total serialized output bytes and total evidence count,
rejects duplicate IDs/owners, dangling relation endpoints and absent fact owners,
and validates each evidence path/contentHash/line bound against an issued read.
Entities with paths must have issued reads. Package IDs may reuse existing package
owners but cannot collide with an entity of another kind. Fact capabilities and
package capabilities must have been declared. Output collections are sorted by
ID and coverage by canonical JSON before return. Coverage is stamped with the
manifest ID/version. Missing capability coverage is explicit `not-analyzed`;
undeclared capabilities receive `UNSUPPORTED_CAPABILITY`, never complete-empty.

Malformed output, failed reads/evidence, thrown plugin exceptions, cancellation
and cooperative timeout produce an empty extraction with safe `not-analyzed`
coverage (`PLUGIN_FAILED` or `PLUGIN_CANCELLED_OR_TIMEOUT`). Raw exception text
is not exposed. Rejection of an incompatible manifest/input occurs before plugin
execution. A timeout returns even for an asynchronously stalled plugin, aborts
its capability, and denies subsequent operations. A non-yielding CPU loop cannot
be stopped in-process; isolate untrusted code in the caller.

## Surface and package codec v1

`SurfaceFact` carries kind, ID, owner ID, name, value hash and bounded evidence.
Kinds are symbol, cli-command, cli-flag, config-key and signature. IDs use the
existing `entityId` helper via `surfaceFactEntityId(kind, ownerId, name)`; no
repository/revision prefix changes the graph identity.

`surfaceFactToEntity` stores the fact as an observed entity whose kind equals the
fact kind, ID/name match the fact, and evidence remains top-level. Metadata is
strictly `{ factCodecVersion: 1, fact: { kind, id, ownerId, name, valueHash } }`.
`surfaceFactFromEntity` rejects malformed/unknown codec metadata and mismatched
identity. This preserves the snapshot v1 shape while allowing persisted facts to
round-trip without side channels. New kinds have intentional semantic significance
when a later plugin emits them; no built-in extraction behavior changes here.

`PackageFact` carries ID, purl, optional version, dependency purls/ranges/locked
versions and manifest/lockfile evidence. Purl syntax has a bounded structural
check; ecosystem-specific validation and vers interpretation belong to adapters.
`packageFactToEntity` attaches `{ factCodecVersion: 1, package: { purl, version?,
dependencies } }` to an existing package entity, keeping its ID/name/evidence and
unrelated metadata. It creates a package entity only when none is supplied.
`packageFactFromEntity` strictly validates the codec namespace and reconstructs
the fact using entity ID/evidence. Existing package evidence must include the
manifest/lockfile evidence the caller intends to persist; attachment does not
silently replace it. No duplicate package entity is necessary.

## Ecosystem operations

Optional `normalizeVersion`, `compareVersions`, `satisfiesRange` and `mapRelease`
remain adapter-owned. `Resolution<T>` distinguishes resolved values with evidence
from unresolved, ambiguous or unsupported outcomes with bounded reasons/evidence.
`resolutionSchema` validates each selected value type; `ReleaseEventSchema`
validates caller-provided event ID/tag/revision/evidence. The registry does not
invoke, validate or stamp releases implicitly: the calling orchestrator must
validate these operation results and their issued evidence before consumption.
No universal version comparator, network tag discovery, released ChangeSet schema
extension or generic diff implementation is introduced here.

`tests/discovery-plugin-v2.test.ts` exercises strict v1/v2 roundtrips, rejection
before invocation, real-file evidence and codecs, ownership/endpoints/duplicates,
output bounds, safe failure, cancellation and late reads after timeout. The full
non-JS persisted snapshot → diff → ChangeSet acceptance flow belongs to the later
orchestrator/diff migration and is not proven by these contract tests.

## Built-in plugins and scan orchestration

JS/TS (`createJsTsPluginV2`, effective analyzer version 1.3.5) and Markdown
(`createMarkdownPluginV2`, the existing Markdown analyzer version) are caller-
registered v2 plugins. Their syntax extraction is shared with the synchronous
`discoverRepository` compatibility facade. JS/TS declares manifests and symbols;
Markdown declares Markdown. Neither emits additional surface-fact entities by
default. Syntax algorithms, IDs, evidence codecs, coverage attribution and
incremental reuse ordering retain their established versions.

`discoverRepositoryWithRead(read, options)` preloads the exact `RepositoryReadV1`
partition into a bounded scan-local inventory. Every TypeScript host operation
(`fileExists`, `readFile`, `readDirectory`, `directoryExists`, `realpath`) consults
that inventory; there is no native filesystem or `ts.sys` fallback. The sync
facade uses synchronous local acquisition to build the same inventory shape and
runs the same extraction modules. Config extends unavailable in the inventory
produce partial compiler coverage. Each base URL, path mapping and root directory
outside the partition produces explicit unsupported coverage. Ancestor configs,
excluded dependency directories, symlinks and out-of-partition workspace paths
cannot silently expand the host's visibility.

Options retain the existing discovery configuration, safety and prior-snapshot
fields. `signal` binds cancellation; `sourceRevisionKind` supplies caller-owned
provenance (default `content`), while the revision comes from the read partition.
`plugins` adds caller-registered v2 plugins. `replaceSourcePlugins` disables the
built-in source set for other languages; Markdown remains available. Source/
package plugins run in sorted ID order, followed by document plugins over the
validated resolution universe. Duplicate plugin/owner IDs fail. Facts are stored
through the existing v1 fact codec; package facts attach to their package owner.
Effective registered manifests enter semantic configuration and analyzer identity.
A missing or failed plugin remains explicit coverage. No repository-selected
imports, network discovery or ecosystem version comparison enters the core.

The registry's optional `builtIns` registration policy binds an exact plugin
object to an allowlist of component analyzer versions. Only those registrations
preserve validated component attribution and existing coverage order without
synthetic capability entries. Third-party registration keeps its original strict
attribution, capability coverage, canonical sorting and evidence requirements.

Built-in legacy evidence is validated against issued reads and their derived
inventory of directory paths, including partition root `.`. Hashless evidence
must name a verified inventory path; directory evidence cannot claim file lines.
Hashed documentation evidence uses the existing `markdownContentHash` codec
(which removes a leading BOM); other evidence uses the issued `contentRef` hash.
No other hash or out-of-inventory path is accepted. Third-party evidence still
requires every path/hash to match an issued read exactly.

`tests/discovery-io.test.ts` exercises sync/injected cold/warm equality, a native
filesystem/TypeScript-host blockade, BOM and alias/re-export inputs, both built-in
registrations, explicit unsupported config, a caller-registered non-JS source
plugin, out-of-inventory rejection and strict third-party evidence rejection.
These source-module APIs do not change index/handoff schemas or synchronous root
exports; package entrypoint integration is a separate change.

Local acquisition also applies the built-in ceilings (64 MiB per file, 512 MiB per
scan), intersected with configured safety limits. Files exceeding a byte ceiling
are excluded with explicit partial limit coverage; they are never read unbounded.
The content-revision fallback hashes the captured inventory rather than re-reading
native files. These ceilings intentionally tighten only very large legacy inputs.

The new async API returns `{ snapshot, binding }`. The receipt is
`{ partition: { repositoryId, revision }, snapshotHash, visibilityPolicyHash }`:
`snapshotHash` is the sealed snapshot hash and `visibilityPolicyHash` is copied
from the reader listing actually used for acquisition. This binds consumers to
the exact repository/revision and visibility policy without changing snapshot,
index or handoff payload schemas. The synchronous facade still returns a snapshot.

Codec-backed symbol facts resolve Markdown citations to `fact.ownerId`, retaining
`metadata.symbol`; the fact ID remains derivable from owner and name. Owners
advertised by both facts and legacy `metadata.exports` are deduplicated. Surface
and package fact roundtrips through the common orchestrator are exercised by the
non-JS source fixture, including preservation of unrelated package metadata.
