---
title: Advisory Action and CI-built index
status: accepted
date: 2026-10-06
---

# Advisory Action and CI-built index

## Context

The Marketplace contract verifies a committed index without rebuilding first and tells users to commit regeneration when stale (`docs/MARKETPLACE.md:8`, `docs/MARKETPLACE.md:29`). The composite Action exposes config-path/gate/node-version/package-version inputs, runs gates and emits optional doctor annotations (`action.yml:7–23`, `action.yml:51–82`). Its documented workflow requests `contents: read` (`docs/MARKETPLACE.md:16–17`). A CI-produced index and deterministic PR advisory need explicit modes without silently repairing committed-index drift.

## Decision

Propose explicit `index-source` modes: `committed` remains the default and validates the checked-in index before any rebuild; `ci-built` builds an ephemeral index from the declared exact revision into an isolated artifact destination and validates that artifact's provenance/reproducibility. CI output is not written over the committed index. If a committed index exists in CI-built mode, check its drift independently first and report it under the configured blocking policy; selecting CI-built mode cannot hide that result. A missing committed index is expected only in explicitly selected CI-built mode. Reports label source mode and source revision, rather than presenting generated freshness as committed freshness.

Add an opt-in advisory Layer-1 PR comment consuming the base/head snapshots and ADR 0010's ChangeSet. Show deterministic findings, evidence, analyzed revisions, policy exclusions, missing/partial coverage and a clear advisory label. This channel is separate from configured blocking gates: a successful comment does not clear a gate, and a missing comment does not alter gate results. Interpretation and remediation acceptance remain human-owned; no comment auto-merges or applies edits.

Define exact base/head repository/revision inputs and trusted caller-owned gate/config selection. Treat PR content as untrusted data. Analysis must not execute head-revision scripts, dependencies, hooks, repository-selected modules or commands with write credentials; apply the service capability ceiling (ADR 0012). Any permitted executable generating check belongs to a separately authorized unprivileged sandbox, not the comment publisher. Builds use trusted installed engine/adapters and bounded reads. A privileged comment publisher consumes only validated bounded data artifacts from unprivileged analysis, verifies repository/PR/revision binding and never checks out or executes untrusted PR code. Escape comment content and never include credentials or raw unsafe agent output.

Request read access only for analysis; enable a PR-comment write permission only for the separately opted-in publisher and only where the caller's event/token permits it. Specify the concrete token permission for the chosen comment endpoint in the future Action contract, including fork behavior. Do not use a privileged event to run untrusted head code. The engine does not create applications or request broad installation scopes.

Deduplicate comments with a stable engine-owned marker scoped to repository/PR/advisory type. Verify author/marker before updating; update only the engine's own existing comment, reconcile uncertain create/update results before retrying, and avoid stale runs overwriting a newer analyzed head. Bind runs to base/head hashes and mode, report superseded runs and use bounded retries. When commenting is disabled, unauthorized, unavailable or unsupported, emit the same advisory to the local CI summary/artifact and explain the fallback. Comment failure never masks gate results; callers may require delivery separately without turning advisory findings into blocking gates.

## Alternatives considered

- Always rebuild before freshness checks: masks committed-index drift.
- Make advisory findings a new implicit blocking gate: changes configured policy without consent.
- Analyze untrusted PR code in the privileged publisher: expands repository content into execution authority.
- Post a new comment every run or silently skip permission failures: causes noise or hides missing delivery evidence.

## Consequences

Required follow-up contracts: evolve `action.yml`, `docs/MARKETPLACE.md`, `docs/guides/gate-ci.md`, `docs/spec/cli.md`, `docs/spec/config-v1.md`, `docs/spec/public-parity-v1.md`, Marketplace contract tests in `scripts/marketplace-contract.test.mjs` and ADR 0010's proposed delta/advisory spec. Document endpoint-specific permissions, event matrix, revision acquisition and artifact retention. No Action implementation or live comment is authorized by this documentation task.

Implementation acceptance must run real PR workflows for fresh/stale committed indexes, absent/present committed indexes in CI-built mode, drift preserved alongside generated output, exact base/head advisory findings, trusted versus fork/untrusted PR inputs, no-write fallback, comment create/update/deduplication, uncertain retry and stale-run prevention. Verify configured blocking results independently from comment delivery. Local contract tests support these flows but cannot substitute for live Action/permission evidence. These proposed workflows are UNVERIFIED until implemented and exercised.
