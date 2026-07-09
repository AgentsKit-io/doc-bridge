# doc-bridge positioning

Source of truth for README, issues, RFCs, and external posts.

## One-liner

**Human↔agent documentation bridge for any repo** — deterministic handoffs, doc-site links, memory→docs promotion, optional AgentsKit RAG/chat.

## What we are

- A **bridge** between agent corpus (dense markdown) and human corpus (Fumadocs, Docusaurus, plain md, …)
- A **task router** for coding agents (`startHere`, `editRoots`, `checks`, `humanDoc`)
- A **memory pipeline** that turns local agent memory into draft project docs (HITL)
- A **modular toolkit**: CLI, MCP, plugins, optional intelligence — install only what you need
- **Offline-capable at the core** (Layer 0 needs no API key)

## Four loops

| Loop | Job |
|------|-----|
| **Act** | Handoff JSON / MCP so agents edit the right place and run the right checks |
| **Bridge** | Keep agent docs ↔ human docs linked and gate-validated |
| **Learn** | Ingest Cursor/Claude-style memory → classify → promote drafts |
| **Explain** | Optional RAG + terminal chat (`@agentskit/rag` + `@agentskit/ink`) with `handoffFirst` |

## What we are not

- Not a replacement for your human documentation site
- Not a hosted doc chat SaaS
- Not an AgentsKit brochure in the hero
- Not “just AGENTS.md” (we *compose* with it)

## Primary persona

Engineering teams with real ownership (monorepos first). Secondary: solo libs, internal platforms, any stack with markdown.

## AgentsKit relationship (dogfood, not force)

| Public message | Reality |
|----------------|---------|
| Layer 0 works alone | Pure `@agentskit/doc-bridge` + zod |
| Optional chat/RAG | Peers: `@agentskit/rag`, `@agentskit/ink`, `@agentskit/adapters`, `@agentskit/memory` |
| Ecosystem proof | Public consumers — not private monorepos as marketing |

**Rule:** User-facing docs lead with **your repo**. AgentsKit appears as opt-in intelligence and ecosystem consumers.

### Public consumers

- [AgentsKit for-agents](https://www.agentskit.io/docs/for-agents) — agent-first package corpus
- [Registry](https://registry.agentskit.io/) — agent discovery / onboarding companion
- [Playbook llms.txt](https://playbook.agentskit.io/llms.txt) — patterns + federation source

## Comparison

| Dimension | Wiki + RAG | AGENTS.md | Context7 | doc-bridge |
|-----------|------------|-----------|----------|------------|
| Primary job | Explain | Static instructions | Library docs | **Act + bridge + memory** |
| Correctness | Best-effort | Manual | Versioned remote | Index + CI gates |
| Your monorepo ownership | Weak | Weak | N/A | **First-class** |
| LLM required | Usually | No | No for setup | **No for Layer 0** |

## Feature modularity

```
required:  index, CLI, MCP handoff tools, gate presets
optional:  fumadocs | docusaurus | plain-markdown plugins
optional:  memory ingest → promote
optional:  @agentskit/rag + ink chat (intelligence.*)
optional:  Playbook / Registry federation
```

## Success metrics

- Zero-key: `init` → `index` → `query --agent` in &lt; 2 minutes
- Handoff from ownership-only config (no monorepo plugin required)
- Human guide links gate green on fixture adapters
- Chat/RAG path documented with optional peers
- Public consumers cited (for-agents, Registry, Playbook)
