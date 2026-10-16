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
  - docs/adr/0013-language-neutral-discovery-adapters.md
  - src/plugins/contract.ts
  - src/index.ts
  - tests/toy-plugin.ts
tags: [adr, repo/doc-bridge, camada/ferramenta]
---

# doc-bridge ADR-0013 - Adaptadores de descoberta neutros de linguagem

> [!tldr] Em linguagem comum
> O núcleo do Doc Bridge não deve entender a sintaxe de nenhuma linguagem; cada linguagem entra por um "adaptador" que entrega fatos padronizados, e JavaScript/TypeScript passa a ser apenas o primeiro adaptador.

← [[00 Decisões - doc-bridge]]

## Status e datas

Aceito em 2026-10-06 (`docs/adr/0013-language-neutral-discovery-adapters.md:3-4`).

## A decisão

Contrato de análise/descoberta estendido e versionado; JS/TS migrado como primeiro plugin embutido preservando ids; o núcleo orquestra leituras limitadas, valida saída canônica, snapshots, diff e delta, sem interpretar sintaxe nem ordem de versões. Adaptadores declaram capacidades, limites e versões e cobrem manifesto/lockfile, eventos de release, símbolos, comandos/flags de CLI, chaves de config e assinaturas (`docs/adr/0013-language-neutral-discovery-adapters.md:15-17`). Leitura só por abstração ligada a partição exata (`docs/adr/0013-language-neutral-discovery-adapters.md:19`). Um adaptador "falso" não-JS é evidência obrigatória de aceitação (`docs/adr/0013-language-neutral-discovery-adapters.md:21`).

## Contexto

A descoberta importava TypeScript e o sistema de arquivos diretamente (`docs/adr/0013-language-neutral-discovery-adapters.md:11`).

## Consequências

Mudanças de capacidade invalidam caches semânticos; análise não suportada continua visível. Implementação: `createDiscoveryRegistryV2` (`src/plugins/contract.ts:151`), plugins embutidos v2 exportados (`src/index.ts:1100-1103`) e o adaptador de teste `toySourcePlugin` sobre `tests/fixtures/toy-ecosystem` (`tests/toy-plugin.ts:12`).

## Pacotes afetados

[[doc-bridge-indexacao]], [[doc-bridge-armazenamento-servico]], [[doc-bridge-divergencia]].

## Substitui / substituído por

Nenhum.

## Fonte

`docs/adr/0013-language-neutral-discovery-adapters.md`
