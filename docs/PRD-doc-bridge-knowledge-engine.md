# PRD — Doc Bridge Knowledge Engine

## Problem Statement

Real-world projects accumulate knowledge across code, configuration, documentation, history, agent memory and the team's tacit knowledge. Even small projects become confusing; in monorepos or legacy systems, it becomes difficult to know:

- what actually exists in the project;
- how packages, modules, documents and integrations connect;
- who is responsible for each area;
- whether the documentation represents the current code or an outdated intention;
- which components lack documentation, an owner, checks or a fallback;
- which architectural relationships are proven, declared, ambiguous or unknown;
- where structural risks exist, such as excessive centralization, uncovered dependencies or potential single points of failure.

Doc Bridge already provides documentation discovery, AgentHandoff, a deterministic index, query, MCP, gates, doctor, memory and optional AgentsKit integration. However, these capabilities do not yet share a complete model of the project. Observed code, declared documentation, diagnostics, agent workflows and visualization need to converge on a common structure.

The absence of this structure creates three main risks:

1. different surfaces may produce different interpretations of the same repository;
2. agents may fill gaps with unverified inferences;
3. documentation may appear healthy while diverging from the real architecture.

## Solution

Evolve Doc Bridge into a configurable repository knowledge and verification engine, inspired by the experience of ESLint and TypeScript:

1. **Deterministic discovery** collects repository facts using specialized analyzers.
2. **Documentation discovery** organizes documents, ownership, handoffs, checks and declared relationships.
3. **Versioned snapshot** normalizes entities, relationships, evidence, diagnostics and analyzer coverage.
4. **Reconciliation** compares the code-observed graph with the documentation/configuration-declared graph.
5. **Rules engine** turns divergences, gaps and risks into stable, configurable diagnostics.
6. **AgentsKit Registry agents** interpret diagnostics, investigate ambiguous cases and propose improvements without directly editing the project.
7. **Persistent workflow** allows executions to be paused, approved, rejected, corrected and resumed across commands.
8. **Fix engine** applies only deterministic mechanical fixes after human approval.
9. **HTML report** presents architecture, relationships, documentation, problems, evidence, coverage and execution history.
10. **CLI, MCP, CI and HTML** become different reporters and surfaces over the same canonical artifacts.

The first implementation should analyze JavaScript/TypeScript, package managers, workspaces, common configuration, imports/structural dependencies and Markdown. The structure must support future analyzers for other languages without changing the graph envelope or breaking existing contracts.

### Resolved Product Boundaries

- `DiscoverySnapshotV1` is the canonical internal model. The current index, handoffs and future reports are projections of it.
- Existing `DocBridgeConfigV1`, `DocBridgeIndexV1` and `AgentHandoffV1` remain readable and behaviorally compatible.
- The first structural analyzer covers packages, workspaces, source modules, static ES module/CommonJS imports, package dependencies, TypeScript path aliases and statically resolvable exports.
- Dynamic imports, reflection, generated code, dependency injection and runtime wiring are explicit `not-analyzed` or declared-dynamic cases until a dedicated analyzer exists.
- Markdown remains free-form and language-agnostic. Only an optional structured `docbridge` frontmatter block creates machine-verifiable architecture claims.
- The default workflow is deterministic and does not require agents, network access, API keys or a complete configuration.
- The default Registry agent is installed explicitly as source-owned code and is invoked only by an explicit suggestion workflow or configured policy.
- Agent output is always a typed proposal. It cannot directly modify project files or change a deterministic exit status.
- Deterministic fixes are available from the first usable release, but every project-affecting fix requires explicit approval.
- The canonical report is versioned JSON. HTML, CLI, MCP and CI are reporters over that report.
- Configuration uses a single root file in the first release. Package-level overrides are reserved for a later expansion and are not required by the first release.
- New entity and relation kinds may be transported generically, but rules may depend only on kinds with a formal schema.
- Structural SPOF findings are conservative and configurable. Runtime or deployment SPOFs require explicit topology evidence or a future analyzer.

### Contract Boundaries

- `DiscoverySnapshotV1` is the factual, reproducible output of collection and normalization. It contains project identity, source revision, effective configuration hash, tool/analyzer versions, entities, relations, evidence and coverage metadata. It does not contain unapproved agent claims.
- `ReconciliationReportV1` is the canonical evaluation output. It references a snapshot and contains diagnostics, relation/documentation summaries, rule metadata, run metadata and report content hashes.
- `WorkflowRunV1` is the resumable execution record. It contains the run state, input hashes, step statuses, artifact references and append-only transition references.
- `AgentProposalV1` is a non-factual recommendation. It contains the base snapshot/report references, scoped evidence, related diagnostics, rationale, confidence, intended changes, origin and validation checks.
- `FixProposalV1` is an approval-bound mechanical change. It contains the base revision, effective configuration hash, affected-file hashes, preconditions, diff, postconditions, approval record and application status.
- All versioned artifacts have a schema version and deterministic content hash. A Git revision is the source revision when available; otherwise the source content hash is used.
- A `check` exits successfully when no configured blocking diagnostic exists. Integrity failures always block. Informational and warning diagnostics do not block by default; `strict` and configurable warning thresholds may change that policy.
- Workflow transitions are append-only and limited to declared valid transitions. Paused states support interactive continuation; retries create a new attempt while preserving prior artifacts and history.

### Release Phases

1. **Stabilization:** freeze contracts, identity, provenance, diagnostics, hashing, persistence, compatibility and state transitions.
2. **Restructuring:** introduce the shared engine, JS/TS analyzer, Markdown declarations, reconciliation and rule execution without removing current surfaces.
3. **First usable release:** provide zero-friction discovery, `check`, map/report HTML, deterministic mechanical fixes, approval and recovery.
4. **Assisted intelligence:** add the Registry curator agent, unresolved-case investigation, documentation proposals and agent-backed workflows.
5. **Expansion:** add external analyzers, extension packages, new languages, runtime/deployment topology and broader plugin APIs.

## User Stories

1. As a developer, I want to run discovery without creating configuration first, so that I can understand a chaotic repository with no initial friction.
2. As a developer, I want discovery to be read-only by default, so that exploring an unfamiliar project cannot modify it.
3. As a developer, I want the first discovery to detect JavaScript/TypeScript sources, package managers, workspaces, tests, configuration files and Markdown documentation, so that I receive an initial map of the project.
4. As a developer, I want discovery to produce a proposed configuration, so that I can review detected assumptions before making them official.
5. As a developer, I want the proposed configuration to be created only after explicit approval, so that automatic detection never silently changes project policy.
6. As a developer, I want one root configuration with a reserved path for future package overrides, so that monorepos have a clear policy without requiring many competing configuration files in the first release.
7. As a developer, I want safe defaults and built-in modes, so that the tool is useful before I learn its entire configuration model.
8. As a developer, I want to select analyzers, rules, severity, presets, exclusions and agents, so that the engine matches the maturity and constraints of my project.
9. As a developer, I want configuration precedence to be predictable, so that CLI flags, root configuration, presets and defaults do not conflict silently.
10. As a developer, I want the existing documentation quality validation to remain available as a rule pack, so that new architecture checks do not replace working documentation checks.
11. As a developer, I want the engine to identify packages and modules from the codebase, so that the architecture map is grounded in observed project structure.
12. As a developer, I want documents to declare the components and relations they describe, so that important architectural claims can be checked deterministically.
13. As a documentation author, I want to use a small optional structured block in Markdown frontmatter, so that prose remains natural while selected claims become machine-verifiable.
14. As a documentation author, I want Markdown content to remain language-agnostic, so that documentation in Portuguese, English or other languages works for any supported code language.
15. As a developer, I want configuration to declare global or dynamic relations, so that external services, event buses, queues and runtime wiring can be represented when static analysis cannot prove them.
16. As a developer, I want entities to have stable semantic IDs, so that renames and path changes do not appear as false deletion and recreation events.
17. As a developer, I want aliases for renamed entities, so that the system can preserve identity across refactors.
18. As a developer, I want relations to carry provenance, so that I can distinguish facts observed in code from claims declared in docs and suggestions proposed by agents.
19. As a developer, I want relations to carry evidence and confidence, so that every architectural conclusion can be inspected and challenged.
20. As a developer, I want the graph to represent both known facts and analysis blind spots, so that an apparently clean report does not imply that every part of the system was analyzed.
21. As a developer, I want a versioned discovery snapshot, so that reports, comparisons and proposals remain reproducible after the repository changes.
22. As a developer, I want snapshots to record source revision, configuration hash, analyzer versions and content hash, so that I can explain exactly how a result was produced.
23. As a developer, I want new entity and relation kinds to be carried generically, so that future analyzers can be added without changing the graph envelope.
24. As an analyzer author, I want a stable analyzer contract that returns normalized facts and evidence, so that analyzers can evolve independently from rules and reporters.
25. As a rule author, I want a stable rule contract that consumes normalized facts and returns diagnostics, so that rules are testable without running agents or rendering HTML.
26. As a developer, I want diagnostics to have stable codes, messages, severity, evidence and remediation hints, so that CI, editors, CLI, MCP and HTML can present the same result.
27. As a developer, I want to classify findings as confirmed, undocumented, stale-or-unverified, conflict, unresolved or not-analyzed, so that the tool does not collapse uncertainty into false certainty.
28. As a developer, I want documentation-only claims without structural evidence to be reported, so that outdated or aspirational architecture does not remain invisible.
29. As a developer, I want code relationships without corresponding documentation to be reported, so that undocumented architecture becomes visible.
30. As a developer, I want ownership, handoff, path and check mismatches to be reported, so that agents and humans are not routed using stale information.
31. As a developer, I want potential structural SPOFs to be reported when graph evidence supports them, so that centralization risks can be investigated early.
32. As a developer, I want the report to distinguish structural SPOFs from operational or runtime SPOFs, so that static analysis does not overclaim production guarantees.
33. As a developer, I want diagnostics to be configurable as off, warning or error, so that each project can calibrate trust in its analyzers.
34. As a developer, I want safe defaults to be non-blocking for initial adoption, so that a chaotic project can begin learning before enforcing policy.
35. As a CI maintainer, I want a strict preset, so that a mature project can make selected documentation and architecture diagnostics blocking.
36. As a developer, I want to run scan, reconcile, check and map independently, so that a failed step can be rerun without repeating the entire workflow.
37. As a developer, I want a single check command that orchestrates configured phases, so that the normal workflow remains simple.
38. As a developer, I want completed steps to be reused when their input, configuration and tool versions are unchanged, so that repeated runs are idempotent and efficient.
39. As a developer, I want runs to survive process termination, so that interactive discovery and agent workflows can resume after a closed terminal or interrupted command.
40. As a developer, I want a changed repository revision to mark an active run stale, so that results from incompatible source states are never silently reused.
41. As a developer, I want the last known good snapshot and report to remain available after a failure, so that an incomplete run never destroys a trusted result.
42. As a developer, I want execution state and artifacts to be persisted locally, so that the core remains usable without a hosted service or database.
43. As a developer, I want concurrent runs to be protected by a local lock, so that two workflows cannot corrupt the same project state.
44. As a developer, I want to use an AgentsKit Registry agent as the default assistant, so that discovery and documentation improvements use a source-owned, provider-agnostic agent.
45. As a developer, I want to select another local AgentsKit agent, so that the engine is not coupled to one agent implementation.
46. As a developer, I want to run the full deterministic workflow without any agent, API key or network, so that core verification remains reliable and private.
47. As a developer, I want agents to receive the snapshot, diagnostics and relevant evidence, so that they investigate the same facts as the deterministic engine.
48. As a developer, I want agents to investigate unresolved relations, stale documentation and documentation gaps, so that ambiguous findings become actionable.
49. As a developer, I want agents to return typed proposals instead of direct writes, so that agent output is reviewable and auditable.
50. As a developer, I want to configure agent capabilities, so that repository reads, network access, shell execution and proposal writes are explicit.
51. As a developer, I want broad read-only access during initial discovery and narrow evidence access during diagnosis, so that discovery is useful while later operations remain scoped.
52. As a developer, I want agent versions, origin, model and capabilities recorded in the run, so that suggestions can be reproduced and reviewed.
53. As a developer, I want the agent to be able to propose structured documentation declarations, so that missing relationships can become verifiable after human review.
54. As a developer, I want agents to be disabled by default in ordinary checks, so that deterministic commands do not unexpectedly incur model cost or network access.
55. As a developer, I want agent suggestions to be explicit through a suggestion command or configured workflow, so that I control when probabilistic analysis occurs.
56. As a developer, I want mechanical fixes to be available from the first release, so that safe generated-artifact and metadata corrections are not deferred.
57. As a developer, I want every fix to produce a logical proposal with a diff and expected file hashes, so that approval is based on a concrete change.
58. As a developer, I want fixes to fail as stale when files change after proposal generation, so that the tool never overwrites newer work.
59. As a developer, I want fixes to apply atomically, so that partial correction cannot leave the project in an unknown state.
60. As a developer, I want approval by CLI, MCP or pull request, so that local and team workflows use the same safety model.
61. As a reviewer, I want to approve or reject logical groups of changes, so that review is manageable without confirming every line separately.
62. As a reviewer, I want content, ownership, topology and configuration proposals to require explicit approval, so that semantic changes never happen silently.
63. As a developer, I want post-approval verification to rerun the relevant analyzers and rules, so that a successful write is not mistaken for a successful correction.
64. As a developer, I want an HTML report that shows the architecture map, relations and diagnostics together, so that I can understand both structure and problems in one place.
65. As a developer, I want a neutral architecture view and an optional diagnostic lens, so that the map remains useful for exploration and for investigation.
66. As a developer, I want to filter by severity, provenance, analyzer, entity, relation and status, so that large projects remain navigable.
67. As a developer, I want to follow upstream and downstream relations, so that I can explore impact and dependencies.
68. As a developer, I want to open evidence from a finding, so that I can move from a visual problem to the responsible file and line.
69. As a developer, I want stable report links for entities, relations and diagnostics, so that findings can be shared in review and CI.
70. As a developer, I want the HTML report to work offline and as a CI artifact, so that project knowledge is portable and does not depend on a hosted viewer.
71. As a developer, I want reports to omit full source snippets by default, so that sharing a report does not unintentionally expose repository contents.
72. As a developer, I want source snippets to be opt-in and configurable, so that local investigation can be more detailed when appropriate.
73. As a developer, I want CLI, MCP, CI and HTML to consume the same canonical report artifacts, so that the answer does not change by interface.
74. As a maintainer, I want existing config, index and handoff contracts to continue working, so that the evolution does not break current consumers.
75. As a maintainer, I want a small synthetic fixture suite and Doc Bridge dogfooding, so that the engine is tested both in isolation and on a real project.

## Implementation Decisions

### Product architecture

- Keep Doc Bridge as a modular monolith and avoid splitting into multiple packages during the stabilization phase.
- Establish a common engine with five conceptual stages: collect, normalize, reconcile, evaluate and report.
- Keep CLI, MCP, CI and HTML as surfaces over shared engine outputs rather than separate implementations of project analysis.
- Preserve the current deterministic Layer 0 and optional AgentsKit Layer 1 model.

### Canonical model

- Introduce a versioned `DiscoverySnapshot` as the common intermediate representation.
- Use generic entities and relations with typed `kind` values, rather than a fixed list of domain-specific top-level fields.
- Keep packages, modules, documents, checks and external systems as initial built-in entity kinds.
- Reserve future kinds such as endpoints, events, queues, databases, actors and deployments without requiring a change to the graph envelope.
- Give entities stable semantic IDs. Use normalized paths as fallback identity and aliases for explicit renames.
- Give relations stable IDs derived from semantic endpoints, relation kind and a discriminator where necessary.
- Record source revision, configuration hash, analyzer versions, pipeline version and content hash in every snapshot.
- Keep `AgentHandoffV1`, `DocBridgeIndexV1` and existing configuration v1 compatible. The snapshot may initially be a new projection rather than an immediate replacement for every existing artifact.
- Keep the snapshot envelope stable while allowing additive, namespaced entity and relation kinds.
- Require formal schemas before rules can depend on a new entity or relation kind.

### Provenance and truth model

- Distinguish `observed`, `declared` and `proposed` provenance.
- Do not promote agent proposals into factual snapshot data before approval.
- Distinguish `confirmed`, `undocumented`, `stale-or-unverified`, `conflict`, `unresolved` and `not-analyzed` outcomes.
- Treat the graph as an evidence-backed model with explicit coverage and blind spots, not as a claim of complete runtime knowledge.
- Use code and configuration as evidence of observed structure, Markdown/configuration declarations as declared intent, and agents as proposal generators.
- Treat code-observed structure as current-state evidence and documentation/configuration as declared or intended state; neither automatically overrides the other during reconciliation.

### Analyzers and rules

- Initial analyzers cover JS/TS repository structure, package metadata, workspaces, imports/dependencies where statically provable, configuration and Markdown.
- Define an analyzer contract that emits normalized facts and evidence without knowing how facts are rendered or enforced.
- Define a rule contract that consumes normalized snapshots and emits stable diagnostics.
- Accept unknown namespaced entity and relation kinds generically, but require a formal schema before a rule can depend on them.
- Add future analyzers by language or ecosystem; do not make the core parser language-specific.
- Keep documentation quality validation as a built-in rule pack alongside graph consistency, freshness, ownership and architecture-risk rules.
- Make analyzer coverage and unsupported areas visible in reports.
- Initial static import analysis includes ES modules, CommonJS, package dependencies, TypeScript path aliases and statically resolvable exports. Unsupported runtime mechanisms are reported explicitly rather than guessed.
- Initial architecture-risk rules report centrality risk and configured critical-path risk. They do not infer production availability or redundancy.
- Diagnostic status is independent from severity. Status describes the finding (`confirmed`, `undocumented`, `stale-or-unverified`, `conflict`, `unresolved` or `not-analyzed`); severity controls policy (`off`, `info`, `warn` or `error`).
- A configured `error` and every integrity failure are blocking. Warnings are non-blocking by default, with strict mode and warning thresholds available as policy settings.

### Documentation declarations

- Support a small optional `docbridge` metadata block in Markdown frontmatter for coverage and explicitly verifiable relations.
- Use configuration for global ownership, aliases, exceptions, external systems and dynamic relations that do not belong to one document.
- Avoid requiring all prose to be structured.
- Detect duplicate or conflicting declarations instead of silently applying precedence when the same fact is expressed incompatibly.
- `covers` references stable entity IDs; relation endpoints reference stable entity IDs; dynamic or external relationships declare their detection mode.
- A document without a `docbridge` block remains valid, searchable and indexable, but makes no explicit architecture claim.

### Configuration and presets

- Keep one root configuration as the default source of policy.
- Reserve package-level overrides for a later expansion, with root policy remaining the baseline.
- Use precedence: explicit CLI flags, root configuration, selected preset and safe built-in defaults in the first release.
- Provide non-blocking defaults, a recommended mode and a strict CI-oriented mode.
- Configure analyzers, rules, severity, ignores, overrides, agents, capabilities, reports and fix policy.
- Do not expose every internal algorithm as configuration.
- Built-in defaults are non-blocking except for invalid configuration, unsafe paths, corrupted artifacts and other integrity failures.
- `recommended` enables useful warnings and selected consistency errors; `strict` is intended for CI and makes explicitly selected rules blocking.
- A future package-override release must add its precedence explicitly without changing the meaning of existing root configuration.
- Critical entities and critical paths are project policy and are declared in configuration; agents may propose them but cannot activate them without approval.

### Persistent workflow

- Persist runs and intermediate artifacts locally under the project’s Doc Bridge state area.
- Model execution states including created, discovering, analyzed, compared, awaiting-agent, proposed, awaiting-approval, validating, delivered, failed, cancelled, stale and superseded.
- Persist step input hashes, output hashes, configuration hash, source revision and tool versions.
- Reuse completed steps only when all relevant hashes and versions match.
- Mark runs stale when repository revision or effective configuration changes.
- Preserve last-known-good artifacts and write new artifacts atomically.
- Use a local lock to prevent conflicting concurrent runs.
- The run manifest is replaced atomically; step artifacts are immutable; transition history is append-only.
- A proposal is invalidated when its source revision, configuration hash or affected-file hashes no longer match.
- The engine does not use a database or event-sourcing framework in the first release.
- Valid transitions are monotonic within an attempt: `created` to `discovering` to `analyzed` to `compared`, then to `awaiting-agent`, `proposed`, `awaiting-approval`, `validating`, `delivered` or `failed` as applicable. `cancelled`, `stale` and `superseded` are terminal outcomes; recovery starts a new attempt linked to the prior run.

### Agents

- Use AgentsKit Registry/source-owned agents as the default agent source.
- Add a dedicated `doc-bridge-curator` agent to the Registry when the specialized workflow is mature enough; existing Registry agents may be delegated for focused work.
- The intended default is a published Registry agent ID selected by configuration. If that agent is not installed or available, assisted workflows report an actionable diagnostic and deterministic workflows remain unaffected.
- Load agents explicitly from local source or an installed Registry agent. Do not download or invoke a remote agent implicitly during `check`.
- Define an `AgentAdapter` boundary so alternative local AgentsKit agents or transports can be added later.
- Pass immutable snapshots, diagnostics and scoped evidence to agents.
- Require typed `AgentProposal` output containing related diagnostics, rationale, confidence, evidence, intended changes and checks.
- Disable network and arbitrary shell access by default.
- Allow broad read-only repository access for initial discovery and scoped evidence access for diagnosis/proposal workflows.
- Keep all agent-driven changes behind explicit approval.
- Agents have explicit capabilities for snapshot reads, evidence reads, repository reads, network, shell and proposal writes. Snapshot/evidence reads and proposal writes are the default; network and shell are disabled.
- Discovery may use broad read-only repository access. Diagnosis and proposal workflows are scoped to relevant evidence by default.
- Agent unavailability never changes deterministic `check` results; explicit suggestion workflows fail with an actionable diagnostic.

### Fixes and approvals

- Implement deterministic fixers from the first release.
- Restrict deterministic fixers to mechanical changes such as regenerating derived artifacts, normalizing metadata and correcting unambiguous local links.
- Keep semantic documentation, ownership, topology and configuration changes as proposals.
- Represent corrections as versioned fix proposals with expected file hashes, preconditions, postconditions, diff and checks.
- Approve changes by logical proposal group through CLI/MCP or pull request.
- Apply approved changes atomically and rerun verification.
- Reject stale proposals when expected file hashes no longer match.
- Approval is recorded against the exact proposal hash and may be performed through CLI, MCP or a pull request.
- Logical proposal groups are the smallest approval unit; individual lines are not approval units.
- Unrelated working-tree changes are allowed, but changes to affected files invalidate the proposal.

### CLI, MCP and HTML

- Provide a simple zero-friction path with discovery, map and check commands.
- Keep specialized commands for scan, reconcile, suggest and fix so interrupted stages can be recovered directly.
- Add MCP tools over the same engine outputs for snapshot, reconciliation, diagnostics, suggestions, report and proposal workflows.
- Generate canonical machine-readable snapshot and report artifacts before rendering HTML.
- Make HTML a deterministic reporter with summary, map, diagnostics, relations, documentation coverage, analyzer coverage, evidence and run metadata.
- Support neutral and diagnostic visual lenses, stable anchors, filtering, search and upstream/downstream exploration.
- Keep reports offline-capable and omit full snippets by default.
- The zero-friction commands are `discover`, `map` and `check`; `discover` may produce a proposed configuration without writing it.
- Specialized commands expose `scan`, `reconcile`, `suggest` and `fix` for recovery and interactive workflows.
- The report supports neutral architecture and diagnostic lenses, filtering by severity/provenance/status, stable anchors, relation traversal and evidence navigation.
- Full snippets are opt-in; paths, line ranges, hashes and bounded context are the default evidence representation.

### Initial proof

- Use small synthetic fixtures to test analyzers, relations, conflicts, states, idempotency, stale runs, approval and recovery.
- Dogfood the complete workflow on Doc Bridge itself.
- Include at least one missing-documentation finding and one declared-but-unobserved relation in the proof scenario.
- The proof must use one temporary synthetic fixture and the real Doc Bridge repository without intentionally modifying the repository's tracked source.

## Testing Decisions

- Tests must verify observable contracts and outputs rather than internal helper structure.
- Preserve existing test conventions: Vitest tests for TypeScript modules and Node contract/smoke tests for packaged CLI, plugin and artifact behavior.
- Test the snapshot schema, stable identity, aliases, unknown namespaced kinds, provenance, evidence and compatibility with existing contracts.
- Test analyzers with focused fixtures covering packages, modules, imports, workspaces, dynamic declarations and unsupported constructs.
- Test reconciliation with confirmed, undocumented, stale-or-unverified, conflict, unresolved and not-analyzed cases.
- Test rule configuration, presets, severity overrides, ignores and blocking behavior.
- Test run persistence, idempotent reuse, stale detection, interruption recovery, last-known-good preservation, atomic writes and lock behavior.
- Test agent adapters with deterministic fake agents; verify that agents receive scoped context and can only produce typed proposals.
- Test proposal approval, rejection, expiration, hash mismatch, atomic apply and post-apply verification.
- Test deterministic fixers with before/after fixtures and repeat execution to prove idempotency.
- Test CLI and MCP parity by comparing their machine-readable outputs against shared engine results.
- Test HTML report generation from fixed artifacts, including filtering metadata, stable anchors, diagnostic lenses and omission of snippets by default.
- Test a synthetic end-to-end fixture from discovery through report, proposal, approval, fix and verification.
- Run an end-to-end dogfood scenario against the Doc Bridge repository without modifying its real source as part of the fixture setup.

### Initial Success Criteria

- Zero-config discovery completes on Doc Bridge and a small chaotic fixture without modifying tracked source files.
- Repeating discovery for the same repository revision and effective configuration produces the same logical snapshot and reuses completed work.
- The initial analyzer detects a real package/module relationship with file and line evidence.
- Reconciliation finds one undocumented relationship and one declared-but-unobserved relationship in a controlled fixture.
- CLI, MCP and JSON expose equivalent diagnostics for the same run.
- The HTML report renders offline from saved artifacts and exposes architecture, relations, diagnostics and analyzer coverage.
- An interrupted run resumes from its last valid stage and preserves the last-known-good report.
- A mechanical fix produces an approval-bound proposal, applies atomically and passes post-apply verification.
- A Registry agent converts an unresolved diagnostic into a typed proposal without direct project mutation.
- Deterministic checks work without an API key, network access or an installed agent.
- Existing tests and public v1 contracts remain passing.

## Out of Scope

- Supporting every programming language in the first release.
- Full runtime tracing or production observability ingestion.
- Claiming complete runtime architecture from static source analysis.
- Automatic semantic rewriting of documentation without approval.
- Automatic ownership changes or topology changes without approval.
- Auto-merge of agent-generated changes.
- Implicit network access, remote agent execution or hidden Registry calls during deterministic checks.
- A multi-agent swarm or autonomous delegation graph in the first release.
- A hosted SaaS control plane or database-backed run store.
- Splitting the project into multiple npm packages before the common engine contracts stabilize.
- A general-purpose arbitrary plugin runtime before analyzer, rule and reporter contracts are proven.
- Full parity with Archify’s rendering, animation, export and presentation features.
- Deployment topology and operational SPOF claims without explicit deployment evidence or analyzers.

## Further Notes

- The product promise is not that every unknown disappears. The reliable promise is that known facts, contradictions, unsupported areas and unresolved questions become visible.
- The most important architectural invariant is that deterministic facts are never silently replaced by probabilistic agent output.
- The most important UX invariant is low-friction adoption: a project should gain useful discovery before it has a mature configuration.
- The most important extensibility invariant is additive evolution: new analyzers and entity kinds should fit the existing graph envelope, while breaking semantic changes require a new contract version.
- The first milestone should stabilize the common engine and artifacts before adding external plugin APIs or a large visual feature set.
- Product and implementation questions not covered by these boundaries are implementation details unless they change a public contract, safety property, source-of-truth rule or release-phase commitment.
