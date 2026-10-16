---
tipo: pacote
repo: "doc-bridge"
camada: ferramenta
visibilidade: publico
verificado-em: 2026-10-16
commits:
  "doc-bridge": ca2c233
metodo: análise estática; nada foi executado
fontes:
  - "doc-bridge/src/intelligence/chat.ts"
  - "doc-bridge/src/index.ts"
  - "doc-bridge/src/agents/registry-adapter.ts"
  - "doc-bridge/package.json"
tags: [repo/doc-bridge, pacote]
---

# doc-bridge-inteligencia

> [!tldr] Em linguagem comum
> É a conversa opcional sobre o mapa: usa os mesmos documentos para responder perguntas com IA, quando o usuário instala e configura essa parte.

← [[00 Hub - doc-bridge]]

## Papel e contratos

Camada opcional; a indexação e o handoff determinísticos continuam independentes de provedor e chave.

| Pergunta | Resposta |
|---|---|
| O que entrega | `createDocBridgeRag`, `runChatOnce`, `startInkChat` e adaptador do Registry. |
| Quem usa | Usuários da CLI de chat; [[doc-bridge-docs]] usa sua própria superfície Chat. |
| Do que depende | Peers opcionais de [[00 Hub - agentskit]]: core, rag, adapters, memory, ink e React; [[00 Hub - agentskit-registry]] no enriquecimento. |
| Dados lidos e gravados | Ingere documentos no mecanismo RAG configurado; chamadas de IA dependem do provedor escolhido. Chaves não são requisito da camada determinística. |

> [!info]- Detalhe técnico
> - `doc-bridge/src/intelligence/chat.ts:76`.
> - `doc-bridge/src/intelligence/chat.ts:84`.
> - `doc-bridge/src/intelligence/chat.ts:107`.
> - `doc-bridge/src/index.ts:656`.
> - `doc-bridge/src/agents/registry-adapter.ts:1`.
> - `doc-bridge/package.json:195`.
