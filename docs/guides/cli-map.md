---
title: CLI map
description: Every ak-docs command with copy-paste examples — Layer 0 core and optional Layer 1 intelligence.
---

# CLI map

Binary: **`ak-docs`** · Package: **`@agentskit/doc-bridge`**

Full flags: [CLI reference](../spec/cli.md)

## Global flags

```bash
ak-docs --help
ak-docs --version
ak-docs --config path/to/doc-bridge.config.json <command>
ak-docs <command> --agent    # machine JSON (handoffs)
ak-docs <command> --text     # human text
ak-docs <command> --json     # JSON where supported
```

---

## Layer 0 — no API key

### Bootstrap

```bash
ak-docs init
ak-docs init --demo
ak-docs init --no-demo
ak-docs init --scaffold-workspaces
ak-docs bootstrap agent-docs
ak-docs validate-config
ak-docs validate-handoff path/to/handoff.json
ak-docs demo --text
ak-docs demo --fixture monorepo --text
```

### Index & doctor

```bash
ak-docs index
ak-docs index --watch
ak-docs doctor --text
ak-docs doctor --badge
ak-docs doctor --write-badge
ak-docs gate run
ak-docs gate run index-freshness
ak-docs conformance run documentation-standard-v1 --text
```

### Query & search

```bash
ak-docs query package auth --agent
ak-docs query ownership auth --text
ak-docs query intent onboard --agent
ak-docs search "abort signal" --agent
ak-docs list packages --text
ak-docs list intents --text
ak-docs ask "where do I change billing?"
ak-docs retrieve "authentication boundaries"
```

### MCP

```bash
ak-docs mcp
ak-docs mcp install --cursor
ak-docs mcp install --claude
```

### Memory pipeline

```bash
ak-docs memory ingest
ak-docs memory classify
ak-docs memory promote
ak-docs memory promote --pr --dry-run
ak-docs memory promote --pr
```

Deep dive: [Memory pipeline](./memory-pipeline.md)

### Ecosystem / playbook

```bash
ak-docs registry topology
ak-docs playbook draft
ak-docs playbook pattern --text
```

---

## Layer 1 — optional AgentsKit peers

Requires `intelligence.enabled` + peers (`@agentskit/rag`, `@agentskit/ink`, …).

```bash
ak-docs rag ingest
ak-docs rag search "how does auth work?"
ak-docs chat
ak-docs ask "how does auth work?" --chat
```

Walkthrough: [Chat and RAG](../chat-and-rag.md) · [Ollama demo](../ollama-demo.md)

---

## Suggested sequences

### New repo in 2 minutes

```bash
pnpm add -D @agentskit/doc-bridge
ak-docs init
ak-docs index
ak-docs query package example --agent
ak-docs doctor --text
```

### Agent about to edit

```bash
ak-docs query ownership <id> --agent
# read startHere → edit editRoots → run checks
```

### Turn session notes into docs

```bash
ak-docs memory ingest
ak-docs memory classify
ak-docs memory promote --pr --dry-run
```

### PR gate

```bash
ak-docs index
ak-docs gate run
# commit generated index if your repo treats it as source-of-truth
```

## Related

- [Install and run](./install-and-run.md)  
- [Index and query](./index-and-query.md)  
- [MCP for agents](./mcp-agents.md)  
- [Memory pipeline](./memory-pipeline.md)  
- [CLI reference](../spec/cli.md)  
