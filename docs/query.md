---
title: Deterministic query engine
description: Ownership and documentation lookup rules for contributors changing Doc Bridge query behavior.
---

# Deterministic query engine

The query layer reads the generated `.doc-bridge/index.json`; it does not scan
the repository again and does not call a model. Keep exact ownership resolution,
ranked document search, and handoff output deterministic.

## Ownership

- Source: `src/query/**`
- Index contract: `src/schemas/doc-bridge-index.ts`
- Handoff contract: `src/schemas/agent-handoff.ts`
- CLI consumers: `src/cli/program.ts`
- MCP consumers: `src/mcp/server.ts`

## Before editing

Read [DocBridgeIndex v1](./schemas/doc-bridge-index-v1.md), [AgentHandoff v1](./schemas/agent-handoff-v1.md), and the [CLI reference](./spec/cli.md).

## Checks

```bash
pnpm test
pnpm typecheck
node bin/ak-docs.js index
node bin/ak-docs.js query package doc-bridge-query --agent
```

Preserve stable JSON fields and text output. A breaking contract change requires
a schema version rather than an implicit reinterpretation of v1.
