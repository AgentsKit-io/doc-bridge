---
title: Documentation quality dimensions and criticality
status: accepted
date: 2026-08-30
---

# Documentation quality dimensions and criticality

## Decision

The documentation audit classifies every included document by type, audience, lifecycle, tier, and criticality. Tier rules are configurable and can be overridden by document frontmatter. Critical documents are checked for maintainability metadata without requiring every secondary document to carry the same governance burden.

Quality is exposed as independent dimensions: correctness, completeness, clarity, agent efficiency, and maintainability. Deterministic structural signals may produce `partial` or `validated` evidence only for the signal they actually prove. Semantic correctness, usefulness, redundancy, unnecessary prose, and document/document contradictions remain `not-analyzed` until a Registry agent or human supplies evidence.

## Consequences

- Teams can prioritize Tier 0 operational and agent guidance without collapsing all documentation into one score.
- Missing critical metadata becomes visible and measurable, while project-specific thresholds remain configurable.
- Example presence cannot be confused with executable correctness.
- Future agent review can consume stable document assessments without changing the deterministic audit contract.
