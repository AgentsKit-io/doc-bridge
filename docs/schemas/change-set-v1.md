---
owner: maintainers
lifecycle: active
sourceOfTruth: src/schemas/change-set.ts
validationPath: pnpm vitest run tests/change-set.test.ts
---

# ChangeSetV1

`ChangeSetV1Schema` validates the strict deterministic delta contract.
`ChangeSetV1JsonSchema` is exported independently and through `DocBridgeJsonSchemas.changeSetV1`.
This new artifact does not add fields to `DocBridgeIndexV1` or `AgentHandoffV1`.

| Field | Meaning |
| --- | --- |
| `type`, `schemaVersion` | `change-set`, `1` |
| `repository` | Existing project identity: required `name`, optional repository-relative `root` |
| `analysis` | Base/head configuration hashes, pipeline versions and analyzer versions |
| `branch` | Optional caller-provided branch identity; never inferred as a release |
| `baseRevision`, `headRevision` | Required bounded revision strings, retained as provenance |
| `release` | Strict `{ "state": "unreleased" }` or `{ "state": "released", "version", "eventId", "purl" }` supplied by caller-event stamping |
| `packages` | Head codec-backed package purl/version mapping array; empty for legacy extraction |
| `changes` | Canonically ordered change records, maximum 100,000 |
| `contentHash` | 64 lowercase hexadecimal characters |
| `contentHashAlgo` | `sha256-semantic-v1` |
| `coverage` | Existing bounded coverage records, maximum 2,100 |

A change has `kind`, `op`, and applicable `before`/`after` identities. Kinds are
`module`, `doc-path`, `symbol`, `package`, `cli-command`, `cli-flag`, `config-key`,
and `signature`. Operations are `added`, `removed`, `changed`, and `renamed`.
Writers currently produce only added, removed and changed. An addition requires
only `after`, a removal only `before`, and a change or rename requires both.
The Zod validator enforces this operation-dependent rule.

Each identity has bounded `id`, `name`, optional `ownerId`, optional `valueHash`
(64 lowercase SHA-256 hexadecimal characters), and up to 64 existing
Evidence records: source, path (512 characters), optional positive line bounds,
optional SHA-256 content hash and bounded context. Symbol identities use
`entityId('symbol', moduleId + ':' + exportName)` and carry the module's bounded
file evidence, not an invented declaration range. Codec-backed fact identities
retain their adapter value hash; package identities hash canonical purl/version/
dependencies. Evidence content hashes still refer to source files. This additive
identity field evolves the unreleased v1 contract without adding top-level fields.
Module and package IDs remain
unchanged. Package mappings, when adapters supply them, have `id`, `purl` and
optional `version`; this producer does not derive ecosystem-specific identity.

Semantic identity hashes canonical JSON using the existing versioned semantic
hash helper after excluding `baseRevision` and `headRevision`. Repository,
branch, configuration and analyzer/pipeline identity, release state, package mappings, ordered changes and meaningful coverage
remain in identity. Coverage from both snapshots is retained with `base:` and
`head:` scope prefixes, excluding run-only reused-entity counts. Long coverage scopes use the existing
bounded identity helper with a collision-resistant hash suffix. Evidence hashes
remain part of identity. `parseChangeSet` validates shape and semantic hash.

The diff envelope contains `changeSet`, `impact`, and `findings`. Findings reuse
`DiagnosticSchema` and remain outside ChangeSet identity: live text verification
can change certainty without changing the snapshot delta. Findings retain both
citation and target evidence and identify their relation and entities. See the
[behavior contract](../spec/change-set-v1.md).

The unreleased v1 schema evolves in place: `schemaVersion` remains `1`.
A released stamp requires bounded nonempty version (256), event identity (256),
and package purl (512). Release state and mapping participate in the semantic
hash. Stamping retains the event evidence in bounded `release-event` coverage;
the matched revision remains `headRevision`. The index and handoff envelopes
are unchanged. See [release routing](../spec/change-set-v1.md#release-stamping-and-eligibility).
