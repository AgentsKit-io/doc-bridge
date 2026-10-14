---
"@agentskit/doc-bridge": minor
---

Add the opt-in `reference-findings` gate. When `gates.include` names it, it diffs the head against the snapshot in `gates.referenceFindings.base` and fails while reference findings are pending, using the same count as the Action's `fail-on-findings`. It fails closed when no usable base is configured. While it fails, `ak-docs index` writes neither the index nor `llms.txt` and exits 1. `--allow-pending-findings` publishes anyway and records the override in the index's new `publication` field, which is outside `contentHash`. `ak-docs mcp` warns at start and never blocks. The gate is in no preset, so nothing changes unless a repository opts in.
