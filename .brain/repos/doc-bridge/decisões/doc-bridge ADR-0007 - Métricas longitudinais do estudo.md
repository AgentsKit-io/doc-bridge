---
tipo: adr
repo: doc-bridge
camada: ferramenta
visibilidade: publico
status: aceito
verificado-em: 2026-10-16
commits:
  "doc-bridge": f8824f1
metodo: "leitura do ADR e conferência estática da implementação citada; nada foi executado; auditado em 2026-10-16 (auditoria v2: referências e afirmações reconferidas contra o código)"
fontes:
  - docs/adr/0007-longitudinal-study-metrics.md
  - src/study/metrics.ts
tags: [adr, repo/doc-bridge, camada/ferramenta]
---

# doc-bridge ADR-0007 - Métricas longitudinais do estudo

> [!tldr] Em linguagem comum
> As métricas do estudo são calculadas sempre do mesmo jeito a partir do registro de observações; ficar mais barato ou mais rápido não conta como melhora se a qualidade piorou, e amostras pequenas são "inconclusivas".

← [[00 Decisões - doc-bridge]]

## Status e datas

Aceito em 2026-08-30 (`docs/adr/0007-longitudinal-study-metrics.md:3-4`).

## A decisão

Métricas por subgrupo e comparações baseline × rodada aprovada calculadas de ledgers endereçados por conteúdo, preservando a proveniência de tokens (provedor vs. estimado), mantendo medidas ausentes explícitas e emitindo incerteza; eficiência subordinada a correção, evidência, aceitação, segurança e retrabalho — regressão de qualidade vira `regressed` (`docs/adr/0007-longitudinal-study-metrics.md:11-13`).

## Contexto

Evitar que números de eficiência escondam piora de qualidade e que histórico incompleto vire falsa precisão (`docs/adr/0007-longitudinal-study-metrics.md:17-21`).

## Consequências

JSON e texto com os mesmos valores e hash; troca de baseline fora do calculador; nomes de métricas novos sem migração de schema. Implementação: `calculateStudyMetrics` (`src/study/metrics.ts:393`).

## Pacotes afetados

[[doc-bridge-estudo]].

## Substitui / substituído por

Nenhum.

## Fonte

`docs/adr/0007-longitudinal-study-metrics.md`
