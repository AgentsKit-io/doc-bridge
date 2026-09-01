---
title: Registry semantic review grounding boundary
status: accepted
date: 2026-08-30
---

# Registry semantic review grounding boundary

## Decision

Registry agents may classify and explain deterministic documentation findings, but their proposals must be grounded in the exact snapshot and reconciliation report supplied to the adapter. The adapter requires a known diagnostic, at least one matching evidence reference, and the installed Registry agent identity and version. It accepts either the default configured agent or an alternate installed agent through configuration without changing the common engine.

Registry output remains advisory. Human approval is required before a proposal is converted into a fix or considered resolved, and applying a fix requires post-apply verification against the new source revision.

## Consequences

- Unsupported claims and invented evidence fail closed at the adapter boundary.
- Deterministic facts remain separate from semantic agent judgment.
- Agent swaps remain configurable and attributable.
- The existing fix-proposal approval and verification flow remains the single mutation path.
