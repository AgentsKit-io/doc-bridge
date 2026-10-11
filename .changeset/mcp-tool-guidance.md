---
"@agentskit/doc-bridge": patch
---

Return MCP `instructions` on `initialize`, built only from the tools the configuration enables, and rewrite the `doc.search`, `doc.get` and `handoff.resolve` descriptions and input property descriptions to say when to use each tool and what it returns. Deterministic and key-free; no change in agent behaviour is claimed until the study is re-run.
