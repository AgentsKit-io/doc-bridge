---
title: Bounded local import compatibility evidence
status: accepted
date: 2026-10-08
---

# Bounded local import compatibility evidence

## Context

ADR 0016's module-local callable proof cannot resolve an interface imported from
another local module. A changed return extending that interface remains unproven.
Historical comparison must use each snapshot's own declarations, never current
files substituted for earlier types.

## Decision

Extend the built-in JS/TS adapter with bounded per-module declaration/import
syntax and explicit package entrypoint metadata. This narrowly supersedes ADR
0016's restriction to module-local context. Retention remains syntax-only;
indexing never creates a checker or traverses imported type declarations.

Only changed callable hashes attempt a snapshot-local traversal. Present but
unavailable module context fails closed; legacy facts retain the local-only proof. Follow relative imports and explicit local workspace
entrypoints, including named re-exports. Each side has independent limits: depth
8, 32 modules, 256 KiB read context and 256 KiB expanded proof. Each module's
retained syntax and each package's entrypoint map is at most 64 KiB. Missing,
ambiguous, external, unsupported or over-budget context cannot prove compatibility.
Legacy snapshots remain readable without the new metadata; missing imported
context stays unproven. Installed compiler libraries remain the only filesystem
reads during checking. No new dependency, network or repository execution is added.

## Consequences

Snapshot metadata and semantic identity change; the JS/TS analyzer version
invalidates prior reuse. Index and handoff envelopes remain unchanged. Imported
context increases retention and changed-signature diff cost; measure both on
fixed repository corpora. Acceptance uses serialized historical snapshots,
changed imported types, external/unresolved/unsafe dependencies, workspace
re-exports, cycles, bounds and the existing native/fixture/historical benchmark.

## Narrow conditional heritage exception

An imported base in the historical target is external, not a local workspace
module. For this shape only, recognize a nongeneric local interface directly
extending the same opaque named imported base, with no heritage type arguments,
exactly unchanged callable parameters and existing import/local-type bindings.
This declaration-only proof assumes the head compiles. Label head change evidence
`heritage proof (assumes head compiles)`; do not claim external member validation.
Failed local resolution, indirect heritage, intersections, generics and changed
imports cannot use this exception. A strict consumer must treat the assumption
separately from fully compiler-checked compatibility.
