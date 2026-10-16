---
tipo: adr
repo: doc-bridge
camada: ferramenta
visibilidade: publico
status: aceito
substituido-por: [ADR-0011]
verificado-em: 2026-10-16
commits:
  "doc-bridge": fd1e421
metodo: "leitura do ADR e conferência estática da implementação citada; nada foi executado"
fontes:
  - docs/adr/0006-registry-semantic-grounding.md
  - src/agents/registry-adapter.ts
tags: [adr, repo/doc-bridge, camada/ferramenta]
---

# doc-bridge ADR-0006 - Ancoragem da revisão semântica do Registry

> [!tldr] Em linguagem comum
> Agentes de IA do catálogo podem explicar e classificar problemas na documentação, mas só se apontarem para um problema e uma evidência que realmente existem; a sugestão continua sendo só sugestão até uma pessoa aprovar.

← [[00 Decisões - doc-bridge]]

## Status e datas

Aceito em 2026-08-30 (`docs/adr/0006-registry-semantic-grounding.md:3-4`). Cláusula de aprovação estreitada por [[doc-bridge ADR-0011 - Findings e remediação por região]] (`docs/adr/0006-registry-semantic-grounding.md:22-24`) — por isso `substituido-por` parcial.

## A decisão

Propostas de agentes do Registry precisam citar um diagnóstico conhecido e ao menos uma evidência presente no snapshot/relatório fornecido, com identidade e versão do agente instalado; o agente é trocável por configuração; a saída é consultiva e aplicar uma correção exige aprovação humana e verificação pós-aplicação (`docs/adr/0006-registry-semantic-grounding.md:11-13`).

## Contexto

Separar julgamento semântico de fatos determinísticos sem impedir revisão assistida (`docs/adr/0006-registry-semantic-grounding.md:17-20`).

## Consequências

Afirmações sem suporte falham fechado no adaptador; o caminho de mutação continua único. Implementação: `validateGrounding` (`src/agents/registry-adapter.ts:99-112`) e checagem de id instalado vs. configurado (`src/agents/registry-adapter.ts:203-214`).

## Pacotes afetados

[[doc-bridge-enriquecimento]], [[doc-bridge-divergencia]].

## Substitui / substituído por

Parcialmente substituído por ADR-0011 (apresentação em branch isolada não é aceitação).

## Fonte

`docs/adr/0006-registry-semantic-grounding.md`
