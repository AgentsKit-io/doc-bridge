---
tipo: adr
repo: doc-bridge
camada: ferramenta
visibilidade: publico
status: aceito
verificado-em: 2026-10-16
commits:
  "doc-bridge": fd1e421
metodo: "leitura do ADR e conferência estática da implementação citada; nada foi executado"
fontes:
  - docs/adr/0022-l2-remediation-acceptance.md
  - src/fixes/llm.ts
  - src/fixes/llm-cli.ts
  - tsup.config.ts
tags: [adr, repo/doc-bridge, camada/ferramenta]
---

# doc-bridge ADR-0022 - Aceitação de propostas L2

> [!tldr] Em linguagem comum
> Quando uma IA sugere como corrigir um trecho de documentação, o Doc Bridge testa a sugestão numa cópia em memória e só a mostra se o problema original desaparece e nenhum novo aparece naquele documento; ainda assim, uma pessoa decide.

← [[00 Decisões - doc-bridge]]

## Status e datas

Aceito em 2026-10-09 (`docs/adr/0022-l2-remediation-acceptance.md:3-4`); `sourceOfTruth: src/fixes/llm.ts` e validação `pnpm vitest run tests/llm-remediation.test.ts --maxWorkers=2` (`docs/adr/0022-l2-remediation-acceptance.md:7-8`).

## A decisão

L2 fica opt-in atrás de uma entrada separada e preguiçosa e do peer de Adapter opcional; contagem de findings, prompt, resposta e cancelamento limitados; respostas roteirizadas validam o contrato sem chaves; cada região é aplicada numa cópia em memória e toda a análise (descoberta, delta, declarações, reconciliação, auditoria) roda de novo; sem escrita nas fontes durante a geração (`docs/adr/0022-l2-remediation-acceptance.md:21-31`).

## Contexto

Um provedor dizer que corrigiu não torna a proposta revisável; a Layer 0 deve continuar sem peers (`docs/adr/0022-l2-remediation-acceptance.md:15-17`).

## Consequências

Aceitação prova só a análise determinística executada; propostas combinadas exigem nova verificação (`docs/adr/0022-l2-remediation-acceptance.md:41-45`). Implementação: `proposeL2Remediations` (`src/fixes/llm.ts:66`), `runL2Fix` com `--responses` roteirizado (`src/fixes/llm-cli.ts:17-36`), build separado `llm/program` (`tsup.config.ts:8`).

## Pacotes afetados

[[doc-bridge-divergencia]], [[doc-bridge-inteligencia]].

## Substitui / substituído por

Nenhum.

## Fonte

`docs/adr/0022-l2-remediation-acceptance.md`
