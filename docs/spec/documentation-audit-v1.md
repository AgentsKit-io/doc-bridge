---
title: Documentation audit v1
description: Configurable deterministic checks for documentation quality and agreement with repository structure.
---

# Documentation audit v1

Run the repository audit after discovery and reconciliation:

```bash
ak-docs audit documentation --json
ak-docs audit documentation --text
```

The JSON report is versioned and content-hashed. It includes criterion-level evidence, metrics, blocking findings, generated-document freshness boundaries, and limitations.

## Configuration

Configure the optional `audit.documentation` block in `doc-bridge.config.json`:

```json
{
  "audit": {
    "documentation": {
      "criticalPaths": ["src/cli/**", "src/mcp/**"],
      "generatedPaths": ["docs/generated/**"],
      "minWords": 20,
      "requiredSections": ["Usage", "Examples"],
      "requireExamples": true,
      "exactDuplicates": true
    }
  }
}
```

- `criticalPaths` makes high-confidence contradictions and missing structure documentation blocking.
- `generatedPaths` excludes generated documents from manual quality checks and reports freshness as `not-analyzed`; configure the generator's real check separately.
- `requiredSections`, `minWords`, and `requireExamples` are opt-in to avoid false positives for indexes and short reference files.
- `exactDuplicates` detects identical normalized bodies. It does not claim that similar prose is redundant.

The audit reuses the canonical discovery snapshot and reconciliation report. A finding is not proof that prose is wrong unless its evidence and confidence say so. `not-analyzed` is intentional and includes semantic contradiction, unnecessary content, and agent-review boundaries. A document title is satisfied by a Markdown level-one heading, a `title` frontmatter field, or a visible HTML `<h1>` used by README-style documents.
