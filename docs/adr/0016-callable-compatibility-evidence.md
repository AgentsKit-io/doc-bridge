---
title: Bounded callable compatibility evidence
status: accepted
date: 2026-10-08
---

# Bounded callable compatibility evidence

## Context

Signature facts store syntax hashes, which detect change but cannot prove that
existing calls remain valid. The discovery adapter must own language semantics
under ADR 0013, while ADR 0010 requires compatible changes to remain visible in
the deterministic delta. Indexing must not acquire a type-checking cost.

## Decision

The built-in signature extractor retains optional, bounded declaration evidence
using an explicit `typescript-callable-v1` codec. Its adapter-owned comparison
helper runs only at diff time for changed signature hashes. The core consumes
its proven-compatible result; it does not interpret TypeScript syntax itself.
Other language adapters and legacy facts omit the codec and remain unclassified.
The checker uses retained module-local declarations and compiler libraries,
without repository imports, execution or network access. Unresolved types,
unsupported constructs and omitted proofs retain review candidates.

ChangeSet changes may carry `compatibility: compatible`; this annotation affects
semantic identity and suppresses changed-reference candidates, without implying
human acceptance. Existing index and handoff envelopes remain compatible.
The public contracts document the strict-reader limitation for the added
ChangeSet annotation. Analyzer versions invalidate old extraction caches.

## Consequences

At most 16 KiB of proof per callable increases snapshot fact size; cost is
measured on repository corpora. No checker runs during indexing. Compatibility
is intentionally incomplete: imported context and aggregate class/type/member
changes are not inferred. Tests exercise actual discovery and diff, including
incompatible and unresolved changes, rather than trusting checker registration.
