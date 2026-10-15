---
"@agentskit/doc-bridge": minor
---

Add the opt-in `reference-findings` gate. When `gates.include` names it, it diffs the local working tree against the snapshot in `gates.referenceFindings.base` and fails while reference findings are pending, using the same selection and diff as the Action's `fail-on-findings`. It fails closed when no usable base is configured, when the base has no documents or citations, when a resource limit cut the base or head analysis short, and when the base's project identity, configuration hash or analyzer versions differ from the head. While it fails, `ak-docs index` writes neither the index nor `llms.txt` and exits 1. `--allow-pending-findings` publishes anyway and records the override, with a reason code, in the index's new `publication` field, which is outside `contentHash`; older readers reject an index carrying it. `ak-docs mcp` starts serving, then warns and never blocks. The gate is in no preset, so nothing changes unless a repository opts in.
