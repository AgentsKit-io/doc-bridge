---
title: Study verification binding v1
description: Provenance, privacy, budget, recovery, and audit rules for controlled study evidence.
---

# Study verification binding v1

`ControlledStudyVerifiedResultV1` is the publication-safe boundary for a controlled study result. It wraps a result with the exact verification run, source revision, protocol/configuration hashes, immutable baseline hash, artifact hashes, privacy scan outcome, and consumed budget.

The binding is content-addressed with `sha256-normalized-v1`. It is not a baseline and cannot replace one. Baseline replacement remains available only through the explicit audited harness operation:

```bash
ak-verify baseline replace <new-baseline.json> approved --by <human> --config .codex/verification.json
```

Validate a binding through the real CLI:

```bash
ak-docs study verification docs/study/verification-binding-v1.json --text
```

## Required evidence

Every controlled result must bind:

- `verificationRunId` and `sourceRevisionHash`;
- `protocolHash`, `configurationHash`, and `baselineHash`;
- hashes for every included artifact, never raw repository content;
- anonymized privacy status, artifact count, zero forbidden matches, and publication-review state;
- maximum and consumed token/runtime budget.

The binding rejects budget exhaustion and tampered content. A result without this envelope may be useful for local exploration, but is not a verified study result.

## Privacy boundary

`scanStudyPublicationArtifact` recursively checks machine-readable artifacts and logs for private paths, URLs, credentials, prompts, raw agent output, snippets, and repository-content fields. `scripts/study-privacy-gate.mjs` applies the same scan to a file or directory. It reports only field paths, never the matched secret value. Publication requires human review even when the deterministic scan has zero matches.

Study artifacts use anonymized consumer identifiers and bounded hashes. Do not place repository names, internal paths, document contents, prompts, credentials, or raw responses in a ledger, report, log, or publication export.

## Recovery and idempotency

Observation ledgers are updated with `upsertControlledStudyObservation`; the same run/task is reused when its content hash matches and rejected when it conflicts. Workflow stage artifacts are atomic and hash-verified. A failed, cancelled, stale, corrupted, or interrupted workflow can resume from the last valid completed stage; invalid artifacts are not silently reused. Changed source, configuration, protocol, task definition, model, tool version, or evidence produces a new run.

The harness records `CLARIFYING`, `PLANNED`, `VERIFYING`, `AWAITING_HUMAN_APPROVAL`, `AWAITING_AUTHORIZATION`, `BLOCKED`, and `COMPLETE` distinctly. Missing checks, stale evidence, privacy matches, budget exhaustion, or regressions cannot be reported as complete.
