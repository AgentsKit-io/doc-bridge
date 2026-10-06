---
title: Findings and region remediation
status: proposed
date: 2026-10-06
---

# Findings and region remediation

## Context

The knowledge schema already defines `confirmed`, `undocumented`, `stale-or-unverified`, `conflict`, `unresolved` and `not-analyzed`, separately from severity (`src/schemas/knowledge.ts:12–23`). Fix application requires an approved, exactly bound proposal, checks base revision and entire affected files, then writes temporary files, renames them and rolls back on failure (`src/fixes/proposals.ts:125–165`). Its displayed diff currently uses whole-file minus/plus content and a bare `@@` (`src/fixes/proposals.ts:38–42`). Enrichment retains settled human/adjudicator rejections against cache replay (`src/enrich/stage.ts:199–201`), and approval binds proposal and target content (`docs/spec/enrichment-overlay-v1.md:195–202`).

ADR 0006 requires approval before conversion to a fix or resolution, and verification after application (`docs/adr/0006-registry-semantic-grounding.md:13`). ADR 0002 requires human approval of documentation changes and prohibits audit edits of generated documentation (`docs/adr/0002-documentation-audit-boundary.md:13–15`). A caller-designated isolated review workspace needs a precise presentation boundary while retaining human acceptance authority.

## Decision

Propose separate Finding, Remediation and Decision contracts. Findings reuse the existing knowledge status taxonomy above. Their category includes ADR 0010's proven `broken-reference` and separate `ambiguous-reference`. Layer, confidence, severity, entities, bounded doc/code evidence and policy routing are independent fields. Routing (`proposed`, `excluded`, `routed-to-L2`, `pending-version`) never changes a finding's epistemic status. Preserve document classification/frontmatter overrides (`docs/adr/0005-documentation-quality-and-criticality.md:11–13`); unify classification before routing. Historical/archived documents are excluded from patches with visible coverage; suspicious migration context routes to interpretation; generated regions point to their generator; out-of-range version targets remain pending. Deterministic evidence is recorded before policy disposition.

A finding ID hashes category, assertion locator (document plus cited symbol/key) and relevant evidence content, excluding revision/time. Provenance retains analyzed revisions. Remediations bind a finding/evidence hash and edits `{path, range, expectedRegionHash, replacement}`, with lifecycle `proposed → in-review → merged`, or `rejected`, `stale`, `superseded`. Presentation is not resolution. Decisions name an authenticated caller-supplied human identity, target kind/ID, reason and evidence hash; the engine validates binding while the caller proves identity/authority.

Rejecting a finding suppresses unchanged relevant evidence until it changes. Rejecting a remediation rejects only that correction, preserving the finding and allowing a different correction. Extend enrichment's settled persistence rather than adding another replay authority. A decision that implementation should change records that disposition without automatically creating an external issue. Closing a review alone is neither approval nor individual rejection.

Region validation replaces whole-file staleness only after fresh evidence validation. Keep base revision/configuration provenance; a changed revision requires an explicit revalidation/rebinding record. Hash exact region bytes under a declared algorithm and coordinate convention. First check the specified range. Relocation is allowed only when the exact original region plus recorded bounded anchors has one match within the permitted file; zero or multiple matches are stale, with no fuzzy relocation. Never relocate across files. Reject overlapping or nested edit ranges, duplicate edits, ambiguous same-offset insertions and protected/generated-region intersections before any write. Apply non-overlapping edits from the end of each file. Unrelated edits outside proven regions may survive, but do not waive evidence, scope or approval checks.

Use real unified diff hunks with line counts, context and no-final-newline markers; applying the displayed patch must reproduce the validated replacement. Maintain path containment including symlink escape checks, caller-allowed roots and current target checks. Validate every edit before staging writes, use atomic per-file replacement and restore all originals on write or verification failure. A multi-file batch is not a filesystem transaction: rollback failures must be explicit and leave recoverable originals. Post-apply gates run against the actual new revision. Approval binds the exact remediation, relevant evidence, validated target revision and review artifact; changed bindings require renewed review. A semantic hash alone is insufficient.

### Narrow approval-boundary supersession

Upon acceptance of this proposed ADR, narrowly supersede only ADR 0006's requirement that human approval precede conversion into a fix (`docs/adr/0006-registry-semantic-grounding.md:13`) **for presentation in an isolated, caller-designated review workspace/branch**. Such application presents the proposal; it does not accept it. The workspace/branch must be unable to reach the default branch without human approval. The trusted caller supplies and enforces that isolation and the engine fails closed if the review mode's boundary cannot be established. No caller config or agent output may assert acceptance. All ordinary local/default-branch application retains prior human approval. Resolution still requires human acceptance and passing current post-apply verification.

Clarify only ADR 0002's human-approval clause (`docs/adr/0002-documentation-audit-boundary.md:13`): human approval of that isolated review, for example a merge, is acceptance of the documentation change. The audit itself remains read-only and generated regions remain protected. Every other clause of ADRs 0002 and 0006 remains unchanged, including grounding, advisory output and post-apply verification. Extend the existing single mutation path with an explicit review-presentation mode; do not introduce an approval bypass for ordinary fixes. This proposed supersession has no effect until maintainer acceptance.

### Handoff compatibility

Propose optional bounded `caveats` on `AgentHandoffV1` for pending findings, analyzed repository/revision identities and coverage. The current schema has no such field and is strict (`src/schemas/agent-handoff.ts:62–102`), so optionality alone is not bidirectional compatibility. New readers must accept legacy payloads. New writers emit `caveats` only after explicit caller opt-in or consumer capability negotiation; legacy strict readers receive the legacy field set, including embedded handoffs in indexes and MCP responses. Unknown consumer capability defaults to legacy emission. Caveats cannot invent answers or turn missing analysis into success.

## Alternatives considered

- One finding/fix status: mixes evidence truth, routing, rejection and acceptance.
- Whole-file hashes alone: discard valid proposals after unrelated edits; fuzzy relocation risks changing the wrong region.
- Treat review-branch writes as accepted changes: permits agents to approve their own output.
- Emit optional caveats unconditionally: breaks old strict readers.

## Consequences

Required follow-up contracts: new `docs/schemas/finding-v1.md`, `docs/schemas/remediation-v1.md`, `docs/schemas/decision-v1.md`; evolve FixProposal contracts in `src/schemas/knowledge.ts`, `docs/spec/enrichment-overlay-v1.md`, `docs/spec/documentation-audit-v1.md`, `docs/spec/mcp-knowledge-tools-v1.md`, `docs/spec/retrieval-index-v1.md`, `docs/spec/cli.md`, `docs/schemas/agent-handoff-v1.md`, `docs/schemas/doc-bridge-index-v1.md`, `src/schemas/agent-handoff.ts`, `docs/PRD-doc-bridge-knowledge-engine.md` and `docs/PRD-knowledge-retrieval-and-enrichment.md`. Older ADR files are not edited by this proposal.

Implementation acceptance must exercise unchanged/changed/shifted/ambiguous regions, overlaps/insertions, generated protection, containment escapes, real patch application, failure rollback and rollback failure reporting; evidence/config/revision/approval rebinding; both rejection targets across cache replay; isolated presentation without acceptance, denied default-branch writes, human review/merge and fresh verification. Test both compatibility directions: new strict reader accepts old handoffs; old strict reader accepts new writer's legacy output, including index/MCP embedding; negotiated caveats round-trip with the new reader and never reach a legacy reader. These proposed flows are UNVERIFIED until implemented and executed.
