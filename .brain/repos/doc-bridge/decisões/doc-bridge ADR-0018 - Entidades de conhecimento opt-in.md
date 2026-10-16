---
tipo: adr
repo: doc-bridge
camada: ferramenta
visibilidade: publico
status: proposto
verificado-em: 2026-10-16
commits:
  "doc-bridge": f8824f1
metodo: "leitura do ADR e conferência estática da implementação citada; nada foi executado; auditado em 2026-10-16 (auditoria v2: referências e afirmações reconferidas contra o código)"
fontes:
  - docs/adr/0018-opt-in-knowledge-entities.md
  - src/config/schema.ts
  - src/index-builder/build-index.ts
  - src/entities/extract.ts
  - src/query/load-index.ts
tags: [adr, repo/doc-bridge, camada/ferramenta]
---

# doc-bridge ADR-0018 - Entidades de conhecimento opt-in

> [!tldr] Em linguagem comum
> Quem quiser pode pedir que o mapa inclua também decisões, conceitos e mudanças históricas como itens próprios, com evidência; quem não pedir recebe exatamente o mesmo arquivo de antes.

← [[00 Decisões - doc-bridge]]

## Status e datas

**Proposto** em 2026-10-08 no arquivo (`docs/adr/0018-opt-in-knowledge-entities.md:3-4`), embora o código já implemente a decisão (commit `57da536`, 2026-10-08).

## A decisão

Seção `knowledgeEntities` versionada separadamente, só com `index.knowledgeEntities.enabled`; exige hash semântico; handoffs inalterados; aliases exatos; histórico por janela local de primeiro-pai limitada; entradas armazenadas não têm fonte git implícita; frescor local opt-in usa rebuild completo (`docs/adr/0018-opt-in-knowledge-entities.md:18-28`).

## Contexto

Decisões, conceitos e mudanças precisam de evidência versionada para memória e consultas; leitores estritos antigos rejeitam campos novos (`docs/adr/0018-opt-in-knowledge-entities.md:11-14`).

## Consequências

Implementação: config `index.knowledgeEntities.{enabled,maxCommits,sinceTag}` (`src/config/schema.ts:43-47`), extração no build (`src/index-builder/build-index.ts:143-144`), recusa com hash legado (`src/index-builder/build-index.ts:174`), `git` endurecido (`src/entities/extract.ts:222`), frescor por rebuild (`src/query/load-index.ts:78-79`).

## Pacotes afetados

[[doc-bridge-indexacao]], [[doc-bridge-consulta-mcp]] (`why`, `knowledge.*`), [[doc-bridge-memoria-vault]].

## Substitui / substituído por

Nenhum; estendido por [[doc-bridge ADR-0019 - Fonte de memória e evidência de entidade]].

## Fonte

`docs/adr/0018-opt-in-knowledge-entities.md`
