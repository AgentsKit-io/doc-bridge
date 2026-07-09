# Chat and RAG (Layer 1)

Layer 0 (index, handoff, MCP, gates, memory pipeline) never requires an LLM.

Layer 1 is **opt-in** and dogfoods public AgentsKit packages:

| Peer | Role |
|------|------|
| `@agentskit/rag` | Chunk, embed, ingest, search |
| `@agentskit/memory` | `fileVectorMemory` under `.doc-bridge/vectors` |
| `@agentskit/adapters` | Chat model + embedder (ollama, openai, …) |
| `@agentskit/ink` | Terminal chat UI (`ak-docs chat`) |
| `react` | Required by Ink |

## Trust model

1. **`handoffFirst`** (default): if the question mentions a known package id, attach deterministic AgentHandoff context before the model answers.
2. RAG retrieves from the indexed agent corpus (and configured sources).
3. CI gates still decide merge truth — chat never auto-writes docs.

## Commands

```bash
ak-docs rag ingest
ak-docs rag search "<query>"
ak-docs chat
ak-docs ask "<question>" --chat
```

Missing peers produce an install hint instead of a silent no-op.

**Ollama walkthrough:** [ollama-demo.md](./ollama-demo.md) · `pnpm smoke:ollama`

## Providers

| provider | Notes |
|----------|--------|
| `ollama` | Best zero-cloud path; uses `ollamaEmbedder` (e.g. `nomic-embed-text`) |
| `openai` | Chat + `text-embedding-3-small` |
| `openrouter` | Chat via OpenRouter |
| `anthropic` | Chat; embeddings currently need `OPENAI_API_KEY` or use ollama |

## Config sketch

See `examples/fumadocs-with-chat.config.ts`.

## When not to use Layer 1

- You only need routing for coding agents → Layer 0 is enough.
- You already have another RAG stack → keep Layer 0 handoffs; skip peers.
