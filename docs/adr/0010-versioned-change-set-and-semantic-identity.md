---
title: Versioned change sets and semantic identity
status: proposed
date: 2026-10-06
---

# Versioned change sets and semantic identity

## Context

The rendering contract compares file-backed entity hashes and separates changed documents from unchanged documents requiring review (`docs/spec/render-v1.md:96–103`). Its implementation collects review impacts from current relations and changed/added targets, omitting removed targets from that lookup (`src/render/data.ts:260–269`). Markdown symbol references target modules; relation IDs aggregate by document/kind/target without preserving the cited symbol (`docs/spec/markdown-analyzer-v1.md:16–24`; `src/discovery/markdown.ts:357–379`, `src/discovery/markdown.ts:445–464`). Historical references are needed because reused edges to removed internal targets are intentionally dropped (`docs/spec/incremental-scan-v1.md:53–57`).

Snapshot hashing includes source revision and coverage (`src/discovery/repository.ts:472–488`); reuse-run coverage makes warm/cold snapshot hashes differ (`docs/spec/incremental-scan-v1.md:96–102`). This is not a claim about every artifact: the public index excludes `generatedAt` (`docs/schemas/doc-bridge-index-v1.md:124–133`). Retrieval identity depends on snapshot/overlay/configuration hashes, while freshness compares loaded and rebuilt index hashes (`docs/spec/retrieval-index-v1.md:60–62`; `src/gates/run-gates.ts:102–121`). These dependencies require a migration rather than a global hash replacement.

## Decision

Propose `ChangeSetV1` as the deterministic evolution of `change-digest`, exposed through an `ak-docs diff` command and consumed by rendering and findings. It records repository/branch identity, base/head revisions, packages, release state, ordered changes, semantic hash and hash-algorithm version. Each change has kind (`symbol`, `module`, `doc-path`, `cli-command`, `cli-flag`, `config-key`, `signature`, `package`), operation (`added`, `removed`, `renamed`, `changed`) and applicable before/after identifiers with bounded path/line/hash evidence. Renames require explicit adapter evidence; similarity alone cannot prove a rename. Unsupported extraction is coverage, not an empty successful delta.

Impact analysis must use both snapshots' documentation relations. Keep historical references in the prior snapshot/delta, without resurrecting dangling edges in the current graph. Symbol-level references retain the cited symbol, owner/module identity and each bounded citation location; distinct symbols in one module remain distinct references. A `broken-reference` finding requires the delta to prove removal of the cited target, including an old identity removed by a proven rename. Resolution failure alone produces uncertainty. Competing owners produce a separate `ambiguous-reference` category, without arbitrary target selection or automatic remediation. Findings integrate with ADR 0011. Changed documentation is not automatically validated: report its change separately from any remaining divergence. Reconciliation remains the authority for observed-versus-declared relations (`docs/adr/0002-documentation-audit-boundary.md:20`).

Separate semantic identity from run provenance. Snapshot and ChangeSet semantic hashes exclude revisions, timestamps and reuse-run statistics; those remain in provenance. Include repository identity, canonical entities/relations, evidence content, meaningful coverage/limitations, analyzer versions, effective configuration and pipeline semantics. Delta identity includes release state and package/version mapping, so stamping changes routing identity even when code changes are unchanged. Canonical ordering and explicit hash-algorithm versions are mandatory. File/region hashes and exact approval bindings are distinct; semantic equality cannot transfer approval across revisions. Keep existing study hashes unchanged.

Version the hash projection and migrate dependent retrieval/index/gate contracts together. Readers identify legacy versus new algorithms, never compare unlike hashes as equivalent, and return an actionable migration diagnostic for unsupported versions. Legacy indexes continue through their declared legacy verifier until explicitly regenerated; committed-index drift must be checked before migration writes. Rebuilding under the selected algorithm establishes freshness and reproducibility, not acceptance of a proposal.

Use purl for package identity and vers for ranges. These are proposed format choices, not a claim that version routing is implemented. Ecosystem adapters validate, normalize and compare their version schemes; the core does not assume semver for every ecosystem. A document's target precedence is explicit frontmatter, resolved lockfile version, then manifest range. An invalid or unresolvable higher-priority declaration stays unresolved with evidence; it must not silently fall through. Multiple package targets are resolved independently. Documents without a target follow the latest released version and only receive released deltas; explicit default-branch or workspace-tracking targets may receive unreleased deltas.

Release stamping consumes caller-provided tag/release events, not implicit network fetches. An adapter maps the event to package purls and versions; unmatched or ambiguous events remain unresolved. Deduplicate event identity, retain its provenance, stamp only the proven package/revision range and re-evaluate target eligibility. Conflicting stamps require review rather than overwriting evidence. Release-tool brand or repository tag convention is not a core assumption.

## Alternatives considered

- Extend only the rendered file digest: loses symbol identity and prior-reference impacts.
- Treat every unresolved token as broken: confuses removal with missing or ambiguous analysis.
- Strip provenance from all artifact hashes in place: breaks legacy verification and approval semantics.
- Use one version comparator or infer releases from branch names: cannot express ecosystem-specific ordering or prove a release.

## Consequences

No runtime behavior changes in this proposal. Required follow-up contracts: new `docs/schemas/change-set-v1.md` and `docs/spec/versioned-delta-v1.md`; evolve `docs/spec/render-v1.md`, `docs/spec/cli.md`, `docs/spec/incremental-scan-v1.md`, `docs/spec/markdown-analyzer-v1.md`, `docs/spec/analyzer-plugin-v1.md`, `docs/spec/retrieval-index-v1.md`, `docs/spec/config-v1.md`, `docs/spec/public-parity-v1.md`, `docs/schemas/doc-bridge-index-v1.md`, `docs/PRD-doc-bridge-knowledge-engine.md` and the knowledge schemas in `src/schemas/knowledge.ts`. Public serialization changes require explicit compatibility/versioning decisions, not unknown fields sent to strict readers.

Implementation acceptance must exercise: previous-reference removal, two cited symbols in one module, proven/unproven renames, unresolved versus ambiguous references, changed-doc residual findings; cold/warm and revision/timestamp-only semantic equality with semantic/config/coverage invalidation; legacy gate migration and reproducibility; multi-package purl/vers comparisons, target precedence and latest-release/unreleased eligibility; duplicate, unresolved and conflicting caller release events. Proposed behavior is UNVERIFIED until those flows run against the implementation.
