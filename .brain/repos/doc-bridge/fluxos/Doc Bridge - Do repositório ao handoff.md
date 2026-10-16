---
tipo: fluxo
repo: doc-bridge
camada: ferramenta
visibilidade: publico
verificado-em: 2026-10-16
commits:
  "doc-bridge": fd1e421
metodo: "análise estática; fluxo reproduzido localmente com `node bin/ak-docs.js index` e `ak-docs query package doc-bridge-index --agent` neste repo"
fontes:
  - src/cli/program.ts
  - src/config/load-config.ts
  - src/discovery/repository.ts
  - src/index-builder/build-index.ts
  - src/query/load-index.ts
  - src/query/query.ts
  - src/query/handoff.ts
  - src/mcp/server.ts
  - doc-bridge.config.json
tags: [fluxo, repo/doc-bridge, camada/ferramenta]
---

# Doc Bridge - Do repositório ao handoff

> [!tldr] Em linguagem comum
> O projeto vira um mapa; quando alguém pergunta onde atuar, recebe o documento por onde começar, as pastas que pode editar e os comandos que provam que a mudança está certa.

← [[00 Hub - doc-bridge]]

## Entrada e resultado

Entrada: um repositório com `doc-bridge.config.json` (ou `.ts/.mjs`, lido estaticamente). Resultado: `.doc-bridge/index.json`, `llms.txt`, `.doc-bridge/capabilities.json` e, sob demanda, um `AgentHandoffV1` com `startHere`, `readBeforeEditing`, `editRoots`, `checks`, `humanDoc`, `related` e `explain`.

| Etapa | O que acontece | Quem atua |
|---|---|---|
| 1. Config | `loadConfig` acha e valida o config; a raiz do projeto é o diretório do config (`src/config/load-config.ts:127`) | [[doc-bridge-indexacao]] |
| 2. Descoberta | Walk limitado → módulos, documentos, pacotes, áreas, fatos, relações → `DiscoverySnapshotV1` com `sourceRevision` (git ou hash de conteúdo) (`src/discovery/repository.ts:169-243`) | [[doc-bridge-indexacao]] |
| 3. Gate de publicação (opt-in) | Se `reference-findings` estiver selecionado e falhar, nada é gravado, salvo `--allow-pending-findings` | [[doc-bridge-gates-qualidade]] |
| 4. Build | Corpus + ownership → `lookup`/`handoffs`; projeção de recuperação; grava índice, `llms.txt`, capabilities (`src/index-builder/build-index.ts:171-320`) | [[doc-bridge-indexacao]] |
| 5. Frescor | Cada consulta recarrega e confere hash dos inputs, léxico e métricas; índice velho → `IndexStaleError` "Run: ak-docs index" (`src/query/load-index.ts:28-33`, `src/query/load-index.ts:73-103`) | [[doc-bridge-consulta-mcp]] |
| 6. Resolução | `ak-docs query … --agent` ou MCP `handoff.resolve` → `runQuery` → handoff (ownership → alias → caminho) (`src/query/handoff.ts:84-90`, `src/mcp/server.ts:409-419`) | [[doc-bridge-consulta-mcp]] |
| 7. Execução das checks | Responsabilidade do consumidor (agente ou CI); o motor não executa `checks` | consumidor |

Exemplo real (este repo, `ak-docs query package doc-bridge-index --agent`): `startHere: docs/agent-corpus/INDEX.md`, `editRoots: [src/index-builder]`, `checks: [pnpm test, pnpm typecheck, node bin/ak-docs.js index]` — os mesmos valores declarados em `doc-bridge.config.json:47-52`.

**Erros e recuperação**: sem config → `ConfigNotFoundError` ("run ak-docs init"); sem índice → `IndexNotFoundError`; índice com hash inválido → regenerar; índice acima de `RETRIEVAL_MAX_ENTRIES` → estreitar `corpus.*.include/exclude` (`src/index-builder/build-index.ts:270-275`).

> [!info]- Detalhe técnico
> - Despacho da CLI: `src/cli/program.ts:1565-1577`.
> - Fallback de checks pelo gerenciador de pacotes quando nada declara: `HandoffOptions.root` (`src/query/handoff.ts:19-25`).
> - Orçamento de contexto do agente: `src/query/query.ts:34-40`.

O que não foi confirmado pertence a [[Dúvidas abertas]]; capacidades condicionais ou sem chamador encontrado vão para [[Capacidades não usadas]].
