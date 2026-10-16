---
tipo: adr
repo: doc-bridge
camada: ferramenta
visibilidade: publico
status: aceito
substituido-por: [ADR-0023]
verificado-em: 2026-10-16
commits:
  "doc-bridge": fd1e421
metodo: "leitura do ADR e conferência estática da implementação citada; nada foi executado"
fontes:
  - docs/adr/0010-versioned-change-set-and-semantic-identity.md
  - src/diff/change-set.ts
  - src/diff/version-routing.ts
  - src/index-builder/content-hash.ts
tags: [adr, repo/doc-bridge, camada/ferramenta]
---

# doc-bridge ADR-0010 - ChangeSet versionado e identidade semântica

> [!tldr] Em linguagem comum
> Comparar duas versões do projeto gera uma lista padronizada de mudanças; um documento só é acusado de citar algo "quebrado" se a remoção for provada, e a identidade de um artefato depende do conteúdo, não de quando ou em que commit foi gerado.

← [[00 Decisões - doc-bridge]]

## Status e datas

Aceito em 2026-10-06 (`docs/adr/0010-versioned-change-set-and-semantic-identity.md:3-4`). A regra de emissão de *changed-reference* foi substituída por [[doc-bridge ADR-0023 - Afirmações sobre referências alteradas]].

## A decisão

- `ChangeSetV1` (via `ak-docs diff`) com repositório/branch, revisões base/head, pacotes, estado de release, mudanças ordenadas (`symbol`, `module`, `doc-path`, `cli-command`, `cli-flag`, `config-key`, `signature`, `package`), hash semântico e versão do algoritmo; rename só com evidência explícita (`docs/adr/0010-versioned-change-set-and-semantic-identity.md:17`).
- Impacto usa as relações dos **dois** snapshots; `broken-reference` exige remoção provada; dono ambíguo vira `ambiguous-reference` (`docs/adr/0010-versioned-change-set-and-semantic-identity.md:19`).
- Hash semântico separa identidade de proveniência (revisão, timestamp, estatística de reuso) e é versionado; leitores nunca comparam hashes de algoritmos diferentes (`docs/adr/0010-versioned-change-set-and-semantic-identity.md:21-23`).
- `purl` para pacotes e `vers` para faixas; carimbo de release só por evento fornecido pelo chamador (`docs/adr/0010-versioned-change-set-and-semantic-identity.md:25-27`).

## Contexto

O digest de render perdia alvos removidos e o símbolo citado; hashes misturavam revisão e cobertura de reuso (`docs/adr/0010-versioned-change-set-and-semantic-identity.md:11-13`).

## Consequências

O ADR registra "version routing is not implemented yet" (`docs/adr/0010-versioned-change-set-and-semantic-identity.md:25`), mas o código atual já tem `stampChangeSet` e `changeSetEligibility` (`src/diff/version-routing.ts:19`, `src/diff/version-routing.ts:37`). Algoritmos: `sha256-semantic-v1` atual, `sha256-normalized-v1` legado (`src/index-builder/content-hash.ts:31-32`); diff em `src/diff/change-set.ts:359`.

## Pacotes afetados

[[doc-bridge-divergencia]], [[doc-bridge-indexacao]], [[doc-bridge-gates-qualidade]].

## Substitui / substituído por

Parcialmente substituído por ADR-0023 (emissão de `CHANGED_REFERENCE`).

## Fonte

`docs/adr/0010-versioned-change-set-and-semantic-identity.md`
