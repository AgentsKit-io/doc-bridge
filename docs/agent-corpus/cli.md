---
type: module
id: doc-bridge-cli
editRoot: src/cli
humanDoc: /docs/spec/cli
---

# CLI

Owns public `ak-docs` commands and output modes. Keep JSON output versioned and text output readable.

The documentation audit is a deterministic post-discovery check:

```bash
ak-docs audit documentation --json
```

It reports measurable quality, coverage, stale, contradiction, redundancy, and structure-gap signals. `not-analyzed` means semantic evidence is missing; it is not a pass.
