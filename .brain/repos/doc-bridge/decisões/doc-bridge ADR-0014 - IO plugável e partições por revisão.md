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
  - docs/adr/0014-pluggable-io-and-revision-partitions.md
  - src/storage/contract.ts
  - src/storage/artifacts.ts
tags: [adr, repo/doc-bridge, camada/ferramenta]
---

# doc-bridge ADR-0014 - IO plugável e partições por revisão

> [!tldr] Em linguagem comum
> Em vez de ler e gravar direto no disco, o motor pode receber de quem o chama as "tomadas" de leitura e gravação, sempre presas a um repositório e a uma versão exata — nunca "a versão mais recente".

← [[00 Decisões - doc-bridge]]

## Status e datas

Aceito em 2026-10-06 (`docs/adr/0014-pluggable-io-and-revision-partitions.md:3-4`).

## A decisão

Capacidades de storage/IO injetadas pelo chamador com padrão local: listagem limitada, metadados, leitura de revisão exata, artefatos com troca atômica e resultados explícitos de ausente/divergente/erro; snapshots, índices, overlays, caches e evidências particionados por repositório + revisão exata; sem fallback para "latest"; o núcleo não traz banco hospedado, SDK de fornecedor nem telemetria (`docs/adr/0014-pluggable-io-and-revision-partitions.md:15-21`).

## Contexto

A descoberta usava `fs` diretamente e o PRD de retrieval excluía control plane hospedado (`docs/adr/0014-pluggable-io-and-revision-partitions.md:11`).

## Consequências

Consultas multi-repo nomeiam cada partição autorizada; igualdade semântica não é permissão para devolver evidência de outro repo (`docs/adr/0014-pluggable-io-and-revision-partitions.md:17`). Implementação: `RepositoryReadV1`/`ArtifactIOV1` (`src/storage/contract.ts:27-51`), `createLocalArtifactIO` (`src/storage/artifacts.ts:39`).

## Pacotes afetados

[[doc-bridge-armazenamento-servico]], [[doc-bridge-indexacao]], [[doc-bridge-divergencia]], [[doc-bridge-enriquecimento]].

## Substitui / substituído por

Nenhum.

## Fonte

`docs/adr/0014-pluggable-io-and-revision-partitions.md`
