---
title: Controlled study verification boundary
status: accepted
date: 2026-08-31
---

# Controlled study verification boundary

## Decision

Controlled study results require a separate content-addressed verification binding. The binding records provenance, artifact hashes, anonymized privacy review, and consumed token/runtime budgets. The result envelope is the only artifact eligible for publication or an enterprise study claim.

Recovery remains delegated to the existing workflow engine and observation-ledger idempotency. The harness is the authority for state, human approval, tracking authorization, and explicit baseline replacement.

## Consequences

- A locally calculated report is distinguishable from a verified result.
- Privacy and budget failures fail closed without exposing matched values.
- Interrupted or stale work can resume from valid evidence without duplicating observations.
- Baselines remain immutable during normal runs and have an auditable replacement path.
- Publication still requires human review; deterministic scanning cannot approve its own output.
