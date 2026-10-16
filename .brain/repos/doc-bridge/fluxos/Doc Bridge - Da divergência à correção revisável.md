---
tipo: fluxo
repo: doc-bridge
camada: ferramenta
visibilidade: publico
verificado-em: 2026-10-16
commits:
  "doc-bridge": f8824f1
metodo: "análise estática do código e dos ADRs 0010, 0011, 0022, 0023; nada foi executado; auditado em 2026-10-16 (auditoria v2: referências e afirmações reconferidas contra o código)"
fontes:
  - src/diff/change-set.ts
  - src/fixes/workflow.ts
  - src/fixes/regions.ts
  - src/fixes/llm-cli.ts
  - src/cli/program.ts
  - src/mcp/server.ts
  - docs/adr/0011-findings-and-region-remediation.md
tags: [fluxo, repo/doc-bridge, camada/ferramenta]
---

# Doc Bridge - Da divergência à correção revisável

> [!tldr] Em linguagem comum
> Duas versões do mesmo projeto são comparadas; o resultado aponta documentos que citam algo que sumiu ou mudou e prepara uma correção de trecho exato, que só vale depois de aprovada por uma pessoa e conferida de novo.

← [[00 Hub - doc-bridge]]

## Entrada e resultado

Entrada: snapshot base (`ak-docs discover --json` ou `ak-docs action snapshot`) e o working tree/head. Resultado: `ChangeSetV1`, findings com evidência e, opcionalmente, uma `RemediationV1` aplicada em revisão (`in-review`) e depois `merged`.

| Etapa | O que acontece | Quem atua |
|---|---|---|
| 1. Snapshots | Base e head com a mesma identidade de projeto; senão o diff recusa (`src/diff/change-set.ts:363`) | [[doc-bridge-indexacao]] |
| 2. ChangeSet | Mudanças de arquivos e fatos; compatibilidade provada anotada (`src/diff/change-set.ts:46-96`) | [[doc-bridge-divergencia]] |
| 3. Findings | `BROKEN_REFERENCE` / `AMBIGUOUS_REFERENCE` / `CHANGED_REFERENCE` com status e roteamento (`src/diff/change-set.ts:394-497`) | [[doc-bridge-divergencia]] |
| 4. Proposta | Humano/agente escreve as edições; ou `ak-docs fix --llm` gera propostas L2 só aceitas se o finding some na reanálise em memória (`src/fixes/llm-cli.ts:17-36`) | [[doc-bridge-divergencia]], [[doc-bridge-inteligencia]] |
| 5. Preparar/revalidar | CLI `fix propose|revalidate` ou MCP `docbridge.proposals`: recalcula findings do head, valida regiões e **limpa aprovação anterior** (`src/fixes/workflow.ts:14-33`, `src/fixes/regions.ts:99-109`) | [[doc-bridge-consulta-mcp]] |
| 6. Aprovar | Só pela CLI local, com `--by` e confirmação TTY/`--yes`; proibido em `GITHUB_ACTIONS` e no MCP (`src/cli/program.ts:1084-1093`, `src/mcp/server.ts:540`) | pessoa |
| 7. Aplicar | Troca atômica por arquivo dentro de `--allowed-root`, depois gates pós-apply; falha reverte (`src/fixes/regions.ts:120-136`, backup + restauração em `src/fixes/write.ts:10-45`) | [[doc-bridge-gates-qualidade]] |
| 8. Encerrar | `mergeRemediation` exige humano autenticado e verificação da revisão mesclada; não há fechamento automático (`src/fixes/regions.ts:137-143`) | pessoa / consumidor da biblioteca |

**Erros e recuperação**: região mudou → "Stale region" e nova proposta; revisão mudou → revalidar e reaprovar; rejeitar um finding suprime a mesma evidência até ela mudar; rejeitar uma remediação mantém o finding ([[doc-bridge ADR-0011 - Findings e remediação por região]]).

> [!info]- Detalhe técnico
> - Modo `review-presentation` (branch isolada atestada pelo chamador) não substitui a aceitação humana: `src/fixes/regions.ts:128-132`.
> - Consumidor externo Layer 1: [[engine-runner]] em [[00 Hub - alexandria]].

O que não foi confirmado pertence a [[Dúvidas abertas]]; capacidades condicionais ou sem chamador encontrado vão para [[Capacidades não usadas]].
