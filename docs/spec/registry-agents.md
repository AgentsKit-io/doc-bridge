---
title: Registry agent topology
description: Connect registry agent definitions to Doc Bridge ownership and documentation handoffs.
---

# Registry Agent Topology

doc-bridge exposes deterministic tools; Registry agents can compose them into maintenance flows.

## `doc-curator`

Supervisor flow:

```yaml
id: doc-curator
version: 1
description: Classify documentation changes, draft updates, and verify gates.
inputs:
  diff:
    type: string
  projectRoot:
    type: string
tools:
  - doc-bridge.mcp.handoff.resolve
  - doc-bridge.mcp.doc.search
  - doc-bridge.mcp.doc.get
  - doc-bridge.mcp.gate.status
delegates:
  docsChat:
    agent: docs-chat
    purpose: Answer grounded questions using deterministic search first.
  knowledgePromoter:
    agent: knowledge-promoter
    purpose: Convert accepted findings into draft documentation changes.
  codeReview:
    agent: code-review
    purpose: Review doc-only diffs before human merge.
steps:
  - id: classify
    delegate: docsChat
    input:
      question: "Which docs and owners are affected by this diff?"
  - id: draft
    delegate: knowledgePromoter
    input:
      finding: "${classify.output}"
      mode: draft-pr
  - id: verify
    tool: doc-bridge.mcp.gate.status
    input:
      gates:
        - index-freshness
        - human-guide-links
        - okf-type
  - id: review
    delegate: codeReview
    input:
      diff: "${draft.diff}"
mergePolicy:
  autoMerge: false
  requiresHuman: true
```

## Runtime Notes

- The MCP server is local: `ak-docs mcp`.
- The flow must not require a private repository shape.
- `knowledge-promoter` may draft PR content, but must never merge.
- `code-review` runs after gates so reviewers see deterministic failures first.
- Future RAG mode should inject `createDocBridgeRetriever(index)` and keep exact handoff resolution ahead of semantic results.
