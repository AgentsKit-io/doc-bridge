---
title: Language-neutral discovery adapters
status: proposed
date: 2026-10-06
---

# Language-neutral discovery adapters

## Context

The analyzer contract declares versioned capabilities, bounded inputs, canonical output and failure coverage (`docs/spec/analyzer-plugin-v1.md:8–12`). Its input currently contains language/framework/file metadata/value and its strict output contains entities/relations/coverage/diagnostics (`src/plugins/contract.ts:21–39`). Repository discovery directly imports TypeScript and local filesystem functions (`src/discovery/repository.ts:1–4`). The language-independent delta and version-routing proposal needs a shared discovery contract with ecosystem-owned semantics rather than more language checks in the core.

## Decision

Propose an extended, versioned analyzer/discovery contract. Migrate JavaScript/TypeScript discovery as the first built-in plugin using it, preserving stable public entity/relation IDs and existing deterministic outputs where semantics are unchanged. The core orchestrates bounded reads, validated canonical output, snapshots, diff and delta; it must not interpret language syntax or ecosystem version ordering.

Adapters declare supported capabilities and unsupported constructs, limits, schema/pipeline compatibility and their own versions. Extend responsibilities to manifest and lockfile interpretation; tag/release-event to package/version mapping; exported symbol ownership/re-exports; CLI commands/flags; configuration keys; and signatures. Preserve purl identity and vers range representation from ADR 0010, with comparison and unresolved mapping evidence delegated to the relevant ecosystem adapter. Extraction returns observed facts with bounded path/line/hash evidence, never a release inferred without an event or an arbitrary ambiguous owner.

Replace free filesystem access in adapter inputs with a caller-provided bounded read abstraction tied to the exact repository/revision partition (ADR 0014). Reads enforce allowed paths, file/byte/time/memory budgets and cancellation. Repository configuration selects only caller-registered plugins in the service profile (ADR 0012). Plugin ordering and output ordering remain deterministic; malformed/failed/unsupported output becomes explicit partial or `not-analyzed` coverage, not completed analysis. Version the extended input/output shapes and reject incompatible manifests before execution.

A fake non-JS fixture adapter is mandatory acceptance evidence: it must read a synthetic manifest/lockfile and symbol/command/config/signature facts, create base/head snapshots, then produce diff and ChangeSet output through the same core API without any core change or language-specific condition. It must demonstrate package range comparison and release mapping as adapter responsibilities. An adapter that only registers or returns an empty snapshot does not establish this boundary.

## Alternatives considered

- Leave JS/TS in the core and add plugins only for new languages: perpetuates a second discovery pipeline.
- Let adapters return arbitrary diffs: duplicates delta semantics and prevents common validation.
- Give plugins unrestricted paths or executable module selection from repo config: defeats bounded reads and the service ceiling.
- Add production analyzers for every language now: unnecessary to prove the contract; the fixture plus JS/TS migration is sufficient.

## Consequences

Required follow-up contracts: evolve `docs/spec/analyzer-plugin-v1.md`, `src/plugins/contract.ts`, `docs/spec/markdown-analyzer-v1.md`, `docs/spec/incremental-scan-v1.md`, `docs/spec/config-v1.md`, `src/schemas/knowledge.ts`, `docs/PRD-enterprise-hardening.md` and ADR 0010's proposed versioned-delta spec. Capability/contract version changes must invalidate relevant semantic caches; unsupported analysis stays visible.

Implementation acceptance must run the fixture adapter's full snapshot → diff → delta flow, compare JS/TS parity for unchanged semantics, exercise symbols/re-exports and commands/flags/config/signatures, manifest/lockfile precedence, unresolved/ambiguous release mapping, ecosystem comparison, plugin failure, incompatible versions, bounds/cancellation and exact-revision read denial. This proposal does not claim those adapter flows already work; they remain UNVERIFIED pending implementation.
