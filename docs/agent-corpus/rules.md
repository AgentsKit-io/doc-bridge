---
type: module
id: doc-bridge-rules
editRoot: src/rules
humanDoc: /docs/spec/documentation-standard-v1
owner: doc-bridge-maintainers
lifecycle: active
sourceOfTruth: src/rules
validationPath: pnpm test && pnpm typecheck
docbridge:
  covers:
    - area:src/rules
---

# Rules

Owns turning reconciliation diagnostics into severity-carrying findings. One file, `engine.ts`.

`evaluateRules` maps a diagnostic code to a rule id through `diagnosticRules` and gives it a severity.
The eleven rule ids are defined by `RuleIdSchema` in `src/config/schema.ts`, not here, so this area
evaluates ids it does not own: `documentation-quality`, `graph-undocumented-relation`,
`declared-unobserved-relation`, `unresolved-reference`, `conflicting-declaration`,
`not-analyzed-coverage`, `stale-documentation`, `centrality-risk`, `critical-path-risk`, `freshness`
and `ownership`. The mapping is not one-to-one: `OWNERSHIP_GAP` and `OWNERSHIP_PATH_UNOBSERVED` both
become `ownership`, and `IMPORT_CYCLE` and `CENTRALITY_RISK` both become `centrality-risk`.

Severity comes from the mode — `default` reports everything as `info`, `recommended` raises it to
`warn`, `strict` to `error` — with `not-analyzed-coverage` held one step lower in both raised modes,
because a suite that does not exist is not a failure to report. An explicit `severity` override beats
the mode, and an `ignore` entry drops the rule entirely.
