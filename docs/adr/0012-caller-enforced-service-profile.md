---
title: Caller-enforced service profile
status: proposed
date: 2026-10-06
---

# Caller-enforced service profile

## Context

Configuration parsing is static, not arbitrary repository-code execution (`src/config/load-config.ts:62–74`, `src/config/load-config.ts:105–112`). That does not restrict later execution: Registry CLI invocation inherits `process.env`, and runner loading imports a configured local module (`src/agents/registry-adapter.ts:124–126`, `src/agents/registry-adapter.ts:190–198`). Configuration exposes runtime and runner modules (`docs/spec/config-v1.md:773–786`); federation fetches URLs and memory PR promotion pushes (`src/federation/llms.ts:25–29`; `src/memory/github-pr.ts:143–144`). Watch and local agent paths are documented CLI capabilities (`docs/spec/cli.md:67–84`). A hosted consumer requires a caller-owned ceiling below these entry points.

## Decision

Propose an explicit service execution profile selected by the trusted caller before configuration loading. The immutable effective capability context propagates through config, discovery, query, CLI/MCP handlers and every execution/I/O entry point. Repository data, config, nested calls, defaults and cached state cannot widen it. Direct library calls must enforce the same ceiling as the top-level API. An absent capability context in a service-bound operation fails closed.

Disable repository-selected Registry runner/runtime modules, agent/study CLIs and all repository-selected executable/custom plugin modules; federation fetch; memory PR promotion; and watch. Disable implicit provider/network activation. Trusted adapters are registered by the caller, not imported from repository paths. Reads use bounded contained storage capabilities (ADR 0014); writes are limited to caller-designated artifact storage or separately authorized review presentation (ADR 0011). A service profile is an engine capability restriction, not an OS sandbox or permission to publish. Caller-managed execution environments and credentials remain outside this ADR.

Use the following exact repository-config leaf allowlist; arrays/maps admit only the named member leaves. Parent objects are containers, not wildcard grants. This is a proposed restricted subset of the existing config shapes (`src/config/schema.ts:16–30`, `src/config/schema.ts:184–215`, `src/config/schema.ts:250–290`):

| Container | Permitted leaves |
| --- | --- |
| Root | `schemaVersion` |
| `corpus.agent` | `root`, `index`, `include[]`, `exclude[]`, `okf.requireType`, `okf.allowedTypes[]` |
| `audit.documentation` | `criticalPaths[]`, `generatedPaths[]`, `exclude[]`, `minWords`, `requiredSections[]`, `requireExamples`, `exactDuplicates`, `defaultTier`, `tierRules[].pattern`, `tierRules[].tier`, `tierRules[].critical`, `requiredCriticalMetadata[]` |
| `reconciliation` | `scope`, `requiredRelationKinds[]`, `requiredRelationTargets`, `includeOrphanedDocuments` |
| `analysis.areas` | `depth`, `roots[]`, `exclude[]` |
| `safety` | `exclude[]`, `maxFiles`, `maxBytes`, `maxTimeMs`, `maxMemoryMb`, `redactSecrets` |

All other repository keys are ignored with deterministic diagnostics naming key and reason, never secret values; malformed permitted values fail validation. In particular, repository config cannot select human/custom plugins, modules, output destinations, network URLs, executable checks, transport listeners or gates that execute commands. A caller may supply trusted human-document adapters, storage, gate policy and additional restrictions separately; they are not repo-key exceptions. All permitted paths/globs remain inside caller-authorized read roots; limits combine by taking the stricter bound, excludes combine by union, and redaction cannot be disabled by repository input. Repo-selected generated/excluded paths remain visible as coverage rather than silently disappearing. Apply profile-safe defaults after filtering, with execution/network disabled regardless of ordinary local defaults.

Unavailable analyzers, skipped agents, ignored options and exhausted budgets retain explicit `not-analyzed`/partial coverage. Natural-language correctness is not relabeled deterministic when agents are unavailable (`docs/adr/0002-documentation-audit-boundary.md:13`, `docs/adr/0005-documentation-quality-and-criticality.md:13`). Local CLI behavior outside this opt-in profile remains unchanged. No accepted study/local adapter capability is removed.

## Alternatives considered

- A repository-config boolean: the untrusted input could re-enable execution.
- Filter runnerModule alone: leaves CLIs, custom/runtime modules, federation and direct calls reachable.
- Declare static parsing a sandbox: ignores later import, process and I/O paths.
- Accept entire config subtrees: future fields could silently expand capabilities.

## Consequences

Required follow-up contracts: new `docs/spec/service-profile-v1.md` and caller API contract; update `docs/spec/config-v1.md`, `docs/spec/analyzer-plugin-v1.md`, `docs/spec/enrichment-overlay-v1.md`, `docs/spec/mcp-knowledge-tools-v1.md`, `docs/spec/documentation-audit-v1.md`, `docs/spec/cli.md` and `src/config/schema.ts` documentation/types as needed. The allowlist must remain enumerated and versioned; widening it requires a reviewed capability decision.

Implementation acceptance must call real library, CLI and MCP entry points with hostile repository config and prove no module import, subprocess, federation request, promotion push or watcher starts. Exercise default/cached/nested paths, ignored-key diagnostics without value leakage, contained reads/writes, stricter resource/redaction settings and retained coverage. Compare ordinary local CLI flows before/after to establish unchanged behavior outside the profile. The proposed isolation behavior is UNVERIFIED until those flows run; config parsing alone is insufficient evidence.
