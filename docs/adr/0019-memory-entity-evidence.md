---
title: Configurable memory source and exact entity evidence
status: proposed
date: 2026-10-08
---

# Configurable memory source and exact entity evidence

## Context

Memory configuration declares adapters and an ingest directory, but the existing
pipeline reads only fixed note directories. Opt-in knowledge entities provide a
separate evidence surface for decisions, concepts and changes. Promotion is an
advisory draft and must not imply acceptance of a memory fact.

## Decision

Reuse deterministic Markdown ingestion for `playbook-memory` and `cursor-rules`.
Accept one or multiple repository-contained directories for generic memory
notes; tool-convention rules retain `.cursor/rules`. Preserve default
sources, order and candidate bytes. Unsupported adapter formats fail explicitly;
no provider, network, new dependency or automatic corpus mutation is introduced.

Add optional typed `memoryRelations` inside the opt-in knowledge entity section.
A `memory-supports` relation records a candidate ID, target entity ID and exact
ID/alias/path evidence with the hash of the candidate fact. Only unique exact
matches from safe, non-discarded candidates link. Ambiguous evidence does not
choose an owner, and a relation is never proof of truth or human approval.

Captured builds do not consult local notes; unavailable memory inputs remain
explicit `not-analyzed` coverage. Local opt-in freshness already rebuilds entity
indexes, so it also validates linked memory evidence. Default-off index and
handoff field sets remain unchanged. Updated opt-in readers must accept the new
optional relation field; knowledge query consumption is a separate integration.

## Consequences

The [entity schema](../schemas/knowledge-entity-v1.md) defines the typed relation;
[configuration](../spec/config-v1.md) defines directory/adapter behavior. Tests
exercise real file ingestion and index freshness, exact/ambiguous evidence,
containment, unsupported inputs, default bytes and draft-only CLI behavior.
Session and bootstrap formats remain unsupported until their contracts exist.
