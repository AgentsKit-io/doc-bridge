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
  - docs/adr/0008-study-verification-boundary.md
  - src/study/verification.ts
tags: [adr, repo/doc-bridge, camada/ferramenta]
---

# doc-bridge ADR-0008 - Fronteira de verificação do estudo

> [!tldr] Em linguagem comum
> Um resultado do estudo só pode ser publicado depois de "selado" num registro separado que prova de onde veio, que dados privados foram removidos e quanto custou — e ainda assim uma pessoa precisa revisar.

← [[00 Decisões - doc-bridge]]

## Status e datas

Aceito em 2026-08-31 (`docs/adr/0008-study-verification-boundary.md:3-4`).

## A decisão

Resultados controlados exigem um *verification binding* separado e endereçado por conteúdo com proveniência, hashes dos artefatos, revisão de privacidade anonimizada e orçamentos consumidos; só o envelope de resultado é elegível para publicação; recuperação fica com o motor de workflow e a idempotência do ledger; o harness é autoridade para estado, aprovação humana e troca de baseline (`docs/adr/0008-study-verification-boundary.md:11-13`).

## Contexto

Distinguir um relatório calculado localmente de um resultado verificado (`docs/adr/0008-study-verification-boundary.md:17`).

## Consequências

Falhas de privacidade/orçamento falham fechado sem expor valores; baselines imutáveis em execuções normais; varredura determinística não aprova a própria saída (`docs/adr/0008-study-verification-boundary.md:17-21`). Implementação: `createStudyVerificationBinding` (`src/study/verification.ts:66`).

## Pacotes afetados

[[doc-bridge-estudo]].

## Substitui / substituído por

Nenhum.

## Fonte

`docs/adr/0008-study-verification-boundary.md`
