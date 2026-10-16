---
tipo: adr
repo: doc-bridge
camada: ferramenta
visibilidade: publico
status: aceito
substitui: [ADR-0010]
verificado-em: 2026-10-16
commits:
  "doc-bridge": f8824f1
metodo: "leitura do ADR e conferência estática da implementação citada; nada foi executado; auditado em 2026-10-16 (auditoria v2: referências e afirmações reconferidas contra o código)"
fontes:
  - docs/adr/0023-changed-reference-claims.md
  - src/discovery/changed-claims.ts
  - src/diff/change-set.ts
tags: [adr, repo/doc-bridge, camada/ferramenta]
---

# doc-bridge ADR-0023 - Afirmações sobre referências alteradas

> [!tldr] Em linguagem comum
> Um documento só é marcado para revisão por citar algo que mudou quando o trecho realmente afirma algo sobre a parte que mudou; mencionar o nome de passagem não basta.

← [[00 Decisões - doc-bridge]]

## Status e datas

Aceito em 2026-10-09 (`docs/adr/0023-changed-reference-claims.md:3-4`); `sourceOfTruth: src/discovery/changed-claims.ts`, validação `pnpm vitest run tests/changed-claims.test.ts --maxWorkers=2` (`docs/adr/0023-changed-reference-claims.md:7-8`).

## A decisão

Substitui a regra de emissão do ADR-0010: `CHANGED_REFERENCE` só quando a região citante afirma algo sobre o aspecto alterado — assinaturas, parâmetros, retornos, membros de enum/união, valores de config e usos que exercitam o aspecto; menção solta não é afirmação. Classificação determinística e limitada (regiões de citação Markdown, sintaxe TS, contexto de assinatura, checador de compatibilidade); sintaxe desconhecida ou regiões ausentes/grandes continuam sendo afirmações (`docs/adr/0023-changed-reference-claims.md:21-38`).

## Contexto

Hash alterado sozinho gerava findings demais para listas de export, anotações de tipo, imports e chamadas ainda válidas (`docs/adr/0023-changed-reference-claims.md:15-17`).

## Consequências

Mudança pública de comportamento; identidades de findings e schemas de índice/handoff inalterados; supressão de menção não é validação semântica de prosa (`docs/adr/0023-changed-reference-claims.md:46-55`). Implementação: `changedCitationClaims` (`src/discovery/changed-claims.ts:258`) usado pelo diff (`src/diff/change-set.ts:3`).

## Pacotes afetados

[[doc-bridge-divergencia]], [[doc-bridge-gates-qualidade]] (gate `reference-findings`), [[doc-bridge-distribuicao]] (advisory).

## Substitui / substituído por

Substitui parcialmente [[doc-bridge ADR-0010 - ChangeSet versionado e identidade semântica]].

## Fonte

`docs/adr/0023-changed-reference-claims.md`
