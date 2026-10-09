---
title: Region remediation v1
description: Validate region edits, isolated review presentation and authenticated human acceptance.
owner: maintainers
lifecycle: active
sourceOfTruth: src/fixes/regions.ts
validationPath: pnpm vitest run tests/finding-contracts.test.ts tests/region-remediation.test.ts --maxWorkers=2
---

# Region remediation v1

The deterministic library exports creation, revalidation, approval, presentation/application
and human merge acceptance. `applyFixProposal` retains the legacy V1 apply API; `applyRemediation` is the region successor. Both use the shared atomic replacement path. No network, model, implicit shell hook or repository-config
approval is involved. Existing CLI/MCP whole-file fix commands retain their V1 contract;
region application remains library-only until a caller integrates authenticated review controls.
The optional [`fix --llm`](llm-remediation-v1.md) command proposes verified regions without applying them.

## Region validation

The trusted caller supplies current revision, evidence/configuration hashes, a fresh
evidence validator, allowed roots and optional protected ranges. Every edit is checked
before staging: exact UTF-8 bytes and declared region hash; exact specified range first;
otherwise one exact bounded anchor match in the same file. Unsupported/non-UTF-8 bodies,
missing/ambiguous regions, traversal and symlink escapes fail closed. Canonical paths
must fall under a caller-allowed root. Alias paths cannot hide overlapping edits.
Duplicate/nested/overlapping edits and same-offset or boundary-ambiguous insertions
are refused. Generated Markdown marker regions and caller-declared protected regions
are checked at the relocated coordinates, including zero-length edits.

Non-overlapping edits apply in descending byte-offset order. Unrelated text survives;
if it changes the displayed patch, revalidation regenerates the review artifact and
requires renewed approval. Evidence/config changes never silently inherit approval.
Revision changes require a recorded revalidation/rebinding, preserving base provenance.

## Writes and rollback

Unified hunks include line coordinates/counts, three context lines and missing-final-newline
markers. Applying the displayed patch reproduces the validated replacement, including
CRLF text. Both mutation APIs stage exclusive temporary files, retain recoverable originals,
check current targets again, and atomically rename per file before checking actual written
content and running the caller's post-apply gates. A multi-file batch is not a filesystem
transaction. Write or gate failure restores all replaced originals; rollback failure throws
an explicit error naming retained original backups. Successful cleanup removes task-owned
staging/backup files; failed restores keep their originals for recovery.

## Review and acceptance authority

Ordinary application requires an exact authenticated human approval. Review presentation
requires a caller-designated canonical workspace, revision, distinct review/default branches
and a mandatory trusted `attestIsolation` callback proving the default branch is protected
and reachable only through human-approved merge. Missing or denied attestation fails closed.
The caller must enforce that boundary; configuration or an agent-produced boolean is not
an authority. Review presentation can apply unapproved text only within that attested boundary
and returns `in-review`, never `merged` or resolved.

`approveRemediation` binds an authenticated human to the exact review artifact. `mergeRemediation`
requires that approval, separate authenticated human acceptance and successful fresh verification
of the supplied merged revision through `verifyMerged`. Review closure alone has no transition.
Service-profile mutation remains denied. Finding rejection, remediation rejection and suppression
are governed by [DecisionV1](../schemas/decision-v1.md).

## Validation

`tests/region-remediation.test.ts` exercises real files, real unified patch application,
staleness and relocation, collisions and protection, containment, write/gate rollback,
recoverable rollback failures, binding renewal, denied default-branch writes, isolated
presentation and authenticated acceptance with fresh verification. `tests/finding-contracts.test.ts`
exercises policy and both rejection targets through enrichment/disk-cache replay;
`tests/handoff-caveats.test.ts` exercises both strict-reader compatibility directions.
