---
title: Documentation audit boundary
status: accepted
date: 2026-08-29
---

# Documentation audit boundary

## Decision

Doc Bridge owns a deterministic documentation audit alongside repository discovery and reconciliation. The audit reports document quality signals, package coverage, structure/documentation gaps, stale declarations, exact duplicates, generated-document freshness boundaries, and explicit analysis limitations.

High-confidence findings block only when their evidence matches configured critical paths. Natural-language redundancy, unnecessary prose, and contradictions that are not represented as structured Doc Bridge claims remain `not-analyzed`; a configured AgentsKit Registry agent may propose review work, but a human must approve documentation changes.

Generated documentation is never edited by the audit. It receives presence and freshness-boundary evidence and must be validated by its generating check.

## Consequences

- Reports are measurable and reproducible without an LLM.
- Reconciliation remains the source of truth for observed-versus-declared relations.
- Teams can raise strictness per repository without changing the engine.
- Semantic quality still requires agent or human review and cannot be honestly reduced to a deterministic score.
