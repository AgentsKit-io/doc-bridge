---
title: Injected storage
description: Run deterministic discovery, indexing and diff against exact repository revisions.
---

# Injected storage

A hosted caller supplies `RepositoryReadV1` and `ArtifactIOV1` capabilities bound
to one `{ repositoryId, revision }` partition. The engine performs no network
lookup or implicit latest-revision read. All APIs below are additive exports
from `@agentskit/doc-bridge`; existing synchronous local APIs remain available.

## Run the pipeline

Given caller-provided `read`, `artifacts`, `config` and an `AbortSignal`:

```ts
import {
  discoverRepositoryWithRead, writeStoredSnapshot, readStoredSnapshot,
  buildStoredDocBridgeIndex, loadStoredDocBridgeIndex, runQuery,
  diffSnapshotsWithRead,
} from '@agentskit/doc-bridge'

const request = { partition: read.partition, signal }
const { snapshot, binding } = await discoverRepositoryWithRead(read, {
  config, signal,
})
const saved = await writeStoredSnapshot(artifacts, request, snapshot, null)
if (saved.status !== 'ok') throw new Error(saved.code)
const restored = await readStoredSnapshot(artifacts, request)
if (restored.status !== 'ok') throw new Error(restored.code)
const built = await buildStoredDocBridgeIndex({
  ...request, repository: read, artifacts, config,
  snapshot: restored.value.value, snapshotBinding: binding, overlay: 'ignore',
})
if (built.status !== 'ok') throw new Error(built.code)
// Surface built.value.limitations alongside results, even on status: 'ok'.
const loaded = await loadStoredDocBridgeIndex(artifacts, request)
if (loaded.status !== 'ok') throw new Error(loaded.code)
const result = runQuery(loaded.value.index, config, {
  kind: 'search', term: 'storage',
})
// baseSnapshot was loaded from its own base-partition ArtifactIOV1.
const delta = await diffSnapshotsWithRead(baseSnapshot, snapshot, read, { signal })
// delta contains changeSet, impact and advisory findings; it never approves edits.
```

Keep the `SnapshotReadBinding` receipt with the exact verified capture that
produced it. It binds the partition, snapshot hash and visibility policy, and
permits index acquisition to reuse verified source inventory. Without a receipt,
the builder performs full input verification. `loadFreshStoredDocBridgeIndex`
checks the stored index against current verified inputs and configuration.

`null` means create-only publication. For replacement, supply the preceding
`byteHash`; a conflict returns `CAS_CONFLICT`. Snapshots, indexes and handoffs
retain their existing v1 payload contracts. Partition metadata lives in the
storage envelope, without changing entity IDs.

## Capabilities and adapters

`createLocalRepositoryRead` requires a caller-confirmed frozen inventory mapping
relative POSIX paths to `ContentRef`. `contentRef(bytes)` computes the declared
normalized content identity. The local adapter enforces containment, content
checks, limits and cancellation. It does not infer revisions from disk or Git.
`createLocalArtifactIO` provides isolated local artifact publication with atomic
replacement. Local adapter options are acquisition inputs, not repository config.
A hosted caller supplies its own implementations of the same interfaces.

The root exports storage request/envelope validators, `createArtifactEnvelope`
and `parseArtifactEnvelope`, plus `readJsonArtifact`/`writeJsonArtifact` for
schema-labelled v1 JSON payloads. The caller must validate its custom payload.
Typed snapshot, overlay, cache, approval and workflow persistence helpers reuse
engine validation and do not execute workflows or grant approval authority.
Storage failures distinguish missing, mismatch, denied, limit, cancellation and
I/O error; never turn those failures into empty successful analysis.

## Discovery plugins and facts

Use `createDiscoveryRegistryV2` to validate manifests before execution. Pass
caller-registered `DiscoveryPluginV2` instances in `discoverRepositoryWithRead`
options; `replaceSourcePlugins` replaces only built-in source extraction.
`createJsTsPluginV2` and `createMarkdownPluginV2` expose the built-in adapters.
Incompatible versions are rejected; unsupported, malformed or failed extraction
stays visible in coverage. Version/range/release semantics belong to adapters.

`SurfaceFactSchema`, `PackageFactSchema`, `surfaceFactEntityId`,
`surfaceFactToEntity`/`surfaceFactFromEntity` and
`packageFactToEntity`/`packageFactFromEntity` encode language-neutral facts without
changing core dispatch. Discovery v2 validators and types are separate from the
unchanged analyzer v1 contract. These v1 storage and v2 discovery entrypoints are
versioned public contracts; stricter future shapes require explicit negotiation.
Rename proof and release/version routing remain unsupported by the core diff.

## Existing consumers

`auditDocumentation` accepts a synchronous `readDocument` callback containing
already verified text. `handleMcpRequest`/`respondMcpRequest` accept `loadIndex`
and `readDocument` callbacks; a read failure must throw and never fall back to
local bytes. Existing local MCP tools and their payloads remain unchanged.
Gate, conformance, config and render orchestration and injected workflow execution
are deferred; their local entrypoints must not be presented as hosted execution.

The runnable root-export acceptance flow is
`pnpm vitest run tests/injected-entrypoints.test.ts`. See the
[storage contract](../spec/storage-io-v1.md) and [CLI contract](../spec/cli.md).
