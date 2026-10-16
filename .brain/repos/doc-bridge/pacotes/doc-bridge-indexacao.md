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
  - "doc-bridge/src/index-builder/build-index.ts"
  - "doc-bridge/src/index.ts"
tags: [repo/doc-bridge, pacote]
---

# doc-bridge-indexacao

> [!tldr] Em linguagem comum
> É o cartógrafo: lê o projeto e transforma pastas, documentos e responsáveis num mapa consultável.

← [[00 Hub - doc-bridge]]

## Papel e contratos

Módulo interno. Separa leitura, extração de fatos, grafo e materialização do índice; os adaptadores reconhecem sites humanos e monorepos.

| Pergunta | Resposta |
|---|---|
| O que entrega | `discoverRepository`, `buildDocBridgeIndex`, variantes com armazenamento, capabilities e llms.txt. |
| Quem usa | [[doc-bridge-consulta-mcp]], [[doc-bridge-divergencia]], [[engine-runner]] em [[00 Hub - alexandria]]. |
| Do que depende | Configuração validada, parsers, plugins npm/JS/TS/Markdown, adaptadores Fumadocs/Docusaurus/VitePress/Starlight/Nextra e pnpm/Nx. |
| Dados lidos e gravados | Lê fontes permitidas e docs; grava índice, capabilities e llms.txt configurados. A API particionada recebe `RepositoryReadV1` e `ArtifactIOV1`. |

> [!bug] Existe, mas ninguém usa
> O suporte a Obsidian e entidades de conhecimento é opt-in; não se deve supor que todo consumidor habilite esses recursos.

> [!info]- Detalhe técnico
> - `doc-bridge/src/index-builder/build-index.ts:169`.
> - `doc-bridge/src/index-builder/build-index.ts:177`.
> - `doc-bridge/src/index-builder/build-index.ts:279`.
> - `doc-bridge/src/index-builder/build-index.ts:337`.
> - `doc-bridge/src/index.ts:249`.
> - `doc-bridge/src/index.ts:1000`.
