---
type: module
id: doc-bridge-parity
editRoot: src/parity
humanDoc: /docs/spec/public-parity-v1
owner: doc-bridge-maintainers
lifecycle: active
sourceOfTruth: src/parity
validationPath: pnpm test && pnpm typecheck
docbridge:
  covers:
    - area:src/parity
---

# Parity

Owns detecting when public sentences have drifted from repository facts and reporting findings
with remediation.

A `PublicClaim` binds a sentence to a canonical value by naming where the value lives (`evidence`),
how it appears in prose (`template`), and which surfaces must carry it. Evidence kinds are
`package-field`, `artifact-field`, `artifact-sum`, `snapshot-count`, `doctor-metric`, and
`cli-command`. The registry carries its own `contentHash` over everything but that field, so a claim cannot be
edited without resealing it.
`checkPublicParity` compares what public surfaces state against what the registry resolves, reporting
`PARITY_STALE` when a surface states a moved value, `PARITY_MISSING` when a surface omits a claim,
and `PARITY_CONTRADICTION` when two surfaces disagree.

The eight claims are keyed by `claimId`: `study-token-reduction`, `study-token-pairs`,
`study-completion-bridge`, `study-completion-baseline`, `study-latency-p95`, `study-executions`,
`cli-parity-command` and `checked-in-package-version`. Six resolve from an artifact field, one sums a
field across artifacts, and one runs a CLI command.

