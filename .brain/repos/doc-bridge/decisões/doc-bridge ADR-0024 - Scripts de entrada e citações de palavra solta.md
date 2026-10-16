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
  - docs/adr/0024-entrypoint-bare-word-citations.md
  - src/discovery/entrypoint.ts
tags: [adr, repo/doc-bridge, camada/ferramenta]
---

# doc-bridge ADR-0024 - Scripts de entrada e citações de palavra solta

> [!tldr] Em linguagem comum
> Quando a documentação escreve uma palavra simples entre crases, como `main`, o Doc Bridge não a liga mais a um script executável que por acaso exporta uma função com esse nome, a menos que o texto cite também o caminho do script.

← [[00 Decisões - doc-bridge]]

## Status e datas

Aceito em 2026-10-10 (`docs/adr/0024-entrypoint-bare-word-citations.md:3-4`); validação `pnpm vitest run tests/entrypoint-bare-word.test.ts tests/entrypoint.test.ts tests/changed-claims.test.ts tests/advisory-policy.test.ts --maxWorkers=2` (`docs/adr/0024-entrypoint-bare-word-citations.md:8`).

## A decisão

Palavra minúscula solta (`/^[a-z]+$/`) em código inline ou texto de link não resolve para módulo que seja **script de entrada**, salvo âncora pelo caminho ou nome do pacote na mesma região de citação; script de entrada = shebang ou guarda de módulo principal (`import.meta.url` vs. `process.argv[1]`, ou `require.main === module`); versões do analisador Markdown e do adaptador JS/TS sobem (`docs/adr/0024-entrypoint-bare-word-citations.md:23-34`).

## Contexto

`main` era ao mesmo tempo a branch exigida pela CI e o `main()` exportado de scripts; o advisory acusou `AMBIGUOUS_REFERENCE` em quatro documentos de governança (`docs/adr/0024-entrypoint-bare-word-citations.md:15-19`).

## Consequências

A alternativa ampla (filtrar toda palavra solta) foi rejeitada por medição: perdia citações reais, quebrava 27 testes e baixava hit@3 de 88,3% para 86,7% (`docs/adr/0024-entrypoint-bare-word-citations.md:36-46`). Detecção heurística em `isEntrypointScript` (`src/discovery/entrypoint.ts:152`); snapshots antigos são reanalisados por completo.

## Pacotes afetados

[[doc-bridge-indexacao]], [[doc-bridge-divergencia]].

## Substitui / substituído por

Nenhum.

## Fonte

`docs/adr/0024-entrypoint-bare-word-citations.md`
