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
  - docs/adr/0001-enterprise-verification-contract.md
  - package.json
  - bin/ak-verify.js
tags: [adr, repo/doc-bridge, camada/ferramenta]
---

# doc-bridge ADR-0001 - Contrato de verificação enterprise

> [!tldr] Em linguagem comum
> Uma tarefa só conta como "pronta" quando um registro verificável diz que cada superfície (lógica, CLI, MCP, UI, docs, endpoint, banco) foi conferida de verdade — ou foi declarada não aplicável com motivo.

← [[00 Decisões - doc-bridge]]

## Status e datas

Aceito em 2026-08-28 (`docs/adr/0001-enterprise-verification-contract.md:3-4`).

## A decisão

Manter um motor de verificação versionado, sem dependências, com perfis nomeados (`default`, `strict`, `poc`, `custom`, `enterprise`), aplicabilidade explícita por superfície, grafo de estados `CLARIFYING → PLANNED → VERIFYING → aprovação → COMPLETE` (mais `BLOCKED`/`FAILED`) e arquivos JSON atômicos em `.codex/verification`, sem banco nem serviço (`docs/adr/0001-enterprise-verification-contract.md:13-25`).

## Contexto

Um único contrato de conclusão para desenvolvimento local, PoC e validação enterprise, que falhe fechado quando falta superfície, métrica ou aprovação (`docs/adr/0001-enterprise-verification-contract.md:9`).

## Consequências

Configs antigas precisam declarar perfil e motivos; repo sem contrato para em `CLARIFYING`; compilar ou passar testes unitários não basta para declarar conclusão (`docs/adr/0001-enterprise-verification-contract.md:35`). Hoje o motor é o do [[00 Hub - harness]]: `ak-verify` repassa ao CLI de `@agentskit/harness` (`bin/ak-verify.js:5-7`) e o repo valida o próprio contrato com `pnpm test:verification-harness` (`package.json:96`).

## Pacotes afetados

[[doc-bridge-estudo]] (verificação de resultados), [[doc-bridge-distribuicao]] (`ak-verify`).

## Substitui / substituído por

Nenhum.

## Fonte

`docs/adr/0001-enterprise-verification-contract.md`
