---
title: Continue the development loop
description: Continue indexing and querying after the first Doc Bridge setup.
---

# Install and run

The [Getting started guide](../getting-started.md) is the canonical install,
demo, and first-index path. This page keeps the configuration and development
loop details that follow that first run.

## Development loop

After the canonical setup, use the watch command while editing. The complete
install, index, query, and gate sequence remains in the [Getting started
guide](../getting-started.md#two-minute-path-no-api-key).

```bash
ak-docs index --watch
```

## Related

- [Index and query](./index-and-query.md) — resolve ownership deterministically  
- [Gate and CI](./gate-ci.md) — fail stale context in PRs  
- [MCP for agents](./mcp-agents.md) — wire Cursor / Claude / Codex  
- [Config reference](../spec/config-v1.md)  
- [Examples](../examples.md)  
