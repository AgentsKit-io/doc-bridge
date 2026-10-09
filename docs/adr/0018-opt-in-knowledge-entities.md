---
title: Opt-in deterministic knowledge entities
status: proposed
date: 2026-10-08
---

# Opt-in deterministic knowledge entities

## Context

Decisions, concepts and historical changes need versioned evidence for subsequent
memory and query consumers. Existing index readers are strict; merely adding an
optional field does not make new output compatible with old readers. Local git
is not an authority for captured revision partitions.

## Decision

Emit a separately versioned `knowledgeEntities` index section only with explicit
`index.knowledgeEntities.enabled` opt-in; default off preserves existing output.
Require semantic hashing and reject legacy hash emission with the feature on.
Keep handoffs unchanged. Reuse bounded snapshot/document inputs and discovery
identity/ownership conventions; exact aliases only, with ambiguous links omitted.
History uses a bounded local first-parent window. Stored inputs have no implicit
git source; service configuration retains its existing allowlist.

History can change independently of file bytes, so opt-in local freshness uses
the existing full rebuild path. Extraction records its limits and unavailable
sources in coverage, without claiming unsupported analysis.

## Consequences

Old readers require default-off output; opt-in readers must support
[knowledge entity v1](../schemas/knowledge-entity-v1.md). No dependency is added.
Local freshness is more expensive only when enabled. Tests exercise real history,
exact evidence, compatibility, ambiguity and resource limits; extraction cost
must also be measured on repository corpora before delivery.
