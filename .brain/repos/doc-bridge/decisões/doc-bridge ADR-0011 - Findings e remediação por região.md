---
tipo: adr
repo: doc-bridge
camada: ferramenta
visibilidade: publico
status: aceito
substitui: [ADR-0006]
verificado-em: 2026-10-16
commits:
  "doc-bridge": f8824f1
metodo: "leitura do ADR e conferência estática da implementação citada; nada foi executado; auditado em 2026-10-16 (auditoria v2: referências e afirmações reconferidas contra o código)"
fontes:
  - docs/adr/0011-findings-and-region-remediation.md
  - src/fixes/regions.ts
  - src/findings/contracts.ts
  - src/enrich/settled.ts
  - src/schemas/agent-handoff.ts
tags: [adr, repo/doc-bridge, camada/ferramenta]
---

# doc-bridge ADR-0011 - Findings e remediação por região

> [!tldr] Em linguagem comum
> Problema encontrado, correção proposta e decisão humana são três registros diferentes; uma correção mexe só num trecho exato do arquivo e, mesmo aplicada numa branch de revisão, só vale quando uma pessoa aceita.

← [[00 Decisões - doc-bridge]]

## Status e datas

Aceito em 2026-10-06 (`docs/adr/0011-findings-and-region-remediation.md:3-4`).

## A decisão

- Contratos separados **Finding**, **Remediation** e **Decision**; roteamento (`proposed`, `excluded`, `routed-to-L2`, `pending-version`) nunca muda o status epistêmico (`docs/adr/0011-findings-and-region-remediation.md:17`).
- Id do finding = categoria + localizador + evidência, sem revisão/tempo; remediação liga finding/evidência e edições `{path, range, expectedRegionHash, replacement}`, ciclo `proposed → in-review → merged` (ou `rejected`/`stale`/`superseded`) (`docs/adr/0011-findings-and-region-remediation.md:19`).
- Rejeitar finding suprime a mesma evidência; rejeitar remediação mantém o finding (`docs/adr/0011-findings-and-region-remediation.md:21`).
- Região validada por hash exato + âncoras com um único match; sem realocação difusa; diffs unificados reais; troca atômica por arquivo com rollback (`docs/adr/0011-findings-and-region-remediation.md:23-25`).
- `caveats` opcionais no handoff, só com opt-in (`docs/adr/0011-findings-and-region-remediation.md:33-35`).

## Contexto

O fluxo de fix antigo trocava arquivos inteiros e o diff era "menos tudo/mais tudo" (`docs/adr/0011-findings-and-region-remediation.md:11`).

## Consequências

Apresentação em branch isolada designada pelo chamador não é aceitação (estreita ADR-0006 e ADR-0002) (`docs/adr/0011-findings-and-region-remediation.md:27-31`). Implementação: `src/fixes/regions.ts:100-143`, `src/findings/contracts.ts:12-24`, `src/enrich/settled.ts:9-23`, `HandoffCaveatsSchema` (`src/schemas/agent-handoff.ts:62`).

## Pacotes afetados

[[doc-bridge-divergencia]], [[doc-bridge-consulta-mcp]], [[doc-bridge-enriquecimento]].

## Substitui / substituído por

Substitui parcialmente [[doc-bridge ADR-0006 - Ancoragem da revisão semântica do Registry]] e esclarece [[doc-bridge ADR-0002 - Fronteira da auditoria de documentação]].

## Fonte

`docs/adr/0011-findings-and-region-remediation.md`
