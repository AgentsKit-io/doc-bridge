---
tipo: adr
repo: doc-bridge
camada: ferramenta
visibilidade: publico
status: aceito
verificado-em: 2026-10-16
commits:
  "doc-bridge": fd1e421
metodo: "leitura do ADR e conferência estática da implementação citada; nenhuma Action foi executada"
fontes:
  - docs/adr/0015-advisory-action-and-ci-built-index.md
  - action.yml
  - src/cli/action.ts
  - scripts/action-runner.mjs
tags: [adr, repo/doc-bridge, camada/ferramenta]
---

# doc-bridge ADR-0015 - Action de advisory e índice gerado na CI

> [!tldr] Em linguagem comum
> A ação do GitHub pode conferir um mapa já versionado ou gerar um na hora, sem esconder que o versionado está velho; e pode comentar no PR quais documentos citam código alterado, como aviso que nunca bloqueia nem aplica nada sozinho.

← [[00 Decisões - doc-bridge]]

## Status e datas

Aceito em 2026-10-06 (`docs/adr/0015-advisory-action-and-ci-built-index.md:3-4`). Emendado por [[doc-bridge ADR-0025 - Gate opt-in de publicação]] (`docs/adr/0015-advisory-action-and-ci-built-index.md:38-41`).

## A decisão

- `index-source`: `committed` (padrão; valida o índice versionado antes de qualquer rebuild) ou `ci-built` (gera índice efêmero isolado e checa proveniência/reprodutibilidade, ainda reportando drift do versionado) (`docs/adr/0015-advisory-action-and-ci-built-index.md:15`).
- Comentário advisory Layer 1 opt-in, separado dos gates bloqueantes (`docs/adr/0015-advisory-action-and-ci-built-index.md:17`).
- Conteúdo do PR é dado não confiável; análise sem executar scripts do head; publicador privilegiado só consome artefatos validados (`docs/adr/0015-advisory-action-and-ci-built-index.md:19`).
- Comentário deduplicado por marcador próprio; sem permissão, cai para resumo/artefato (`docs/adr/0015-advisory-action-and-ci-built-index.md:23`).

## Contexto

O contrato do Marketplace só verificava índice commitado (`docs/adr/0015-advisory-action-and-ci-built-index.md:11`).

## Consequências

Implementação: inputs `index-source`/`advisory`/`comment`/`fail-on-findings` (`action.yml:16-31`); `ak-docs action index` reporta drift do commitado mesmo em `ci-built` (`src/cli/action.ts:86-87`); marcador `doc-bridge:advisory:v1` (`src/cli/action.ts:166`); captura sem hooks/filtros (`scripts/action-runner.mjs:45-53`).

## Pacotes afetados

[[doc-bridge-distribuicao]], [[doc-bridge-gates-qualidade]], [[doc-bridge-divergencia]].

## Substitui / substituído por

Emendado (não substituído) por ADR-0025.

## Fonte

`docs/adr/0015-advisory-action-and-ci-built-index.md`
