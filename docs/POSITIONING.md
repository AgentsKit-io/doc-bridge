# doc-bridge positioning

This document is the source of truth for **how we talk about doc-bridge** in README, issues, RFCs, and external posts.

## One-liner

**Agent-first documentation infrastructure for any project** — deterministic routing and handoffs, optional intelligence, any doc site, any LLM provider.

## What we are

- A **task router for coding agents** (where to edit, what to read first, which checks to run)
- A **bridge** between agent corpus (dense markdown) and human corpus (wiki, Fumadocs, Docusaurus, …)
- A **modular toolkit**: CLI, MCP, plugins, optional chat, optional memory — install only what you need
- **Provider-agnostic** and **offline-capable** at the core (Layer 0 needs no API key)

## What we are not

- Not an AgentsKit product brochure
- Not a LangChain-style mega-wiki with RAG bolted on
- Not a hosted doc chat SaaS (bring your own adapter if you want chat)
- Not a replacement for your human documentation site

## Primary persona

**Engineering teams with real code ownership** — monorepos first, but any repo with modules/domains and docs.

Secondary: solo devs, libraries, internal platforms, non-JS stacks (markdown + config are universal).

## AgentsKit under the hood

| Public message | Internal reality |
|----------------|------------------|
| "Works with any provider" | AgentsKit `Adapter` interface |
| "Optional semantic search" | AgentsKit `Retriever` (+ local BM25 fallback planned) |
| "Optional doc maintenance agents" | AgentsKit `Runtime` + Registry agents |
| "Battle-tested at scale" | AgentsKit OS is consumer #1 |

**Rule:** User-facing docs lead with **your repo, your docs, your gates**. AgentsKit appears in "Powered by" / "Advanced" / contributor docs — not in the hero.

## Comparison to wiki + RAG (LangChain-class)

| Dimension | Wiki + RAG | doc-bridge |
|-----------|------------|------------|
| Primary user | Human learner | Coding agent executor |
| Discovery | Search / embed | Handoff JSON + graph index |
| Correctness | Best-effort retrieval | Deterministic index + CI gates |
| Token efficiency | Multi-chunk context | One handoff per task |
| Vendor lock-in | Often framework + hosted chat | Layer 0 is pure OSS; adapter is yours |
| Human docs | The whole product | Plugin-linked; chat can cite them |

## Feature modularity

Everything except Layer 0 is optional:

```
required:  index builder, CLI, MCP handoff tools, gate presets
optional:  fumadocs | docusaurus | … plugins
optional:  chat search (any adapter)
optional:  memory ingest adapters
optional:  classification + auto-doc PRs
optional:  Playbook / Registry ecosystem federation
```

Defaults should work in a **plain git repo with markdown** and no `npm` workspaces.

## Human documentation

Human wikis remain first-class:

- **Plugins** map MDX/Markdown routes → `humanDoc` in handoffs
- **Chat** (optional) retrieves from both agent and human corpora
- **Gates** validate cross-links agent ↔ human

Agents should prefer handoffs for *action* and chat/RAG for *explanation*.

## Documentation style guide (for contributors)

1. Examples use **generic** names (`auth`, `billing`, `api-gateway`) — not `os-core`, `os-headless`, unless in an AKOS-specific appendix
2. Quick starts must run **without** AgentsKit API keys
3. "Ecosystem" sections (Playbook, Registry, AKOS) live under **Optional integrations**
4. Issues label `ecosystem` vs `core` — core must not depend on AKOS repos
5. Competitive framing: vs **wiki+RAG pattern**, not vs LangChain the company

## Success metrics

- Zero-key path: init → index → `query --agent` in &lt; 2 minutes
- Handoff resolves correct `editRoots` in a foreign monorepo fixture test
- Fumadocs + Docusaurus fixture repos pass human-guide gate
- AKOS adopts without regression (consumer #1, not spec owner)