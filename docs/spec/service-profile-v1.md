---
title: Service profile v1
description: Caller-selected capability restrictions for bounded deterministic service execution.
owner: maintainers
lifecycle: active
sourceOfTruth: docs/adr/0012-caller-enforced-service-profile.md
validationPath: pnpm vitest run tests/service-profile.test.ts --maxWorkers=2
---

# Service profile v1

The trusted caller selects `profile: 'service'` before loading repository
configuration. `executionContext()` returns an immutable capability ceiling;
`withExecutionProfile('service', callback)` propagates it across asynchronous
and nested calls. A nested `local` selection cannot widen a service call.
Partitioned artifact APIs also accept `profile` on their caller request; it is
execution metadata, stripped before the strict storage wire request. Without an
explicit profile, ordinary local behavior is unchanged.

`loadConfigWithRead`, `discoverRepositoryWithRead` and `buildStoredDocBridgeIndex` accept the caller
profile. Service library operations use `RepositoryReadV1` and `ArtifactIOV1`;
legacy filesystem config, discovery and index APIs reject service calls. Repository
configuration does not select the profile. An already filtered service config
retains its binding, so omitting a profile cannot restore local privileges.
Service snapshots/indexes retain in-process bindings as well, including those
loaded through service artifact requests; passing them to native package-script fallbacks or agent
enrichment APIs fails closed even after the outer call returns. Pure index-backed
query/lookup remains available. Caller-owned service approval stores use the
existing deterministic gate mirror without implicit peer activation.
Callers register trusted discovery adapters directly; repository modules are
never imported to construct them. A trusted adapter runs inside the same ceiling.

## Repository configuration

`serviceConfig(input)` returns a frozen effective config and deterministic
path-only `diagnostics`. Only these leaves are admitted; parent objects never
grant future fields:

| Container | Permitted leaves |
| --- | --- |
| Root | `schemaVersion` |
| `corpus.agent` | `root`, `index`, `include[]`, `exclude[]`, `okf.requireType`, `okf.allowedTypes[]` |
| `audit.documentation` | `criticalPaths[]`, `generatedPaths[]`, `exclude[]`, `minWords`, `requiredSections[]`, `requireExamples`, `exactDuplicates`, `defaultTier`, `tierRules[].pattern`, `tierRules[].tier`, `tierRules[].critical`, `requiredCriticalMetadata[]` |
| `reconciliation` | `scope`, `requiredRelationKinds[]`, `requiredRelationTargets`, `includeOrphanedDocuments` |
| `analysis.areas` | `depth`, `roots[]`, `exclude[]` |
| `safety` | `exclude[]`, `maxFiles`, `maxBytes`, `maxTimeMs`, `maxMemoryMb`, `redactSecrets` |

Disallowed keys produce diagnostics naming their path, without values. An
ignored container and its descendants are reported at their paths. Each path is
bounded to 512 characters; diagnostic collection retains at most 127 ignored
paths followed by `diagnostics.truncated` when more paths exist. Truncation does
not admit disallowed configuration or skip validation of permitted leaves. Malformed permitted values fail
validation. Absolute paths, parent traversal, backslashes and drive/URI prefixes
in permitted paths and globs are rejected. Contained storage remains the read
authority, including symlink and exact-revision checks. Acquisition limits take
the minimum of repository and caller limits; excludes combine by union.
Redaction is always enabled. Generated/excluded audit paths and ignored options
remain explicit `not-analyzed` snapshot coverage.

## Denied capabilities

Service code denies repository-selected Registry runner/runtime imports, agent
and study subprocesses, provider activation, federation fetches, memory
publication, watchers and legacy filesystem writes. Shared entry points check
before the effect, including cached local artifact writers and Registry
transports. Injected operations use no subprocesses. Service CLI acquisition
uses deterministic ignore-file rules without querying Git.

Denied operations throw an actionable `not-analyzed` error. Successful
restricted discovery retains coverage entries naming unavailable capabilities,
including natural-language correctness; unavailable analysis is never success.
Index and handoff wire schemas stay compatible. Service artifacts include their
restricted configuration and coverage in existing semantic hashes.

## CLI and MCP

```sh
ak-docs validate-config --profile service --root .
ak-docs discover --profile service --root .
ak-docs index --profile service --root . --artifact-root ./artifacts
ak-docs search guide --profile service --root .
ak-docs mcp --profile service --root .
```

The service CLI supports the listed deterministic operations. `index` requires
an explicit caller-designated `--artifact-root`; it stores partitioned envelopes
through `ArtifactIOV1`, without repository-selected output paths. Read-only
commands require no artifact root and build from current contained bytes in
memory. Unsupported commands and `--watch` fail explicitly. The CLI emits
ignored-key diagnostics on stderr and coverage limitations in JSON output.

MCP callers pass `profile: 'service'`, an injected `loadIndex` and, for `doc.get`,
an injected `readDocument`. Service tools refuse agent/mutating operations and
filesystem fallbacks. Read-only search/retrieval tools use the supplied index;
unsupported tools report `not-analyzed`. The service stdio CLI currently offers
index-backed search; synchronous document text retrieval reports a limitation.

The profile is an engine restriction, not an operating-system sandbox. Trusted
caller adapters and storage implementations must honor their declared storage
capabilities. Caller-managed environments and credentials are outside this
contract. Opting into service grants no publishing authorization.

Service MCP tool results keep their existing `content` payload and add
`_meta.serviceProfile` containing path-only `diagnostics` and `coverage` entries
for ignored/restricted options and unavailable capabilities. Local results carry
no service metadata.
