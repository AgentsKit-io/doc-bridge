---
title: Ollama chat demo
description: Run the optional local chat layer with Ollama after deterministic routing.
---

# Ollama chat demo (Layer 1)

Zero-cloud path for grounded `ak-docs chat` and `ak-docs ask --chat`.

## Prerequisites

```bash
# Terminal 1 — model server
ollama serve

# Terminal 2 — models
ollama pull llama3.2
ollama pull nomic-embed-text

# Layer 1 peers (once per repo)
npm i -D @agentskit/doc-bridge \
  @agentskit/rag @agentskit/ink @agentskit/adapters @agentskit/memory react
```

## Config

Copy [`examples/ollama-chat.config.ts`](../examples/ollama-chat.config.ts) or merge into your `doc-bridge.config.ts`:

```ts
intelligence: {
  enabled: true,
  adapter: {
    provider: 'ollama',
    model: 'llama3.2',
    baseUrl: 'http://127.0.0.1:11434',
    options: { embedModel: 'nomic-embed-text' },
  },
  chat: { enabled: true, handoffFirst: true },
  retriever: { enabled: true, mode: 'agentskit-rag' },
}
```

## Run

```bash
ak-docs index
ak-docs rag ingest
ak-docs ask "who owns auth?" --chat    # one-shot; handoffFirst when package id matches
ak-docs chat                            # Ink terminal UI
```

`handoffFirst` (default) prepends deterministic AgentHandoff JSON when the question mentions a known package id — visible in the chat transcript before the model answer.

## Smoke test

```bash
pnpm smoke:ollama
```

Skips gracefully if Ollama is down or peers are missing (safe for CI as optional job).

## Troubleshooting

| Error | Fix |
|-------|-----|
| `Intelligence provider request failed` | `ollama serve` not running |
| `Optional peer "@agentskit/rag" is not installed` | Install Layer 1 peers (see above) |
| Empty chat response | Pull models: `ollama pull llama3.2` |
| Slow first `rag ingest` | Normal — embeds entire corpus locally |
