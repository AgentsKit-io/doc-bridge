# Playbook Feedback Promotion

doc-bridge can feed durable documentation learnings back into public patterns, but promotion must be explicit and reviewable.

## Finding Template

```md
---
type: Playbook Finding
source: doc-bridge
visibility: public-candidate
license: CC-BY-4.0
---

# Finding title

## Context

What happened, where it was observed, and why it matters.

## Evidence

Links to public docs, issue numbers, or redacted local references.

## Proposed Playbook Change

The smallest pattern, checklist, or raw doc update that should be drafted.

## Safety Review

- [ ] No secrets
- [ ] No private customer names
- [ ] No private repository paths
- [ ] Attribution preserved
```

## Promotion Pipeline

```yaml
id: playbook-feedback-promotion
version: 1
trigger:
  manual: true
  schedule: weekly
  onContentHashDrift: optional
steps:
  - id: collect
    reads:
      - ".agent-memory/**/*.md"
      - "docs/for-agents/**/*.md"
  - id: scan
    checks:
      - secrets
      - pii
      - private-paths
  - id: draft
    delegate: knowledge-promoter
    output: draft-pr
  - id: verify
    checks:
      - attribution-cc-by-4
      - doc-bridge-gates
  - id: review
    requiresHuman: true
mergePolicy:
  autoMerge: false
```

## Doc Bridge Pattern (published)

Full pattern: [`docs/playbook/doc-bridge-pattern.md`](../playbook/doc-bridge-pattern.md)

Export for Playbook PR:

```bash
ak-docs playbook pattern --text > doc-bridge-pattern.md
```

The pattern describes the trilogy:

- `AgentHandoff`: precise editing route for coding agents.
- OKF docs: knowledge files that can be linted and indexed.
- Self-describe artifacts: `llms.txt`, `capabilities.json`, and content hashes for discovery.

Memory-sourced findings still use `ak-docs memory promote --pr` — human review owns merge, licensing, and final wording.
