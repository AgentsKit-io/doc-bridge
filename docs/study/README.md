---
title: Documentation efficiency study
description: Anonymized measurements for Doc Bridge context efficiency, evidence quality, and agent workflows.
---

# Documentation efficiency study

This directory contains the anonymized, versioned evidence behind the Doc Bridge performance narrative. It is designed to let contributors inspect the numbers without exposing repository contents, private paths, prompts, credentials, or raw agent responses.

## Executive summary

An anonymized dogfooding cycle estimated up to **99% context-payload reduction** between the scanned repository corpus and the P95 payload returned to an agent. This is a context-payload measurement, not a guaranteed token reduction or correctness result, and it must not be read as a provider-token result.

In a separate controlled A/B study with 96 executions, the deterministic Doc Bridge workflow showed a directional operational signal of 2.29% fewer paired provider tokens across 47 token-complete pairs, 3.15 seconds lower P95 latency, and 4.17 percentage points more operationally completed executions than repository-only context. The sample is too small for a causal, semantic-correctness, or enterprise-readiness claim.

The operationally completed-execution rate was **83.3% with Doc Bridge versus 79.2% with repository-only context**.

![Estimated context payload reduction](../landing/assets/context-payload-reduction.svg)

![Controlled A/B comparison](../landing/assets/controlled-ab-comparison.svg)

## Evidence classification

| Label | Meaning |
| --- | --- |
| `controlled` | Fixed task, model, scenario, and measurement contract. |
| `estimated` | Derived from bounded measurements where direct provider data was unavailable. |
| `observational` | Real-world dogfooding evidence without a controlled counterfactual. |
| `inconclusive` | Useful signal, but insufficient evidence for a causal claim. |

## Published artifacts

| Artifact | Purpose |
| --- | --- |
| [Protocol](./protocol-v1.json) | Metric definitions, scenarios, privacy boundary, and stopping rules. |
| [Task suite](./task-suite-v1.json) | Fixed anonymized discovery, architecture, documentation, and implementation tasks. |
| [A/B baseline result](./ab-baseline-result-v1.json) | Controlled repository-only versus deterministic Doc Bridge measurements. |
| [A/B baseline analysis](./ab-baseline-analysis-v1.md) | Human-readable interpretation of the controlled baseline. |
| [Adjudicated A/B result](./ab-adjudicated-cost-result-v1.json) | Cost-attributed execution and independent bounded adjudication. |
| [Round 2](./round-2-expanded-validation-v1.md) | Expanded adjudication and operational measurements. |
| [Round 3](./round-3-evidence-contract-v1.md) | Evidence-coverage contract validation. |
| [Round 4](./round-4-confirmation-v1.md) | Fresh-sample confirmation and final limitations. |
| [Historical evidence](./historical-evidence-v1.json) | Earlier anonymized dogfooding and validation-cycle measurements. |

All publication-bound artifacts pass the deterministic privacy gate. The values are intentionally anonymized and should be interpreted together with their provenance and limitations.

## Reproduce the charts

From the repository root:

```bash
node scripts/generate-study-charts.mjs
node scripts/generate-study-charts.mjs --check
```

The generator uses only the checked-in JSON artifacts and Node.js APIs. It does not call an LLM or access a consumer repository.

## What the study does not prove

- It does not prove that Doc Bridge makes every agent answer correctly.
- It does not prove a universal 99% token reduction.
- It does not establish causality across all repositories, languages, or models.
- It does not replace semantic human review of documentation/code contradictions.

The study is a transparent measurement baseline and a contribution surface for better analyzers, adapters, acceptance checks, and future replicates.
