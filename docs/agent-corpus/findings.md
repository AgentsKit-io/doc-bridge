---
type: module
id: doc-bridge-findings
editRoot: src/findings
humanDoc: /docs/spec/documentation-standard-v1
owner: doc-bridge-maintainers
lifecycle: active
sourceOfTruth: src/findings
validationPath: pnpm test && pnpm typecheck
docbridge:
  covers:
    - area:src/findings
---

# Findings

Owns normalizing internal diagnostics to the ecosystem `Finding` shape. Severity and confidence remain independent.

`findingFromDiagnostic` and `findingsFromDiagnostics` convert `KnowledgeDiagnostic`, `RuleFinding`, and
`DocumentationAuditFinding` into a canonical shape that Code Review, dashboards, and language-model integrations
consume without their own parser. Internal severities (error, warn, info, off) map to ecosystem levels
(high, medium, low, info); critical is never emitted, since documentation findings do not interrupt production.
Confidence derives from finding status: confirmed and undocumented are high-confidence; conflicts and unresolved
are medium; stale or unverified are low; not-analyzed is lowest. Each Finding carries evidence path and line,
remediation text, and source diagnostic code for traceability.
