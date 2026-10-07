---
title: Knowledge symbol references v1
description: Symbol identity and ambiguity in existing knowledge metadata envelopes.
---

# Knowledge symbol references v1

`DiscoverySnapshotV1` retains its strict schema version 1 envelope. A `mentions-symbol`
relation targets the declaring module and its ID includes the cited symbol discriminator;
`metadata.symbol` is that name (at most 256 characters). Evidence retains at most eight
citation locations per symbol.

Document entities may carry `metadata.ambiguousSymbolReferences`, an array sorted by symbol
and bounded to 64 entries. Each entry contains `symbol` (at most 256 characters),
`candidateModuleIds` (sorted module IDs, at most 32, each at most 256 characters),
`candidateCount` (the full candidate total), and `lines` (sorted citation lines, at most eight).
`metadata.ambiguousSymbolReferencesTruncated: true` signals omitted entries. Ambiguity creates
no relation; existing partial coverage notes retain readable reasons and citation evidence.

These fields use the existing open metadata records, so legacy strict snapshot readers can
accept them. No fields are added to `CoverageSchema`, `DocBridgeIndexV1` or `AgentHandoffV1`.
Older markdown analyzer versions cannot supply symbol identity and are refused for incremental
reuse. See [Markdown analyzer](../spec/markdown-analyzer-v1.md) for resolution behavior.
