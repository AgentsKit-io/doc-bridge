# PRD: Enterprise Hardening for Doc Bridge

## Problem Statement

Doc Bridge already provides deterministic repository discovery, documentation discovery, relationship reconciliation, persistent workflow artifacts, CLI and MCP surfaces, Registry-agent assistance, and a read-only HTML report. The current implementation has proven that it can scan a large real repository, preserve evidence, expose documentation/code drift, reduce agent context, and render an interactive architecture view.

It is not yet an enterprise-grade knowledge bridge. The current validation still uses a `poc` dogfood profile, some analyzer surfaces are explicitly incomplete, semantic precision is not measured strongly enough, recovery and operational guarantees need broader failure validation, and the full product surface is not always exercised in one auditable contract. A large number of findings can also represent missing documentation rather than actionable defects, so users need confidence and quality metrics instead of an undifferentiated pass/fail result.

The product must help humans and agents establish a trustworthy shared model of a repository while remaining honest about uncertainty. It must never present inferred or heuristic architecture as observed fact, must never hide unsupported analysis, and must never claim completion without evidence from the real artifact.

## Solution

Harden Doc Bridge around a stable, language-neutral knowledge-engine contract with a first-class JS/TS analyzer implementation. Add explicit analyzer coverage, precision/recall evaluation, confidence and provenance, configurable runtime and generated-code adapters, reliable resumable execution, enterprise configuration profiles, Registry-agent guardrails, documentation quality signals, and complete real-surface validation.

The enterprise contract will be strict by default:

- Every requested capability is either validated or explicitly declared not applicable.
- No silent exemptions are allowed. Every exemption requires a reason and is recorded in the run.
- Unsupported analysis is visible, measurable, and included in quality reporting.
- Deterministic analysis is the source of truth. Registry agents may discover, classify, explain, and propose, but may not approve or silently mutate results.
- Reports remain read-only. Mechanical fixes require explicit human approval and a fresh post-apply verification run.
- The default Registry agent is `ecosystem-doc-bridge-corpus-scanner`; alternative AgentsKit Registry agents are configurable through the same contract.
- JS/TS and Markdown are the initial supported implementation scope. The extension contract must not require a future schema rewrite to add other languages.

## Goals

1. Improve architecture and documentation analysis coverage without inventing certainty.
2. Quantify semantic quality, efficiency, reliability, and user-visible behavior.
3. Make workflow execution resumable, idempotent, versioned, auditable, and failure-safe.
4. Provide an ESLint/tsc-like configuration and plugin experience with safe defaults and enterprise enforcement.
5. Use Registry agents as bounded, evidence-grounded assistants with provenance and human approval.
6. Validate the actual CLI, MCP, report, documentation, and applicable runtime surfaces end to end.
7. Produce anonymization-safe longitudinal data suitable for internal improvement and external case studies.

## Non-Goals

- Building a hosted SaaS dashboard or central repository database.
- Replacing source control, CI, package managers, language compilers, or observability platforms.
- Claiming complete semantic understanding of reflection, arbitrary code generation, or dynamic runtime behavior.
- Automatically applying documentation or code changes without human approval.
- Supporting every programming language in the first implementation.
- Requiring endpoint or database validation for a project that does not expose or use those surfaces.

## User Stories

### Analysis coverage and architecture

1. As a repository owner, I want every in-scope package and application classified, so that the architecture map reflects the real project boundaries.
2. As a repository owner, I want package, module, and file levels to be independently navigable, so that I can move from a system overview to exact evidence.
3. As a human reviewer, I want relation direction and relation kind preserved, so that the graph does not hide ownership or dependency direction.
4. As a human reviewer, I want dynamic imports and runtime wiring reported with their resolution status, so that unresolved behavior is visible rather than silently omitted.
5. As a human reviewer, I want generated code and source-map limitations identified, so that generated artifacts are not mistaken for fully analyzed source.
6. As an analyzer author, I want a language-neutral coverage model, so that future analyzers can report the same completeness semantics.
7. As a repository owner, I want configured framework/runtime adapters, so that known registration and loading patterns can be resolved without broad false-positive heuristics.
8. As a human reviewer, I want disconnected nodes, cycles, hotspots, and likely single points of failure surfaced with evidence and confidence, so that structural risks can be investigated.
9. As a human reviewer, I want inferred groupings separated from observed package boundaries, so that derived architecture remains distinguishable from source facts.
10. As an agent, I want stable entity and relation identities across equivalent rescans, so that I can cite knowledge without losing references after harmless file reordering.

### Semantic quality and metrics

11. As a product owner, I want precision and recall measured against known fixtures, so that a green run means more than compilation or unit tests.
12. As a product owner, I want 100% recall for the supported known-case fixture matrix, so that supported findings are not missed.
13. As a product owner, I want at least 95% precision for supported known-case fixtures, so that users are not overwhelmed by false positives.
14. As a human reviewer, I want every finding to include evidence, provenance, confidence, and remediation context, so that I can decide whether it is actionable.
15. As a human reviewer, I want observed, declared, inferred, heuristic, unresolved, and not-analyzed states separated, so that uncertainty is explicit.
16. As a product owner, I want undocumented, stale, conflicting, unresolved, and confirmed results quantified separately, so that documentation improvement can be tracked over time.
17. As a product owner, I want comparison between immutable snapshots, so that improvements and regressions are measurable.
18. As a product owner, I want agent latency, response size, token estimate, hit rate, and context reduction tracked, so that efficiency claims are evidence-based.
19. As a product owner, I want publication-safe aggregate metrics without repository secrets, paths, prompts, or contents, so that case studies can be prepared safely.
20. As an operator, I want benchmark thresholds and baseline provenance recorded, so that a baseline cannot be silently replaced to make a regression pass.

### Reliable execution and recovery

21. As an operator, I want every workflow stage persisted with input and output hashes, so that execution can be audited and resumed.
22. As an operator, I want interrupted runs to resume from the last valid stage, so that large repository scans do not need to restart unnecessarily.
23. As an operator, I want repeated execution with the same source, configuration, and pipeline version to reuse valid artifacts, so that the workflow is idempotent.
24. As an operator, I want concurrent runs to be isolated or rejected safely, so that artifacts cannot be mixed or corrupted.
25. As an operator, I want cancellation and failure states to preserve valid evidence, so that partial work is recoverable and clearly labeled.
26. As an operator, I want schema and analyzer version migrations explicit, so that old artifacts cannot be consumed as if they were current.
27. As an operator, I want resource limits, timeouts, and bounded output enforced at trust boundaries, so that hostile or oversized repositories cannot exhaust the process.
28. As an auditor, I want a complete state transition history and exact run identifier, so that I can reconstruct what happened.
29. As a human approver, I want approvals bound to the exact source revision, contract, and evidence hashes, so that an approval cannot be reused for different output.
30. As an operator, I want task-owned temporary artifacts cleaned after a run without deleting ambiguous user data, so that the workspace remains maintainable.

### Configuration and extensibility

31. As a new user, I want a safe default profile that works without extensive configuration, so that initial adoption has low friction.
32. As a project owner, I want strict, poc, custom, and enterprise profiles, so that enforcement can match project maturity without weakening the enterprise contract.
33. As a project owner, I want profile overrides to be explicit and reasoned, so that reduced rigor is visible in the report and audit log.
34. As a project owner, I want analyzer, reconciliation, report, workflow, agent, and validation settings in one versioned schema, so that behavior is reproducible.
35. As an analyzer author, I want a stable plugin contract with declared capabilities, supported constructs, version compatibility, and coverage output, so that new languages and frameworks can be added independently.
36. As a project owner, I want custom relation kinds, runtime methods, framework adapters, and documentation rules, so that the engine can represent local architecture conventions.
37. As a project owner, I want invalid configuration to fail before mutation or scanning, so that a typo cannot produce misleading evidence.
38. As a user, I want useful diagnostics for configuration errors, so that the correction path is clear.
39. As an enterprise operator, I want backward-compatible schema evolution and migration guidance, so that upgrading the library is safe.
40. As a maintainer, I want the common engine isolated from language-specific analyzers, so that future expansion does not destabilize current behavior.

### Registry-agent assistance

41. As a user, I want the default discovery assistant to come from the AgentsKit Registry, so that the agent identity and capabilities are discoverable.
42. As a project owner, I want to configure another Registry agent without changing the engine, so that agent choice remains flexible.
43. As a user, I want deterministic mode available for every assisted workflow, so that proposals can be replayed and compared.
44. As a user, I want assisted proposals linked to the source snapshot, report, agent ID, agent version, and evidence, so that the proposal is auditable.
45. As a human reviewer, I want the agent to propose classifications, documentation improvements, stale-doc explanations, and follow-up checks, so that discovery is faster.
46. As a human reviewer, I want the agent prevented from approving its own proposal, so that human authority remains explicit.
47. As an operator, I want agent token budgets, timeouts, redaction, and failure behavior configurable, so that assisted runs are cost-bounded.
48. As an operator, I want agent failures to degrade to a clearly labeled deterministic result, so that failure is not hidden as success.
49. As a human reviewer, I want unsupported agent claims rejected or labeled as unverified, so that natural-language confidence cannot override evidence.
50. As a product owner, I want assisted and deterministic results reported as separate evidence classes, so that case-study metrics remain honest.

### Documentation quality and reconciliation

51. As a repository owner, I want all in-scope documentation classified, so that presence is not confused with usefulness.
52. As a repository owner, I want every package and application to have a documentation status, so that missing and stale documentation are visible.
53. As a human reviewer, I want documentation claims linked to observed code relations, so that contradictions can be located.
54. As a human reviewer, I want orphaned, stale, conflicting, and unsupported claims grouped at a useful scope, so that the report remains actionable.
55. As a human reviewer, I want suggestions to include the source evidence and proposed change type, so that fixes can be reviewed mechanically.
56. As a human reviewer, I want documentation quality rules configurable by project, so that local standards are respected.
57. As a project owner, I want documentation/code comparison at file, module, or package scope, so that monorepos can choose useful signal granularity.
58. As a human reviewer, I want high finding volume explained by category and evidence density, so that a documentation debt baseline is interpretable.
59. As an agent, I want a compact, stable corpus and focused search results, so that I can find ownership and architecture knowledge without loading the entire repository.
60. As a human reviewer, I want all decisions and structural changes reflected in documentation and ADR/RFC records, so that knowledge does not decay after implementation.

### Complete product validation

61. As a maintainer, I want the real package artifact installed in a real consumer repository, so that source-only validation cannot pass incorrectly.
62. As a CLI user, I want discovery, indexing, reconciliation, report, query, and gate commands exercised as real commands, so that the public workflow is validated.
63. As an MCP user, I want every supported read-only MCP tool exercised against the packaged artifact, so that the agent surface is validated end to end.
64. As a human user, I want the report validated in a real browser across responsive viewports and themes, so that code correctness is not mistaken for usable UI behavior.
65. As a human user, I want interaction, loading, accessibility, contrast, overflow, errors, and lazy-loading behavior measured, so that visual quality is a real gate.
66. As a project owner, I want endpoint and database checks required when the configured project uses them, so that applicable runtime behavior is not skipped.
67. As an operator, I want non-applicable surfaces declared with reasons, so that the harness does not force irrelevant checks or hide relevant ones.
68. As a maintainer, I want a complete verification contract tied to the exact source revision and configuration, so that “complete” is reproducible.
69. As a release owner, I want issue, pull request, and ticket transitions recorded only after authorization, so that external tracking is auditable.
70. As a product owner, I want residual risks and unsupported areas in the final report, so that enterprise decisions are based on limitations as well as successes.

## Implementation Decisions

### Common knowledge engine

- Keep a canonical versioned knowledge model for entities, relations, documents, evidence, coverage, diagnostics, proposals, workflow stages, and metrics.
- Separate observed facts from declarations, inferences, heuristics, unresolved states, and not-analyzed states.
- Preserve stable content-addressed identifiers and deterministic ordering.
- Add confidence and provenance fields without making confidence a substitute for evidence.
- Keep raw relations and semantic comparison relations separate so aggregation does not destroy traceability.

### Analyzer and coverage architecture

- Define a language-neutral analyzer capability contract with discovery, relation extraction, document extraction, coverage reporting, diagnostics, and version metadata.
- Keep JS/TS as the initial analyzer and Markdown as the initial documentation format.
- Add explicit support for configured runtime wiring and dynamic loading adapters.
- Treat generated code as a declared boundary and support source-map or generated-manifest adapters where available.
- Report coverage by supported construct and by unresolved construct, including counts and evidence.
- Add known-positive, known-negative, ambiguous, and unsupported fixtures for every supported analyzer capability.

### Quality and reconciliation

- Add a precision/recall evaluation runner whose fixtures contain expected entities, relations, documentation claims, findings, and unsupported boundaries.
- Enforce 100% recall and at least 95% precision for the supported fixture matrix before an enterprise profile can pass.
- Keep the agentskit-os result as a real-world baseline, not as a semantic truth set.
- Add finding density, category distribution, evidence completeness, and change-over-time metrics.
- Make package/module/file reconciliation scope configurable while retaining raw file-level evidence.

### Workflow and safety

- Retain the internal state machine and make transitions, checkpoints, input hashes, output hashes, pipeline version, analyzer versions, and configuration hash mandatory.
- Make resume, idempotency, cancellation, concurrency protection, bounded resources, and migration behavior explicit contract outcomes.
- Fail closed when evidence or a required validation surface is unavailable.
- Keep fix proposals mechanical and human-gated; applying a proposal invalidates prior completion and requires a fresh verification run.

### Configuration and profiles

- Provide `default`, `strict`, `poc`, `custom`, and `enterprise` profiles.
- The `enterprise` profile forbids silent exemptions and requires all applicable surfaces; a not-applicable declaration must contain a reason.
- Keep configuration strict and versioned, with capability-specific settings and plugin compatibility checks.
- Preserve the low-friction default profile, while making every enterprise relaxation explicit and reportable.

### AgentsKit Registry integration

- Use `ecosystem-doc-bridge-corpus-scanner` as the default Registry agent.
- Allow another Registry agent to be selected by configuration only when its identity, version, capabilities, and contract are recorded.
- Separate deterministic evidence from assisted proposals.
- Enforce redaction, token/time budgets, provenance, bounded output, human approval, and no self-approval.
- Keep agent failure visible and never convert an unavailable agent into an ungrounded success.

### Report and product surfaces

- Keep the report read-only and offline-capable.
- Preserve progressive loading: package topology and compact evidence indexes first, module/file evidence on demand.
- Add explicit report sections for coverage, confidence, precision/recall, unresolved boundaries, metrics, and residual risk.
- Ensure architecture, drift, risks, evidence, filters, breadcrumbs, zoom/pan, double-click navigation, accessibility, responsiveness, and contrast are validated in a real browser.
- Keep CLI and MCP outputs machine-readable, versioned, bounded, and linked to the same canonical artifacts.

### Audit and study data

- Persist a per-cycle record containing package version, source revision, configuration hash, snapshot/report hashes, workflow run, verification run, metrics, decisions, approvals, exemptions, and residual risks.
- Store anonymization-safe benchmark data without repository paths, package names, document contents, credentials, or prompts unless explicitly approved for a private audit.
- Never replace an approved baseline automatically.
- Record the exact human approval or authorization action for any completion or external tracking transition.

## Testing Decisions

Tests must validate externally observable behavior and the real artifact. Unit tests and compilation are supporting evidence only; they cannot satisfy the enterprise completion gate by themselves.

### Analyzer and coverage tests

- Test JS/TS extraction for static imports, exports, literal dynamic loading, configured runtime wiring, unresolved wiring, test-runtime opt-in, generated-code boundaries, stable IDs, evidence, and resource limits.
- Test each plugin capability contract with positive, negative, ambiguous, and unsupported fixtures.
- Test that unsupported behavior is surfaced and never silently omitted.

### Quality and reconciliation tests

- Run the known-case fixture matrix and calculate precision, recall, false positives, false negatives, evidence ratio, and finding density.
- Test package/module/file scopes and verify that raw evidence remains available after aggregation.
- Test stale, conflicting, undocumented, confirmed, unresolved, heuristic, and not-analyzed classifications.
- Test that an empty or narrowed policy is represented as an explicit configuration decision.

### Workflow and safety tests

- Test deterministic replay, idempotent rerun, stage reuse, interrupted-stage resume, corrupted-artifact rejection, cancellation, concurrency isolation, resource limits, and schema migration.
- Test that an applied fix proposal requires a new source revision or fresh verification and cannot inherit completion from an earlier run.
- Test secret redaction, path boundaries, symlinks, untrusted input, and bounded output.

### Configuration and plugin tests

- Test defaults, strict validation, profile inheritance/override rules, invalid configuration failure, capability compatibility, and explicit exemption reasons.
- Test adding a minimal synthetic analyzer without modifying the common engine contract.

### Registry-agent tests

- Test the default Registry agent identity and a configured alternate agent.
- Test deterministic replay, provenance binding, bounded output, redaction, timeout, budget exhaustion, unavailable-agent behavior, and human approval gating.
- Test that unsupported claims cannot become confirmed facts.

### CLI and MCP tests

- Exercise packaged CLI commands as real processes with machine-readable and human-readable output.
- Build and validate the MCP artifact, initialize a real stdio session, exercise every supported read-only tool, verify framing, errors, schemas, and bounded responses.
- Verify exit codes and artifact references for success, incomplete analysis, blocked validation, and failed validation.

### Report and UI tests

- Use real browser validation across configured desktop, tablet, and mobile viewports and light/dark themes.
- Verify architecture/drift/risks/evidence lenses, package → module → file navigation, breadcrumbs, selection, filters, lazy chunks, zoom/pan, keyboard controls, loading behavior, and error recovery.
- Verify responsive layout, keyboard accessibility, accessible names, focus visibility, contrast, text overflow, no horizontal page overflow, console errors, failed requests, and interaction latency.
- Require explicit human visual approval for the exact report hash after automated checks pass.

### Consumer validation

- Install the exact packed artifact in agentskit-os.
- Run the full Doc Bridge workflow against the real monorepo.
- Validate its discovered architecture, documentation inventory, reconciliation findings, Registry proposals, report, agent search efficiency, and all applicable product surfaces.
- Keep endpoint/database checks conditional on actual project behavior and record non-applicability explicitly.

## Acceptance Criteria

The enterprise hardening initiative is complete only when all of the following hold for the same source revision and contract:

- The enterprise verification profile returns `COMPLETE`.
- No required surface is silently skipped or exempted.
- Supported fixture precision is at least 95% and recall is 100%.
- Every finding has evidence and provenance; unsupported analysis is explicit and quantified.
- Workflow interruption, resume, idempotency, concurrency, cancellation, and migration checks pass.
- The default and enterprise configuration profiles are documented and validated.
- The default Registry agent and an alternate configured Registry agent pass their bounded-assistance contract.
- Real CLI and MCP package checks pass.
- Real-browser UI checks pass with zero automated failures and explicit human visual approval.
- The agentskit-os dogfood run produces a reproducible, anonymization-safe metric record.
- Documentation, configuration references, release notes, and structural ADR/RFC records are updated.
- Any external issue, PR, or ticket transition is recorded only after explicit authorization and includes the exact verification run ID.
- Residual limitations are visible in the final report; enterprise readiness is not claimed while any required gate is pending.

## Out of Scope

- A hosted multi-tenant service, persistent remote storage, or centralized telemetry backend.
- Automatic code or documentation mutation without a human approval step.
- Perfect resolution of arbitrary reflection, runtime metaprogramming, or generated code without project-provided metadata.
- Full implementation of every future language analyzer in this initiative.
- Replacing specialized security scanners, compilers, test runners, API contract tools, or database migration tools.
- Making the current agentskit-os documentation debt disappear as a prerequisite for improving Doc Bridge; that debt remains a measured consumer outcome.

## Further Notes

- The current agentskit-os dogfood run is evidence for the product but is not a truth set for semantic precision. A separate fixture corpus is mandatory.
- The current baseline and cycle history must remain immutable unless a human explicitly authorizes a baseline replacement.
- The implementation should proceed in vertical slices: common contracts and metrics first, analyzer/coverage next, workflow/profile hardening next, Registry and documentation quality next, and complete CLI/MCP/report validation last.
- Each slice must run the local harness before consuming CI resources. A failed or unavailable required validation blocks completion and must be recorded with the reason.
- The PRD is intentionally language-neutral at the contract boundary while keeping the first production analyzer scope to JS/TS and Markdown.
