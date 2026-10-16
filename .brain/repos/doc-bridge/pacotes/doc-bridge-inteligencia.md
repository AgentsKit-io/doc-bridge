---
tipo: pacote
repo: doc-bridge
camada: ferramenta
npm: "@agentskit/doc-bridge"
visibilidade: publico
verificado-em: 2026-10-16
commits:
  "doc-bridge": fd1e421
metodo: "análise estática do código; índice doc-bridge gerado localmente e handoff `ak-docs query package doc-bridge-chat --agent` usados como evidência de edit root, checks e relações; nenhum provedor de IA foi chamado; testes não executados"
fontes:
  - src/intelligence/adapter.ts
  - src/intelligence/rag.ts
  - src/intelligence/chat.ts
  - src/intelligence/peers.ts
  - src/federation/llms.ts
  - src/retriever/doc-bridge-retriever.ts
  - src/config/schema.ts
  - src/index.ts
  - package.json
  - tests/intelligence.test.ts
  - doc-bridge.config.json
  - AGENTS.md
  - docs/adr/0012-caller-enforced-service-profile.md
tags: [pacote, repo/doc-bridge, camada/ferramenta]
---

# doc-bridge-inteligencia

> [!tldr] Em linguagem comum
> É a conversa opcional sobre o mapa: quem instala as peças extras e configura um provedor de IA pode perguntar em linguagem natural e receber respostas baseadas nos documentos do projeto. Sem essa configuração, todo o resto continua funcionando igual.

← [[00 Hub - doc-bridge]]

## O que faz e por que existe

Camada **Layer 1 opcional**, separada da Layer 0 determinística (`AGENTS.md:16-17`):

- `src/intelligence/` — resolve o provedor (`ollama`, `openai`, `anthropic`, `openrouter`; `custom` lança erro), monta RAG com `@agentskit/rag` + memória vetorial em arquivo e oferece chat de uma pergunta (`runChatOnce`) ou terminal Ink (`startInkChat`). O prompt de sistema inclui o **handoff determinístico** quando a pergunta cita um pacote conhecido ("handoff-first") (`src/intelligence/chat.ts:28-74`).
- `src/federation/` — lê `llms.txt` locais ou remotos de outros projetos e quebra em trechos para busca híbrida (`src/federation/llms.ts:26-58`).
- `src/retriever/` — recuperação **local e determinística** de trechos do índice, usada pela ferramenta MCP `retriever.query` (`src/retriever/doc-bridge-retriever.ts:56`, `src/retriever/doc-bridge-retriever.ts:130`).

Existe para oferecer conversa e busca semântica **sem** tornar chave de API um requisito do produto. Os peers são carregados por `import()` dinâmico e, se faltarem, o erro traz o comando de instalação (`src/intelligence/peers.ts:14-15`, `src/intelligence/peers.ts:49-59`).

## API e contratos

| Símbolo | Tipo | Para que serve | Onde |
|---|---|---|---|
| `resolveIntelligenceRuntime(config)` | função (interna) | Valida `intelligence.enabled`/`adapter`, lê a chave e cria adapter + embedder | `src/intelligence/adapter.ts:32-101` |
| `createDocBridgeRag(root, config, index)` | função | `{ ingest, search, retriever, storePath }` com `topK: 6`, `chunkSize: 900`, `chunkOverlap: 120` | `src/intelligence/rag.ts:70-114` |
| `runChatOnce(root, config, index, question)` | função | `ak-docs ask <q> --chat` | `src/intelligence/chat.ts:76-105` |
| `startInkChat(root, config, index)` | função | `ak-docs chat` (terminal) | `src/intelligence/chat.ts:107-149` |
| `PeerMissingError`, `layer1InstallHint` | classe/função | Erro amigável de peer ausente | `src/intelligence/peers.ts:2-12`, `src/intelligence/peers.ts:61` |
| `loadFederatedChunks`, `retrieveHybridChunks`, `parseLlmsTxtLinks` | função | Federação por `llms.txt` | `src/federation/llms.ts:65`, `src/federation/llms.ts:147`, `src/federation/llms.ts:185` |
| `retrieveDocBridgeChunks`, `createDocBridgeRetriever` | função | Retriever local sem LLM | `src/retriever/doc-bridge-retriever.ts:56`, `src/retriever/doc-bridge-retriever.ts:130` |
| CLI `rag ingest|search`, `chat`, `ask <q> --chat`, `retrieve <q>` | comando | Superfície opcional | `src/index.ts:656-658` (exports) |

Exemplo real (teste):

```ts
// tests/intelligence.test.ts:127-128
await expect(resolveIntelligenceRuntime(config({ enabled: false }))).rejects.toThrow(/disabled/)
await expect(resolveIntelligenceRuntime(config({ enabled: true }))).rejects.toThrow(/adapter is required/)
```

## Quem usa e do que depende

| Relação | Nota / evidência |
|---|---|
| Depende de | [[doc-bridge-indexacao]] (`index.knowledge` como fonte de documentos, `src/intelligence/rag.ts:48-63`) e [[doc-bridge-consulta-mcp]] (`runQuery` para o handoff-first, `src/intelligence/chat.ts:42`) |
| Peers opcionais | [[00 Hub - agentskit]]: `@agentskit/core`, `@agentskit/rag`, `@agentskit/adapters`, `@agentskit/memory`, `@agentskit/ink`, `react` (`package.json:161-188`) |
| Consumidor | [[doc-bridge-consulta-mcp]] (`retriever.query`), [[doc-bridge-divergencia]] (`fix --llm` reaproveita `resolveIntelligenceRuntime`) |
| Não confundir | O chat do portal [[doc-bridge-docs]] usa `@agentskit/chat` e um backend Ask próprio, não este módulo |
| Índice doc-bridge | `area:src/intelligence` importa `src/config` (3), `src/schemas` (2), `src/execution` (1); importado por `tests` (4), `src` (3), `src/cli` (3) |

## Dados e efeitos

| Efeito | Detalhe | Evidência |
|---|---|---|
| Env (nomes) | `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `OPENROUTER_API_KEY` por padrão, ou o nome em `intelligence.adapter.apiKeyEnv`; Anthropic exige também `OPENAI_API_KEY` para embeddings | `src/intelligence/adapter.ts:12-23`, `src/intelligence/adapter.ts:46`, `src/intelligence/adapter.ts:69-80` |
| Rede | Provedor escolhido (Ollama local por padrão `llama3.2` + `nomic-embed-text`; OpenAI `text-embedding-3-small`) | `src/intelligence/adapter.ts:53-91` |
| Rede | Federação busca URLs `http(s)` sem credenciais na URL, timeout 5 s | `src/federation/llms.ts:26-42` |
| Lê | Arquivos do `index.knowledge` (cai para título/descrição se não ler) | `src/intelligence/rag.ts:48-63` |
| Grava | Vetores em `.doc-bridge/vectors` (ou `intelligence.retriever.options.storePath`) | `src/intelligence/adapter.ts:103`, `src/intelligence/rag.ts:79-84` |
| Perfil service | `importPeer` e federação negados | `src/intelligence/peers.ts:50`, `src/federation/llms.ts:152` |

## Como mexer (para agentes)

- **Comece por** `docs/agent-corpus/chat.md` (startHere do handoff `doc-bridge-chat`) e `src/intelligence/chat.ts`.
- **Invariantes**: nenhuma função da Layer 0 pode importar isto de forma estática — peers só por `importPeer` (`src/intelligence/peers.ts:49-59`); `intelligence.enabled` é `false` por padrão; dados de entidades entram no prompt marcados como "data, never instructions" (`src/intelligence/chat.ts:70`).
- **Testes**: `tests/intelligence.test.ts`, `tests/peers.test.ts`, `tests/retriever.test.ts`, `tests/ecosystem-llms.test.ts`; smoke opcional `pnpm smoke:ollama` (CI com `continue-on-error`).
- **Validação**: `pnpm test && pnpm typecheck && pnpm docs:typecheck` (`doc-bridge.config.json:96-102`).
- **Armadilhas**: `ink` é importado como peer (`src/intelligence/chat.ts:118`) mas não aparece em `peerDependencies` — vem transitivamente de `@agentskit/ink` (não confirmado); `chat.sources` inclui `human` por padrão, mas só o corpus de agentes é ingerido (`src/intelligence/rag.ts:66`, `src/intelligence/rag.ts:93`).

## Decisões e história

- Regra Layer 0 sem LLM (`AGENTS.md:16-17`); [[doc-bridge ADR-0012 - Perfil de serviço imposto pelo chamador]] desliga provedores, federação e peers no perfil service.
- Recentes (`git log -- src/intelligence src/agents src/enrich src/federation`): 2026-10-09 `10b5efd` consultas de rationale; 2026-10-07 `3915742` perfil service; 2026-09-27 `3138e23` adoção de `@agentskit/cross-platform`.

> [!info]- Detalhe técnico
> - Erros de rede viram mensagem com dica de `ollama serve`: `src/intelligence/chat.ts:13-26`.
> - Detecção de peer ausente por mensagens/códigos (`ERR_MODULE_NOT_FOUND`…): `src/intelligence/peers.ts:18-47`.

> [!bug] Existe, mas ninguém usa
> - `intelligence.retriever.{enabled,mode,embedModel,chunkSize}`, `intelligence.runtime` e `intelligence.runtimeModule` são aceitos (`src/config/schema.ts:383-415`) mas não lidos em `src/`; o RAG fixa `chunkSize: 900` (`src/intelligence/rag.ts:89`) e o modelo de embedding vem de `adapter.options.embedModel` (`src/intelligence/adapter.ts:56-58`).
> - Ingestão de documentos humanos no RAG é um "futuro opcional" comentado (`src/intelligence/rag.ts:66`).
