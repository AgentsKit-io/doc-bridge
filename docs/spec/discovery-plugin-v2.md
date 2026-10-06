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
