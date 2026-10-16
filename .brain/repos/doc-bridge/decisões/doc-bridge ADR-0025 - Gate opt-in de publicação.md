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
  - docs/adr/0025-opt-in-publication-gate.md
  - src/gates/run-gates.ts
  - src/gates/reference-findings.ts
  - src/config/schema.ts
  - src/cli/program.ts
tags: [adr, repo/doc-bridge, camada/ferramenta]
---

# doc-bridge ADR-0025 - Gate opt-in de publicação

> [!tldr] Em linguagem comum
> O mantenedor pode escolher que o mapa lido pelos agentes não seja atualizado enquanto a documentação citar código removido ou alterado; é uma escolha explícita, desligada por padrão, que pode ser contornada uma vez com registro.

← [[00 Decisões - doc-bridge]]

## Status e datas

Aceito em 2026-10-14 (`docs/adr/0025-opt-in-publication-gate.md:3-4`); emenda [[doc-bridge ADR-0015 - Action de advisory e índice gerado na CI]] (`docs/adr/0025-opt-in-publication-gate.md:13`); validação `pnpm vitest run tests/publication-gate.test.ts tests/publication-gate-mcp.test.ts tests/cli-controls.test.ts --maxWorkers=2` (`docs/adr/0025-opt-in-publication-gate.md:8`).

## A decisão

Gate `reference-findings` desligado por padrão, ativado só por `gates.include`; mesma seleção do `fail-on-findings` (`BROKEN_REFERENCE`, `AMBIGUOUS_REFERENCE`, `CHANGED_REFERENCE`, menos os atualizados no mesmo change) sobre o working tree local; base é um **arquivo de snapshot**, não uma ref git; falha fechado sem base, base ilegível, snapshots não comparáveis ou cobertura `limits:*` parcial; `ak-docs index` não grava nada se falhar; `--allow-pending-findings` publica e registra `publication.pendingReferenceFindings` sem texto livre; MCP só avisa (`docs/adr/0025-opt-in-publication-gate.md:29-78`).

## Contexto

Nenhum gate olhava findings; `ak-docs index` publicava contexto para agentes mesmo com documentação citando código removido (`docs/adr/0025-opt-in-publication-gate.md:17-25`).

## Consequências

Custo de uma descoberta + diff completos em toda superfície que roda os gates selecionados; leitores anteriores rejeitam índices com `publication` (`docs/adr/0025-opt-in-publication-gate.md:100-115`). Implementação: `referenceFindingsGateEnabled`, `publicationDecision` (`src/gates/run-gates.ts:181-216`), `checkReferenceFindings` (`src/gates/reference-findings.ts:173`), config `gates.referenceFindings.base` (`src/config/schema.ts:143-153`), aviso pós-start no MCP (`src/cli/program.ts:2059-2072`).

## Pacotes afetados

[[doc-bridge-gates-qualidade]], [[doc-bridge-indexacao]], [[doc-bridge-consulta-mcp]], [[doc-bridge-distribuicao]].

## Substitui / substituído por

Emenda o ADR-0015 (não o substitui).

## Fonte

`docs/adr/0025-opt-in-publication-gate.md`
