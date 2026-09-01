---
title: Study protocol and historical evidence
description: Decision record for the versioned, anonymized, fail-closed study contracts.
---

# ADR-0003: Versioned study protocol and historical evidence

**Status:** Accepted  
**Date:** 2026-08-30

## Context

Doc Bridge has historical dogfood and verification evidence, but the evidence was collected with changing metrics and incomplete comparability. A new study needs to preserve that history while establishing a controlled baseline without presenting missing or observational data as causal proof.

The study also covers a private consumer repository. Public artifacts must not expose its name, paths, contents, prompts, credentials, or raw agent responses.

## Decision

Use two versioned, content-addressed JSON contracts in the existing modular monolith:

- `StudyProtocolV1` defines the study population, evidence classes, task categories, model slots, scenarios, metric definitions, budget, privacy policy, and stopping rules.
- `HistoricalEvidenceRegistryV1` stores anonymized historical records with source references, available numeric metrics, explicit missing measurements, validation status, and limitations.

Validation and summaries are exposed through the existing CLI. The contracts reuse the existing Zod schemas and canonical SHA-256 hashing. Phase 0 does not add a database, hosted telemetry, network collector, or LLM dependency.

Historical evidence is observational. Controlled evidence is the only track eligible for causal improvement claims. Missing values remain missing and every public artifact is anonymized by construction and subject to human publication review.

## Alternatives considered

1. **Store study data in a database** — rejected because it adds operational cost and a new source of truth before the study proves that centralized storage is needed.
2. **Infer missing historical metrics** — rejected because it would create false precision and invalidate the study.
3. **Use free-form Markdown as the protocol** — rejected because the harness needs strict validation, stable hashes, and machine-readable compatibility.
4. **Put the private consumer name in the public protocol** — rejected because public study artifacts must remain safe for publication.

## Consequences

- The study is reproducible and auditable using existing artifact and verification conventions.
- Historical trend coverage is incomplete where the original runs did not collect a metric; this limitation remains visible.
- Exact model/provider selection is deferred until the controlled baseline, while the protocol still reserves two versioned model slots.
- A future hosted telemetry or analytics layer can consume the registry without changing the protocol contract.
