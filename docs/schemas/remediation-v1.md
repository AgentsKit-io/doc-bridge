---
title: RemediationV1
description: Bounded region correction proposals with exact evidence and review bindings.
owner: maintainers
lifecycle: active
sourceOfTruth: src/schemas/findings.ts
validationPath: pnpm vitest run tests/finding-contracts.test.ts tests/region-remediation.test.ts --maxWorkers=2
---

# RemediationV1

`RemediationV1Schema` is the strict region successor to legacy whole-file
`FixProposalV1Schema`, which remains readable with its existing apply API.
There is no FixProposalV2 alias: the successor is explicitly named Remediation.
Its discriminator is `type: remediation`, `schemaVersion: 1`, with an ID, finding ID,
relevant evidence hash, base revision, configuration hash, edits, real unified diff,
lifecycle, exact binding and optional revalidation/approval/presentation.

Each edit requires `{path, range: {start,end}, expectedRegionHash, original,
replacement, lineStart, lineEnd}`. Coordinates are zero-based half-open UTF-8 byte
offsets under `utf8-byte-half-open-v1`. `sha256-bytes-v1` hashes exact region bytes,
without newline/Unicode normalization. Positive 1-based line hints are display-only.
Optional anchors contain exact before/after strings (at most 1,024 characters each)
and a search range capped at 1,000,000 bytes. Relocation requires precisely one
original-plus-anchor match in that same file; fuzzy and cross-file matching are forbidden.

Lifecycle: `proposed → in-review → merged`, with `rejected`, `stale` and `superseded`
terminal dispositions. Application/presentation alone never resolves a finding.
The binding records relevant evidence, configuration, validated target revision and
review artifact hash. Approval hashes the exact remediation plus that binding.
Revalidation produces a new diff/binding and clears prior approval/presentation;
changed revisions require an explicit from/to revision revalidation record.

See [region remediation](../spec/region-remediation-v1.md) for validation, isolation,
write/rollback guarantees and acceptance requirements.
