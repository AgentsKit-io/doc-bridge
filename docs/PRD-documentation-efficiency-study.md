---
title: Documentation Quality and Agent Efficiency Study
description: Longitudinal, anonymized, evidence-based measurement of documentation quality, repository knowledge discovery, agent efficiency, and delivery outcomes across the AgentsKit ecosystem.
---

# Documentation Quality and Agent Efficiency Study

## Problem Statement

Doc Bridge and the surrounding AgentsKit repositories have evolved through multiple discovery, architecture, documentation, report, and verification cycles. The project has accumulated useful historical evidence, but the evidence is not yet organized as a single controlled study.

The current evidence can show that individual checks passed, but it cannot by itself answer the product questions that matter:

- Does Doc Bridge help a human or agent find the correct knowledge faster?
- Does the structured corpus reduce context size and token consumption without reducing accuracy?
- Does better documentation reduce implementation errors, clarification requests, and rework?
- Does the documentation become more correct, coherent, complete, current, and maintainable over time?
- Does Registry-agent assistance improve discovery and documentation review enough to justify its cost?
- Which improvements belong in Doc Bridge, and which belong in the consumer repository documentation?
- Can the results be reproduced and presented as an anonymized enterprise case study?

Historical cycles are also not fully comparable. Some earlier runs contain timing, report, discovery, or agent-search measurements, while other measures were not yet collected. Treating incomplete historical data as a controlled experiment would overstate the results.

The study therefore needs to preserve all available historical evidence while starting a controlled baseline with fixed tasks, fixed model versions, repeatable scenarios, explicit ground truth, anonymized artifacts, and criterion-level validation.

## Solution

Create a longitudinal study framework that measures both the Doc Bridge product and the documentation of six consumer repositories: five public AgentsKit ecosystem repositories and one anonymized private consumer repository. The private consumer repository must never be named in public study artifacts.

The study has two evidence tracks:

- **Historical track:** preserves and normalizes all existing measurements from the beginning of the Doc Bridge work. Missing measurements remain missing and are never reconstructed by inference.
- **Controlled track:** starts with a new baseline and compares equivalent real tasks under three scenarios using two pinned model versions.

The controlled scenarios are:

- **Scenario A — Repository only:** the agent receives the repository and its existing documentation through the normal agreed workflow, without Doc Bridge knowledge artifacts.
- **Scenario B — Deterministic Doc Bridge:** the agent receives the versioned Doc Bridge index, summaries, architecture evidence, documentation inventory, and query surfaces.
- **Scenario C — Doc Bridge plus Registry agent:** the agent receives the deterministic Doc Bridge artifacts and bounded, evidence-grounded proposals from the configured AgentsKit Registry agent.

The study must measure more than pass/fail. It records discovery cost, token use, latency, evidence quality, task correctness, documentation quality, rework, and operational cost. It uses hard gates for safety and correctness plus comparative metrics for improvement.

Doc Bridge remains the deterministic authority for observable repository facts. Registry agents may discover, classify, explain, and propose. They may not approve their own output, silently mutate documentation, or turn an unsupported inference into a confirmed fact.

## Study Goals

1. Establish an auditable historical record of the Doc Bridge evolution without fabricating unavailable data.
2. Establish a controlled baseline for human and agent knowledge discovery.
3. Quantify token, latency, context, and interaction savings.
4. Quantify changes in task success, implementation precision, rework, and clarification requirements.
5. Measure documentation correctness, completeness, clarity, freshness, and maintainability separately.
6. Measure the quality and cost of Registry-agent assistance separately from deterministic analysis.
7. Identify whether an observed improvement came from Doc Bridge, documentation changes, agent assistance, or model variance.
8. Produce anonymization-safe evidence suitable for internal decisions and a future public case study.
9. Define an objective stopping rule so the improvement cycle does not continue indefinitely without new information.

## User Stories

### Study and governance

1. As a product owner, I want historical Doc Bridge cycles preserved, so that the final study shows how the product evolved from its beginning.
2. As a product owner, I want historical and controlled evidence separated, so that observational data is not presented as causal proof.
3. As a study operator, I want every run tied to a source revision, configuration hash, artifact hashes, model version, agent version, and run ID, so that results are reproducible.
4. As a reviewer, I want every metric to have a definition, unit, collection method, and known limitation, so that the numbers are interpretable.
5. As a reviewer, I want missing data represented as missing or not analyzed, so that unavailable evidence cannot be mistaken for a positive result.
6. As a product owner, I want a versioned study protocol, so that changes to the methodology do not silently invalidate comparisons.
7. As an operator, I want a fixed validation budget per round, so that the study does not waste CI, tokens, or generated data.
8. As a reviewer, I want decisions, exemptions, approvals, and baseline changes recorded, so that the study is auditable.
9. As a product owner, I want a stopping rule, so that the study can reach a defensible conclusion.
10. As a maintainer, I want all study-owned temporary artifacts cleaned after each round, so that repeated cycles do not pollute repositories.

### Controlled benchmark

11. As a study operator, I want 24 real tasks across the six repositories, so that the baseline represents multiple repository types and use cases.
12. As a study operator, I want each repository to have discovery, architecture, documentation, and implementation tasks, so that the benchmark covers the complete knowledge workflow.
13. As a study operator, I want each task to define expected outcomes before execution, so that success is not judged after seeing the result.
14. As a reviewer, I want each task to have a validation rubric, so that success, partial success, incorrect results, and incomplete results are distinguishable.
15. As a study operator, I want task variants of comparable difficulty, so that learning effects and task order do not dominate the result.
16. As a study operator, I want fresh sessions and controlled ordering, so that one scenario cannot benefit from context left by another scenario.
17. As a reviewer, I want implementation tasks validated against real acceptance behavior, so that code that merely compiles is not counted as a success.
18. As a reviewer, I want documentation tasks checked against code and runtime evidence, so that plausible prose is not counted as correct automatically.
19. As a reviewer, I want endpoint, database, CLI, MCP, and UI validation applied when the task uses those surfaces, so that the benchmark measures the real artifact.
20. As an operator, I want each task run at least twice during the initial baseline, so that one anomalous model response does not define the result.

### Models and agent assistance

21. As a study operator, I want two pinned model versions, so that the study tests both a lower-cost/lower-capability model and a reference model.
22. As a reviewer, I want provider, model version, parameters, context limits, and tool configuration recorded, so that model changes cannot be confused with product improvements.
23. As a product owner, I want repository-only, deterministic Doc Bridge, and Registry-assisted scenarios separated, so that each layer's contribution is measurable.
24. As a reviewer, I want Registry-agent identity, version, capabilities, prompt contract, and budget recorded, so that assisted results are attributable.
25. As an operator, I want agent timeouts, token budgets, redaction, and bounded output enforced, so that assisted measurements remain safe and affordable.
26. As a reviewer, I want every assisted proposal linked to evidence, so that unsupported agent claims are rejected or labeled unverified.
27. As a human approver, I want semantic documentation suggestions to require approval, so that the agent cannot approve its own output.
28. As a product owner, I want assisted and deterministic results reported as separate evidence classes, so that case-study claims remain honest.

### Documentation quality

29. As a repository owner, I want documentation classified by type and audience, so that a README, ADR, runbook, reference page, and agent instruction are not measured identically.
30. As a repository owner, I want Tier 0 and Tier 1 documentation explicitly identified, so that critical knowledge is prioritized over secondary material.
31. As a reviewer, I want every critical document to have an owner, lifecycle, source of truth, and validation date, so that maintenance responsibility is visible.
32. As a reviewer, I want claims linked to code, configuration, tests, or runtime evidence, so that documentation correctness can be checked.
33. As a reviewer, I want stale documentation detected using content and source evidence, so that dates and filenames alone do not create false findings.
34. As a reviewer, I want missing documentation separated from low-quality documentation, so that remediation is actionable.
35. As a reviewer, I want contradictions between documentation and observed structure identified, so that architectural drift is visible.
36. As a reviewer, I want contradictions between documents identified, so that conflicting guidance is not left for agents to resolve implicitly.
37. As a reviewer, I want redundant or unnecessary documentation identified with evidence, so that reducing document volume does not accidentally remove important knowledge.
38. As a developer, I want critical examples checked for correctness and executability, so that examples improve delivery rather than merely increase a count.
39. As an agent, I want compact, stable, audience-aware knowledge packets, so that I can find the required information without loading the whole repository.
40. As a product owner, I want documentation improvements tracked by round, so that quality gains can be distinguished from changes in document count.

### Efficiency and delivery outcomes

41. As a product owner, I want tokens-to-correct-answer measured, so that context reduction is not confused with useful efficiency.
42. As a product owner, I want time-to-correct-answer measured, so that a smaller response that takes longer is not treated as an improvement.
43. As a reviewer, I want evidence citation rate measured, so that answers grounded in the repository can be distinguished from guesses.
44. As a reviewer, I want clarification requests measured, so that documentation gaps affecting humans and agents are visible.
45. As a reviewer, I want implementation error and rework rates measured, so that documentation improvements are connected to delivery outcomes.
46. As a product owner, I want the cost of Doc Bridge analysis and Registry assistance measured, so that savings in task execution are compared with analysis cost.
47. As a reviewer, I want success rate and safety to be hard constraints, so that token savings cannot compensate for incorrect work.
48. As a product owner, I want confidence intervals or uncertainty ranges where the sample allows them, so that small changes are not presented as certainty.
49. As a reviewer, I want metrics segmented by repository, task type, model, and scenario, so that aggregate averages do not hide regressions.
50. As a product owner, I want external case-study metrics generated only after privacy review, so that internal repository information is not exposed.

## Implementation Decisions

### Study protocol and evidence model

- Create a versioned study protocol separate from the existing Doc Bridge enterprise-hardening PRD.
- Treat the six consumer repositories as the initial study population. Public artifacts identify them only by public project name or anonymized consumer identifier; the private consumer repository is never named.
- Preserve all available historical cycles as observational evidence.
- Start a controlled baseline after the protocol is approved.
- Bind each observation to the source revision, Doc Bridge version, configuration hash, model identity, agent identity when applicable, scenario, task ID, run ID, and artifact hashes.
- Never infer an unavailable historical metric from a related metric.
- Use the existing verification state machine and fail-closed evidence rules.
- Keep `validated`, `partially validated`, `not analyzed`, `blocked`, and `not applicable` distinct in all study reports.

### Task suite

- Define 24 tasks: four per consumer repository, covering discovery, architecture, documentation, and implementation.
- Use real repository tasks with bounded scope and anonymized task identifiers.
- Define expected answer elements, required evidence, permitted scope, side effects, and acceptance checks before any scenario is run.
- Include easy, medium, and difficult cases where possible without changing the underlying acceptance rubric.
- Include at least one task involving documentation/code drift and one involving a missing or unclear document in each repository where applicable.
- Use equivalent task variants or controlled ordering to reduce learning and carry-over effects.
- Validate implementation and documentation outcomes using the repository's real artifact and applicable CLI, MCP, endpoint, database, or browser checks.
- Keep human adjudication available for semantic correctness, with adjudicator decisions recorded separately from agent output.

### Scenarios and models

- Run every task in Scenario A, Scenario B, and Scenario C when the required surface is available.
- Use two pinned model configurations: a lower-cost/lower-capability model and a reference model.
- Record exact model/provider versions, parameters, context limits, enabled tools, and system instructions.
- Use fresh sessions for each independent observation.
- Randomize scenario order when practical, or use balanced counter-ordering when execution constraints require a fixed sequence.
- Record token counts from the provider when available; otherwise record the measurement method and label estimates explicitly.
- Record Registry-agent cost and latency separately from the main agent's cost and latency.

### Documentation quality dimensions

Measure the following dimensions independently:

1. **Correctness:** documented claims agree with observed code, configuration, tests, and applicable runtime behavior.
2. **Completeness:** required knowledge for the declared audience and scope is present.
3. **Clarity:** a human can understand and follow the document without unnecessary interpretation.
4. **Agent efficiency:** an agent can locate and use the knowledge with bounded context and evidence.
5. **Maintainability:** the document has ownership, lifecycle, freshness, source-of-truth metadata, and a validation path.

Do not collapse these dimensions into a single score until the underlying values are visible. If an aggregate score is introduced later, its weighting and rationale must be versioned.

### Tiering and criticality

- Tier 0 includes repository entry points, agent instructions, contribution guidance, security, operations, and other documents required to work safely.
- Tier 1 includes application, package, API, architecture, ADR, runbook, and integration documentation.
- Tier 2 includes secondary guides, reference material, historical material, and supplementary examples.
- Criticality is configurable and may use package centrality, public exposure, operational impact, security impact, and onboarding relevance.
- A lower-tier document may still be critical when a project explicitly declares it so.

### Metrics

The study records metric families separately.

**Discovery and context efficiency**

- input and output tokens;
- estimated tokens when provider counts are unavailable;
- time to first relevant result;
- time to correct answer;
- files, documents, and packages consulted;
- MCP and tool call count;
- response bytes and context bytes;
- context reduction;
- search hit rate and evidence citation rate;
- clarification requests.

**Task and delivery quality**

- task success, partial success, incorrect result, or incomplete result;
- acceptance criteria passed;
- implementation defects;
- documentation defects introduced;
- rework cycles;
- review corrections;
- escaped errors where measurable;
- human adjudication result.

**Documentation quality**

- critical-document coverage;
- package and domain coverage;
- stale documents;
- missing documents;
- code/documentation contradictions;
- document/document contradictions;
- unsupported claims;
- redundant or unnecessary content candidates;
- link and reference validity;
- example presence;
- example validation and execution success;
- owner and lifecycle coverage;
- validation freshness.

**Product and operational efficiency**

- discovery, reconciliation, audit, proposal, and report duration;
- first-render and interaction latency where applicable;
- artifact and chunk sizes;
- memory and CPU where measurable;
- Registry-agent tokens, time, and response size;
- cache reuse;
- interrupted-run recovery time;
- CI and network consumption.

### Interpretation rules

- Token reduction is not a success if task correctness, evidence quality, or safety decreases.
- A documentation count increase is not a success if redundancy, contradiction, or maintenance cost increases.
- A finding reduction is not automatically a success; it may mean a real fix, a narrowed policy, a hidden unsupported area, or an analyzer regression.
- A Registry-agent suggestion is not a corrected document until human approval and post-apply verification exist.
- Aggregate metrics must be accompanied by repository, task, model, and scenario breakdowns.
- Small samples must be reported with uncertainty and not described as conclusive.

### Baseline and longitudinal comparison

- The existing historical record becomes an immutable observational appendix.
- The new controlled baseline is immutable after human approval.
- Baseline replacement requires an explicit audited action and a protocol version change when the task suite or measurement method changes materially.
- Every improvement round compares against the immediately preceding approved round and the original controlled baseline.
- Changes in Doc Bridge, consumer documentation, model, agent, task suite, configuration, and validation environment are recorded as possible confounders.
- A round is invalidated when its source revision, contract, configuration, task definition, model identity, or evidence changes after collection.

### Anonymization and publication

- Store aggregate metrics, categories, stable anonymized identifiers, hashes, versions, timings, counts, and outcomes.
- Do not store repository names, internal paths, document contents, prompts, snippets, credentials, or sensitive agent responses in publication artifacts.
- Keep private evidence separately from publication-safe aggregates when a private audit requires deeper detail.
- Perform a dedicated redaction review before any external publication.
- Public claims must identify whether a result is historical, controlled, deterministic, assisted, observational, or causal.

### Proposed modules and responsibilities

The implementation should reuse existing Doc Bridge and harness capabilities where possible and add only the minimum study-specific modules:

- **Protocol registry:** versions the study protocol, task suite, scenario definitions, model configurations, and scoring rules.
- **Task runner:** executes a task under a declared scenario and captures bounded observations without owning semantic judgment.
- **Observation ledger:** validates and stores anonymization-safe observations tied to evidence hashes.
- **Outcome adjudicator:** applies deterministic acceptance checks and records human semantic adjudication separately.
- **Metric calculator:** computes per-task, per-scenario, per-model, per-repository, and aggregate metrics with uncertainty and regression comparisons.
- **Historical normalizer:** imports existing cycle evidence while preserving missing values and original provenance.
- **Study report generator:** renders longitudinal trends, comparison tables, limitations, and publication-safe aggregates.
- **Verification adapter:** binds the study checks to the existing `ak-verify` contract and state machine.

These modules should expose narrow, versioned interfaces and remain independent of any specific LLM provider. Existing discovery, reconciliation, documentation-audit, Registry-adapter, report, benchmark, and verification-harness modules remain the source of product evidence rather than being duplicated.

### Study phases

#### Phase 0 — Protocol and historical inventory

- freeze the protocol and task definitions;
- inventory all existing historical cycles and metrics;
- classify each historical result as validated, partially validated, not analyzed, blocked, or not applicable;
- define anonymization rules and evidence retention;
- produce the controlled-run contract.

#### Phase 1 — Controlled baseline

- run the 24 tasks across the three scenarios and two models;
- execute each task at least twice;
- collect tokens, time, context, evidence, task outcome, and validation cost;
- calculate baseline metrics and uncertainty;
- obtain human approval for the immutable baseline.

#### Phase 2 — Documentation quality baseline

- classify Tier 0, Tier 1, and Tier 2 documents;
- measure the five documentation dimensions;
- run deterministic code/documentation reconciliation;
- run labeled semantic fixtures through the real reconciliation implementation;
- identify gaps requiring Registry-agent or human semantic review.

#### Phase 3 — Improvement cycles

- select the highest-impact Doc Bridge and documentation corrections;
- record the hypothesis and expected metric movement before changing files;
- make the smallest safe change;
- validate the real artifact;
- rerun the same controlled tasks and repository audits;
- compare against both baselines;
- accept, reject, or roll back the hypothesis based on evidence.

#### Phase 4 — Enterprise and case-study closeout

- close required verification blockers;
- confirm reproducibility and recovery;
- review privacy and anonymization;
- document residual limitations;
- publish internal and, if approved, external aggregate findings;
- stop when the completion criteria are met.

## Testing Decisions

Tests must validate externally observable study behavior, not internal implementation details. Unit tests and compilation are supporting evidence and cannot prove that the study measured the real workflow correctly.

The following modules require focused tests:

- protocol validation, including incompatible versions and incomplete task definitions;
- task-run isolation and scenario binding;
- observation schema validation and anonymization guarantees;
- metric calculations, percentiles, uncertainty, denominators, missing data, and regressions;
- historical import without inventing missing measurements;
- baseline immutability and explicit replacement audit;
- model and Registry-agent provenance binding;
- human adjudication separation from agent output;
- report aggregation and publication redaction;
- verification-harness integration and fail-closed behavior.

The study must also exercise real external behavior:

- run packaged CLI commands rather than only importing functions;
- exercise real MCP sessions when the scenario uses MCP;
- validate real endpoint and database behavior when a task uses them;
- validate report behavior in a real browser when the task includes UI;
- validate documentation examples against the repository's actual commands and outputs;
- rerun unchanged observations to prove deterministic replay and idempotency;
- interrupt and resume at least one representative large-repository run;
- deliberately test unavailable agents, exhausted budgets, invalid output, stale evidence, and blocked environments.

Prior art to reuse includes the existing Doc Bridge benchmark format, semantic reconciliation fixtures, documentation audit, agent-efficiency measurement, verification harness, and dogfood validation cycle. The study must extend these contracts rather than create a parallel definition of evidence.

## Acceptance Criteria

The study framework is complete only when:

1. All available historical cycles are inventoried with original provenance and missing measures preserved as missing.
2. A versioned study protocol and task suite exist, with no unresolved scope or scoring ambiguity.
3. The controlled suite contains 24 real, bounded tasks across the six consumer repositories and four task categories.
4. The three scenarios and two pinned models are executable or explicitly marked not applicable with reasons.
5. Each task has predeclared expected outcomes, acceptance checks, evidence requirements, and adjudication rules.
6. At least two observations per task are collected for the initial baseline, subject to the declared budget.
7. Baseline observations include tokens or labeled estimates, time, context, evidence, task outcome, validation cost, model, scenario, and run provenance.
8. Historical and controlled results are visibly separated in the study report.
9. The five documentation quality dimensions are reported separately for Tier 0, Tier 1, and Tier 2 where applicable.
10. Deterministic documentation/code checks and labeled semantic fixtures report precision, recall, evidence ratio, and limitations.
11. Registry-agent findings include agent identity, version, evidence, budget, provenance, and human approval state.
12. An unchanged rerun is reproducible and idempotent, and at least one interrupted run resumes safely.
13. Study data is anonymization-safe and a privacy check covers reports and generated chunks/artifacts.
14. Every result is tied to a source revision, configuration/protocol hash, artifact hashes, and verification run ID.
15. The study report separates validated, partially validated, not analyzed, blocked, and not applicable evidence.
16. A metric improvement is accepted only when correctness and safety do not regress.
17. The report includes per-repository, per-task-type, per-model, and per-scenario breakdowns.
18. The baseline cannot be replaced implicitly by a normal run.
19. The final report documents costs, limitations, confounders, residual risks, and the next human action.
20. The study stops only after three controlled improvement rounds show no material regression and all enterprise-critical gates are complete, or a human explicitly records a different stopping decision with rationale.

## Proposed Initial Success Targets

Targets below are provisional until Phase 1 produces a statistically useful baseline. They are guardrails, not promises:

- at least 25% reduction in median tokens to a correct answer;
- at least 20% reduction in median time to a correct answer;
- no reduction in task success or evidence citation rate;
- no increase in critical implementation errors or rework;
- 100% Tier 0 coverage for critical repositories;
- zero unresolved critical documentation contradictions;
- at least 90% execution success for critical examples;
- measurable reduction in clarification requests for benchmark tasks;
- measured Doc Bridge and Registry-agent cost lower than the documented value of the saved work, or an explicit qualitative justification.

## Out of Scope

- Retrospectively inventing token, time, or correctness data that was not collected.
- Claiming causal improvement from historical observational records alone.
- Replacing human judgment for semantic correctness, safety, or publication approval.
- Building a hosted telemetry platform or sending private repository content to a central service.
- Requiring every programming language to be supported in the first study.
- Treating report rendering, document counts, package coverage, or unit-test success as proof of documentation quality.
- Automatically rewriting documentation or code without explicit human approval.
- Publishing repository-specific names, paths, contents, prompts, or internal architectural details.
- Using a single aggregate score as the only definition of documentation quality.

## Further Notes

The existing enterprise-hardening PRD defines the product capabilities and verification contract. This PRD defines how to measure the product's effect over time. They are related but intentionally separate: one governs what Doc Bridge must do; the other governs how we prove that it creates value.

The current historical evidence already demonstrates useful deterministic progress in discovery, reconciliation, report loading, agent search, and runtime-wiring classification. It does not yet constitute a complete controlled study of documentation quality or delivery outcomes. The study must preserve that evidence, label its boundaries, and start collecting the missing measures rather than retroactively overinterpreting it.

The primary enterprise claim should eventually be phrased as a bounded, evidence-backed statement such as: “Under the declared protocol, Doc Bridge reduced the measured cost of repository knowledge discovery while maintaining or improving task correctness and evidence quality.” The claim must always include the protocol version, models, repositories, task suite, scenarios, time window, and limitations.
