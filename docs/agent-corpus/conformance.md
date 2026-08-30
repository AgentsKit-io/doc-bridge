---
type: module
id: doc-bridge-conformance
editRoot: src/conformance
humanDoc: /docs/spec/documentation-standard-v1
---

# Conformance

Owns versioned documentation-standard rules and evidence. Do not turn missing evidence into a passing score.

Documentation audits are a separate, configurable check after discovery and reconciliation:

```bash
ak-docs audit documentation --json
```

Use the audit metrics and evidence to review quality, coverage, stale declarations, and structure/documentation gaps. Generated documents are freshness-boundary checks only; semantic findings marked `not-analyzed` require the configured Registry agent or a human review.
