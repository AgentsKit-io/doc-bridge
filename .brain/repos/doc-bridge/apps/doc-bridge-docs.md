---
tipo: app
repo: "doc-bridge"
camada: ferramenta
visibilidade: publico
verificado-em: 2026-10-16
commits:
  "doc-bridge": ca2c233
metodo: análise estática; nada foi executado
fontes:
  - "doc-bridge/apps/docs/next.config.mjs"
  - "doc-bridge/wrangler.toml"
  - "doc-bridge/package.json"
  - "doc-bridge/.github/workflows/pages.yml"
tags: [repo/doc-bridge, app]
---

# doc-bridge-docs

> [!tldr] Em linguagem comum
> É o site onde humanos leem os guias do Doc Bridge; o mesmo conteúdo também gera arquivos que agentes conseguem consultar.

← [[00 Hub - doc-bridge]]

## Papel e contratos

App editorial em `apps/docs`, sem `package.json` separado; dependências e scripts pertencem à raiz.

| Pergunta | Resposta |
|---|---|
| O que entrega | Páginas Next/Fumadocs, export estático e artefatos de documentação. |
| Quem usa | Visitantes e agentes; [[doc-bridge-consulta-mcp]] é a outra porta de entrada ao motor. |
| Do que depende | Next, React, Fumadocs, [[00 Hub - agentskit-chat]] e build do motor. |
| Dados lidos e gravados | Lê docs e artefatos gerados; produz `apps/docs/out`; Wrangler serve assets, sem banco declarado nessa configuração. |

> [!info]- Detalhe técnico
> - `doc-bridge/apps/docs/next.config.mjs:1`.
> - `doc-bridge/apps/docs/next.config.mjs:10`.
> - `doc-bridge/wrangler.toml:8`.
> - `doc-bridge/package.json:107`.
> - `doc-bridge/.github/workflows/pages.yml:35`.
