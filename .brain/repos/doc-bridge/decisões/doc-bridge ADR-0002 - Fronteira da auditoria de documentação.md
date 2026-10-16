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
  - docs/adr/0002-documentation-audit-boundary.md
  - src/audit/documentation.ts
  - src/config/schema.ts
tags: [adr, repo/doc-bridge, camada/ferramenta]
---

# doc-bridge ADR-0002 - Fronteira da auditoria de documentação

> [!tldr] Em linguagem comum
> O Doc Bridge mede a documentação só no que consegue provar sem IA; redundância, prosa desnecessária e contradições em texto livre ficam marcadas como "não analisado", e documentos gerados nunca são editados pela auditoria.

← [[00 Decisões - doc-bridge]]

## Status e datas

Aceito em 2026-08-29 (`docs/adr/0002-documentation-audit-boundary.md:3-4`). Emendado por [[doc-bridge ADR-0011 - Findings e remediação por região]] (`docs/adr/0002-documentation-audit-boundary.md:24-26`).

## A decisão

Auditoria determinística ao lado da descoberta e da reconciliação: sinais de qualidade, cobertura de pacotes, lacunas, declarações velhas, duplicatas exatas e fronteira de frescor de docs geradas. Achados de alta confiança só bloqueiam em caminhos críticos configurados; semântica fica `not-analyzed`; humano aprova mudanças (`docs/adr/0002-documentation-audit-boundary.md:11-15`).

## Contexto

Precisava-se de relatórios mensuráveis sem LLM, sem fingir que qualidade semântica cabe numa nota determinística (`docs/adr/0002-documentation-audit-boundary.md:19-22`).

## Consequências

Relatórios reprodutíveis; reconciliação continua sendo a fonte de verdade de observado vs. declarado; rigor ajustável por repo (`criticalPaths`, `generatedPaths`, `src/config/schema.ts:196-215`). Implementação: `auditDocumentation` (`src/audit/documentation.ts:257`).

## Pacotes afetados

[[doc-bridge-gates-qualidade]], [[doc-bridge-enriquecimento]] (revisão por agente), [[doc-bridge-divergencia]].

## Substitui / substituído por

Cláusula de aprovação humana estreitada por ADR-0011 para apresentação em branch isolada.

## Fonte

`docs/adr/0002-documentation-audit-boundary.md`
