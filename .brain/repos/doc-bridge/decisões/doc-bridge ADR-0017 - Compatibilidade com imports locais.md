---
tipo: adr
repo: doc-bridge
camada: ferramenta
visibilidade: publico
status: aceito
substitui: [ADR-0016]
verificado-em: 2026-10-16
commits:
  "doc-bridge": fd1e421
metodo: "leitura do ADR e conferência estática da implementação citada; nada foi executado"
fontes:
  - docs/adr/0017-local-import-compatibility-evidence.md
  - src/discovery/facts/signature-context.ts
  - src/diff/change-set.ts
tags: [adr, repo/doc-bridge, camada/ferramenta]
---

# doc-bridge ADR-0017 - Compatibilidade com imports locais

> [!tldr] Em linguagem comum
> A prova de "mudança compatível" passa a seguir tipos importados de outros arquivos do próprio projeto, com limites rígidos de tamanho e profundidade; o que não dá para provar continua indo para revisão.

← [[00 Decisões - doc-bridge]]

## Status e datas

Aceito em 2026-10-08 (`docs/adr/0017-local-import-compatibility-evidence.md:3-4`).

## A decisão

O adaptador JS/TS guarda sintaxe de declarações/imports por módulo e mapas de entrypoint de pacotes; só hashes de chamáveis alterados tentam uma travessia **do próprio snapshot**, seguindo imports relativos e entrypoints locais (inclusive re-exports), com limites por lado: profundidade 8, 32 módulos, 256 KiB de contexto lido e 256 KiB de prova expandida; contexto ausente, ambíguo, externo ou acima do orçamento não prova nada (`docs/adr/0017-local-import-compatibility-evidence.md:18-31`). Exceção estreita de *heritage*: interface local que estende a mesma base importada opaca, marcada "heritage proof (assumes head compiles)" (`docs/adr/0017-local-import-compatibility-evidence.md:42-52`).

## Contexto

A prova local do ADR-0016 não resolvia interfaces importadas; a comparação histórica precisa usar as declarações de cada snapshot, não os arquivos atuais (`docs/adr/0017-local-import-compatibility-evidence.md:11-14`).

## Consequências

Metadados do snapshot e identidade semântica mudam; versão do analisador JS/TS invalida reuso (`docs/adr/0017-local-import-compatibility-evidence.md:35-36`). Implementação: `importedSignatureTypes`, `declaredImportedHeritage` (`src/discovery/facts/signature-context.ts:65`, `src/discovery/facts/signature-context.ts:197`) e o rótulo no diff (`src/diff/change-set.ts:71`).

## Pacotes afetados

[[doc-bridge-divergencia]], [[doc-bridge-indexacao]].

## Substitui / substituído por

Substitui parcialmente [[doc-bridge ADR-0016 - Evidência de compatibilidade de chamáveis]].

## Fonte

`docs/adr/0017-local-import-compatibility-evidence.md`
