---
tipo: adr
repo: doc-bridge
camada: ferramenta
visibilidade: publico
status: proposto
verificado-em: 2026-10-16
commits:
  "doc-bridge": fd1e421
metodo: "leitura do ADR e conferência estática da implementação citada; nada foi executado"
fontes:
  - docs/adr/0019-memory-entity-evidence.md
  - src/memory/ingest.ts
  - src/memory/pipeline.ts
  - src/index-builder/build-index.ts
tags: [adr, repo/doc-bridge, camada/ferramenta]
---

# doc-bridge ADR-0019 - Fonte de memória e evidência de entidade

> [!tldr] Em linguagem comum
> As anotações de memória dos agentes podem vir de pastas configuráveis e, quando citam exatamente uma decisão ou conceito do mapa, ficam ligadas a ele como "apoio" — sem isso virar prova nem aprovação.

← [[00 Decisões - doc-bridge]]

## Status e datas

**Proposto** em 2026-10-08 no arquivo (`docs/adr/0019-memory-entity-evidence.md:3-4`); implementado em `7263365` (2026-10-09).

## A decisão

Reusar ingestão Markdown determinística para `playbook-memory` e `cursor-rules`; aceitar um ou vários diretórios contidos no repo; formatos não suportados falham explicitamente; relação tipada opcional `memory-supports` (candidato, entidade alvo, evidência exata de id/alias/caminho e hash do fato) só para correspondências únicas de candidatos seguros e não descartados (`docs/adr/0019-memory-entity-evidence.md:18-28`).

## Contexto

O config declarava adaptadores e diretório, mas o pipeline lia diretórios fixos (`docs/adr/0019-memory-entity-evidence.md:11-14`).

## Consequências

Builds capturados (storage injetado) não leem notas locais e marcam `not-analyzed` (`docs/adr/0019-memory-entity-evidence.md:30-31`). Implementação: `ingestMemoryCandidates` (`src/memory/ingest.ts:64-85`), `linkMemoryToEntities` (`src/memory/pipeline.ts:51`), cobertura no build (`src/index-builder/build-index.ts:145-151`).

## Pacotes afetados

[[doc-bridge-memoria-vault]], [[doc-bridge-indexacao]].

## Substitui / substituído por

Nenhum.

## Fonte

`docs/adr/0019-memory-entity-evidence.md`
