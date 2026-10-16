---
tipo: guia
repo: doc-bridge
camada: ferramenta
visibilidade: publico
verificado-em: 2026-10-16
commits:
  "doc-bridge": f8824f1
metodo: "derivado de CONTRIBUTING.md, package.json e ci.yml; `node bin/ak-docs.js index` e `list packages` executados localmente (ok, 30 entidades); gates/doctor/parity não executados; auditado em 2026-10-16 (auditoria v2: referências e afirmações reconferidas contra o código)"
fontes:
  - CONTRIBUTING.md
  - package.json
  - doc-bridge.config.json
  - .github/workflows/ci.yml
  - src/index-builder/build-index.ts
  - .gitignore
tags: [guia, repo/doc-bridge, camada/ferramenta]
---

# Doc Bridge - Gerar e conferir o índice do repositório

> [!tldr] Em linguagem comum
> Como o Doc Bridge "come a própria comida": gerar o mapa deste repositório, conferir que ele sai igual duas vezes e passar os gates de documentação, como a CI faz.

← [[00 Hub - doc-bridge]]

## Quando usar

Antes de gates locais, paridade, benchmarks ou consultas MCP, e sempre que mexer em docs, `doc-bridge.config.json`, descoberta ou ranking (`CONTRIBUTING.md:21-26`).

## Pré-requisitos

`pnpm install` (gera `dist/`). Este repo **não** versiona o índice: `.doc-bridge/*` e `llms.txt` são ignorados (`.gitignore:9-10`).

## Passos

1. Gerar: `node bin/ak-docs.js index` → `.doc-bridge/index.json`, `llms.txt`, `.doc-bridge/capabilities.json` (`src/index-builder/build-index.ts:177`, `src/index-builder/build-index.ts:284-312`).
2. Conferir determinismo como a CI: gerar duas vezes e comparar bytes (`.github/workflows/ci.yml:50-57`):
   ```bash
   node bin/ak-docs.js index && cp .doc-bridge/index.json /tmp/first.json
   node bin/ak-docs.js index && cmp /tmp/first.json .doc-bridge/index.json
   ```
3. Gates e conformidade: `node bin/ak-docs.js gate run` e `node bin/ak-docs.js conformance run documentation-standard-v1 --text` (`.github/workflows/ci.yml:66-69`).
4. Saúde: `node bin/ak-docs.js doctor --text` (`.github/workflows/ci.yml:70`).
5. Paridade pública: `node bin/ak-docs.js parity --text` (`.github/workflows/ci.yml:73-74`).
6. Ranking: `pnpm bench:retrieval` (falha em regressão de hit@3) (`package.json:58`, `.github/workflows/ci.yml:75-78`).
7. Tudo de uma vez, incluindo build do portal: `pnpm check:docs` (`package.json:103`).

## Como validar

Saída 0 em cada comando; `cmp` sem diferença; nenhum `knowledge[].path` fora dos arquivos versionados (checagem da CI, `.github/workflows/ci.yml:58-65`).

## Erros comuns

- "Index is stale … Run: ak-docs index" — regenerar; mudanças de léxico/métricas também invalidam.
- Índice acima do limite de entradas → estreitar `corpus.*.include/exclude` (`src/index-builder/build-index.ts:270-275`).
- Atualizar o baseline do benchmark sem registrar autor/motivo: use `ak-docs bench retrieval <suite> --update-baseline --by <nome> --reason <texto>`.

## Notas relacionadas

[[doc-bridge-indexacao]] · [[doc-bridge-gates-qualidade]] · [[doc-bridge-estudo]] · [[Doc Bridge - Do repositório ao handoff]]
