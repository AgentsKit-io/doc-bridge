---
title: Pluggable I/O and revision partitions
status: proposed
date: 2026-10-06
---

# Pluggable I/O and revision partitions

## Context

Discovery currently imports local filesystem functions directly (`src/discovery/repository.ts:2–3`). Retrieval reads document bodies from disk with a bounded budget and checks their hashes against snapshot evidence, falling back to snapshot data when the file changed (`docs/spec/retrieval-index-v1.md:76–79`). The retrieval PRD excludes a hosted control plane, database-backed store and telemetry leaving the process (`docs/PRD-knowledge-retrieval-and-enrichment.md:456`). A caller-injected storage boundary must preserve local behavior and exact evidence without requiring a hosted backend in the core.

## Decision

Propose caller-injected storage/I/O capabilities with a local filesystem default. The interface provides bounded file listing, metadata and exact-revision reads, artifact reads/writes, atomic artifact replacement and explicit missing/mismatched/error results. Keep revision resolution, repository authorization and storage selection caller-owned. The core ships no hosted database, vendor SDK, control plane or telemetry requirement. An optional consumer-owned backend implements the same interface; selecting it is never a repository-config permission to fetch arbitrary URLs.

Partition snapshots, indexes, overlays, caches and evidence by stable repository identity plus exact revision, with schema/algorithm versions in artifact metadata. Keep public entity IDs unchanged inside a partition. A multi-repository query identifies each authorized partition explicitly; there is no invented universal ecosystem revision. Cross-partition sharing may use semantic hashes only after authorization and provenance checks; semantic equality is not permission to return another repository's evidence.

Every read names an exact revision and repository, validates containment and bounds, and verifies bytes against expected content evidence. Never fall back silently to latest/default-branch content or a neighboring partition. Missing bodies retain the snapshot-derived fallback only with an explicit availability limitation; stale live bytes cannot be substituted as if they matched. Local mutable workspaces must validate the revision and evidence for each read rather than treating a directory name as immutability. Artifact writes bind their partition and use atomic publication; interrupted writes cannot expose partial artifacts as valid. Cancellation and resource limits propagate through discovery and retrieval (ADR 0013).

Clarify the retrieval PRD storage exclusion narrowly: the engine still does not implement or require a hosted control plane, database-backed store or outbound telemetry. A caller-owned injected storage implementation is permitted behind the generic interface; backend operation, authorization and deployment remain outside the core. This is a proposed scope clarification, not a claim that the existing PRD already documents injectable storage.

## Alternatives considered

- A mandatory central database: changes the local engine's operating model without proving a need.
- Key storage by repository alone: mixes revisions and invalidates citation provenance.
- Use latest content on an exact-revision miss: produces unsupported answers.
- Change every entity ID to carry repository/revision: couples public graph identity to storage layout; partition context suffices.

## Consequences

Required follow-up contracts: new `docs/spec/storage-io-v1.md`; evolve `docs/spec/retrieval-index-v1.md`, `docs/spec/incremental-scan-v1.md`, `docs/spec/analyzer-plugin-v1.md`, `docs/spec/config-v1.md`, `docs/schemas/doc-bridge-index-v1.md`, `docs/spec/cli.md`, `docs/spec/mcp-knowledge-tools-v1.md` and the exclusion at `docs/PRD-knowledge-retrieval-and-enrichment.md`. Specify repository/revision selection in public API docs and migration of unpartitioned local artifacts without ambiguous default reads.

Implementation acceptance must compare local and injected storage snapshot/index/query outputs on the same bytes; run two repositories with colliding paths and two revisions with changed bytes; prove exact-revision selection, unauthorized partition denial, hash mismatch/missing-body handling, path/symlink containment, cancellation/bounds and interrupted atomic writes. Exercise real backend operations for any shipped adapter; fixture equivalence alone cannot validate a hosted backend. These proposed flows remain UNVERIFIED until implemented.
