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
      "exactDuplicates": true,
      "defaultTier": "tier-2",
      "tierRules": [
        { "pattern": "docs/agent-corpus/**", "tier": "tier-0", "critical": true },
        { "pattern": "docs/adr/**", "tier": "tier-1" }
      ],
      "requiredCriticalMetadata": ["owner", "lifecycle", "sourceOfTruth", "validationPath"]
    }
  }
}
```

- `criticalPaths` makes high-confidence contradictions and missing structure documentation blocking.
- `generatedPaths` excludes generated documents from manual quality checks and reports freshness as `not-analyzed`; configure the generator's real check separately.
- `requiredSections`, `minWords`, and `requireExamples` are opt-in to avoid false positives for indexes and short reference files.
- `exactDuplicates` detects identical normalized bodies. It does not claim that similar prose is redundant.
- `defaultTier` and ordered `tierRules` classify every included document as `tier-0`, `tier-1`, or `tier-2`. A document may override the configured tier with `tier` frontmatter; `critical: true` frontmatter or a rule marks it critical.
- Critical documents are checked for `owner`, `lifecycle`, `sourceOfTruth`, and `validationPath` metadata. `requiredCriticalMetadata` can reduce this list for a declared project profile.

The audit reuses the canonical discovery snapshot and reconciliation report. A finding is not proof that prose is wrong unless its evidence and confidence say so. `not-analyzed` is intentional and includes semantic contradiction, unnecessary content, and agent-review boundaries. A document title is satisfied by a Markdown level-one heading, a `title` frontmatter field, or a visible HTML `<h1>` used by README-style documents.

## Independent quality dimensions

Each document receives an assessment instead of one opaque quality score. The machine-readable report exposes `documentAssessments` and independent status counts for:

- correctness: deterministic reconciliation can expose evidence, but semantic correctness remains `not-analyzed` until code, configuration, tests, and applicable runtime behavior are reviewed;
- completeness: structural signals such as title and configured required sections are reported as `partial`, never as semantic completeness;
- clarity: title and basic structure are measurable, while human readability remains `not-analyzed`;
- agent efficiency: title and example presence are signals only; retrieval usefulness and task success require the controlled study;
- maintainability: owner, lifecycle, source-of-truth, and validation-path metadata are directly measurable.

Example presence and example correctness are separate. The audit reports `example.present`; `example.validation` remains `not-analyzed` unless a real validation flow supplies evidence. Similar prose, unnecessary content, and document/document semantic contradictions are intentionally deferred to the Registry-agent and human-adjudication path.
