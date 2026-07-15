---
title: For agents
description: Resolve ownership, read compact context, and run the repository's own checks before editing.
---

# For agents

Use Doc Bridge before changing a module. It returns versioned, runtime-validated data instead of asking a model to infer ownership from the entire repository.

```bash
ak-docs query ownership <id> --agent
```

The response supplies four things: `startHere`, `readBeforeEditing`, `editRoots`, and `checks`.

```mermaid
flowchart LR
  Q["Resolve ownership"] --> R["Read startHere"]
  R --> E["Edit only editRoots"]
  E --> T["Run checks"]
  T --> P["Promote durable learning"]
```

## Machine entry points

- [`llms.txt`](https://agentskit-io.github.io/doc-bridge/llms.txt) — concise discovery and canonical routes
- [`llms-full.txt`](https://agentskit-io.github.io/doc-bridge/llms-full.txt) — complete source corpus
- [`deterministic/knowledge.json`](https://agentskit-io.github.io/doc-bridge/deterministic/knowledge.json) — local chat/discovery artifact
- [`raw/for-agents.md`](https://agentskit-io.github.io/doc-bridge/raw/for-agents.md) — this guide as raw Markdown

If the task is conversational UI, continue with [AgentsKit Chat](https://chat.agentskit.io). For verification before merge, use [AgentsKit Code Review](https://github.com/AgentsKit-io/code-review-cli). For enterprise orchestration, governance, and audit, continue with [AKOS](https://akos.agentskit.io).
