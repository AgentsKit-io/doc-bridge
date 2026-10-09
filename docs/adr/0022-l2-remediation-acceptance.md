---
title: Deterministic acceptance of optional L2 region proposals
status: accepted
date: 2026-10-09
owner: maintainers
lifecycle: active
sourceOfTruth: src/fixes/llm.ts
validationPath: pnpm vitest run tests/llm-remediation.test.ts --maxWorkers=2
---

# Deterministic acceptance of optional L2 region proposals

## Context

ADRs 0010 and 0011 separate evidence, routing, remediation and human acceptance.
An interpretive proposal must not become reviewable merely because a provider
claims it fixes a finding. Layer 0 must continue working without provider peers.

## Decision

Keep L2 opt-in behind a separate lazy entry and the existing optional ecosystem
Adapter peer. Bound finding count, prompt and response size, and cancellation.
Use scripted responses to validate the contract without keys or real providers.
Reuse existing RemediationV1 exact-region validation and review bindings.

Apply each proposed region only to an in-memory inventory copy. Re-run discovery,
delta, declarations, reconciliation and documentation audit with the same config
and prior snapshot. Present a proposal only when its original finding and
assertion disappear and no new finding appears in the touched document. Reject
incomplete verification and retain a machine-readable reason. No source writes
occur during proposal generation; draft review previews remain advisory.

## Alternatives

Provider self-evaluation cannot prove deterministic acceptance. Applying to local
files before verification risks changing source without approval. Rechecking only
the original finding misses new contradictions and quality regressions.

## Consequences

The acceptance rule proves only the executed deterministic analysis. Citation
deletion may pass, while retaining a corrected changed-signature citation may
still fail the delta engine. Human review remains necessary for semantic intent.
Proposals are checked independently; combined patches require fresh verification.
Remediation and handoff schemas retain their existing compatibility.
