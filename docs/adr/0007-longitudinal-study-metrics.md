---
title: Deterministic longitudinal study metrics
status: accepted
date: 2026-08-30
---

# Deterministic longitudinal study metrics

## Decision

Doc Bridge calculates longitudinal study metrics from content-addressed observation ledgers. It exposes subgroup metrics and comparisons for the baseline and current approved round, preserves provider-versus-estimated token provenance, keeps missing measurements explicit, and emits uncertainty for rates. A bounded numeric measurement envelope allows task, documentation, cost, and future operational metrics to be added without changing the observation identity contract.

Efficiency improvements are subordinate to correctness, evidence, acceptance, safety, and rework. A round with cheaper or faster execution but a quality regression is reported as `regressed`.

## Consequences

- The same ledger produces JSON and text reports with the same metric values and content hash.
- Baseline replacement is outside the calculator and remains an explicit audited operation.
- Historical data can remain incomplete without being converted into false precision.
- New metric names can be collected without a schema migration, but interpretation requires a versioned metric contract and documentation.
- Small samples remain `inconclusive`, so the report supports decisions without overstating evidence.
