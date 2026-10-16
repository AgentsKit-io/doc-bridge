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
  - docs/adr/0004-controlled-study-runner.md
  - src/study/runner.ts
tags: [adr, repo/doc-bridge, camada/ferramenta]
---

# doc-bridge ADR-0004 - Executor controlado do estudo

> [!tldr] Em linguagem comum
> Cada tentativa do estudo roda num processo novo e isolado, com limites de tempo e saída, e guarda só metadados e hashes — nunca a conversa bruta com o modelo; quem julga o resultado é outra etapa.

← [[00 Decisões - doc-bridge]]

## Status e datas

Aceito em 2026-08-30 (`docs/adr/0004-controlled-study-runner.md:3-4`).

## A decisão

Contratos de plano, observação e ledger endereçados por conteúdo; cenários executados como processos filhos **sem shell**, com id de sessão por tentativa, orçamento de tempo/saída/tokens e retentativas limitadas; adjudicação semântica separada e pendente até revisão. Plano inicial: 24 tarefas × 3 cenários × 2 modelos × 2 réplicas = 288 execuções (`docs/adr/0004-controlled-study-runner.md:12-14`).

## Contexto

Comparar as mesmas tarefas em três cenários e dois modelos exige proveniência, custo, tempo e uso de ferramentas por observação, sem publicar prompts (`docs/adr/0004-controlled-study-runner.md:8`).

## Consequências

Agendamento e forma de evidência determinísticos; o adaptador de processo pode ser trocado sem mudar o ledger (`docs/adr/0004-controlled-study-runner.md:25`). Implementação: `runControlledCommand` com `DOC_BRIDGE_STUDY_SESSION_ID` (`src/study/runner.ts:323-335`, `src/study/runner.ts:370`).

## Pacotes afetados

[[doc-bridge-estudo]].

## Substitui / substituído por

Nenhum. O estudo mínimo usa contrato separado ([[doc-bridge ADR-0021 - Execução isolada do estudo mínimo]]).

## Fonte

`docs/adr/0004-controlled-study-runner.md`
