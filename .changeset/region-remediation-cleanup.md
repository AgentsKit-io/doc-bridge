---
"@agentskit/doc-bridge": major
---

Replace CLI/MCP whole-file fix contracts with RemediationV1 region edits and
DecisionV1 settled rejection. Fresh findings and exact review bindings are
required; local human confirmation authorizes CLI decisions, while MCP cannot
approve or apply. Legacy index/snapshot hashes are migration guidance only:
regenerate indexes and analysis artifacts explicitly. Configure memory rule
paths with intelligence.memory.rulesDir; explicit paths never add defaults.
See docs/migration/1.x-to-2.0.md before upgrading consumers.

Reject reserved session-export and bootstrap-delta memory adapters that 1.x accepted with warnings.
