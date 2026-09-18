---
type: module
id: doc-bridge-fixes
editRoot: src/fixes
humanDoc: /docs/POSITIONING
owner: doc-bridge-maintainers
lifecycle: active
sourceOfTruth: src/fixes
validationPath: pnpm test && pnpm typecheck
docbridge:
  covers:
    - area:src/fixes
---

# Fixes

Owns proposing and applying fix proposals with approval gates and integrity verification.

`createMarkdownLinkFixProposal` and `createArtifactNormalizationProposal` generate `FixProposalV1` instances
from detected issues: broken markdown links and JSON formatting. A proposal captures the base revision, affected
file hashes, unified diffs, and pre/postconditions. `approveFixProposal` binds approval identity and timestamp
to a proposal; `applyFixProposal` verifies the proposal content matches its approval, checks that affected
files have not changed, writes atomically to temp files, and renames into place, or rolls back all changes on
failure. The proposal always remains advisory: applications require explicit human or policy approval before
execution, never automatic.
