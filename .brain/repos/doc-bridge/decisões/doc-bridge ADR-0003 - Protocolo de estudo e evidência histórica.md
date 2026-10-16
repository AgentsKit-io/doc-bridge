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
  - docs/adr/0003-study-protocol-and-historical-evidence.md
  - src/study/protocol.ts
tags: [adr, repo/doc-bridge, camada/ferramenta]
---

# doc-bridge ADR-0003 - Protocolo de estudo e evidência histórica

> [!tldr] Em linguagem comum
> O estudo que mede se o Doc Bridge ajuda agentes segue um protocolo fixo e versionado; dados antigos são guardados como observação (não como prova) e tudo o que é público é anonimizado.

← [[00 Decisões - doc-bridge]]

## Status e datas

Aceito em 2026-08-30 (`docs/adr/0003-study-protocol-and-historical-evidence.md:8-9`).

## A decisão

Dois contratos JSON versionados e endereçados por conteúdo — `StudyProtocolV1` e `HistoricalEvidenceRegistryV1` — validados pela CLI existente, sem banco, telemetria hospedada, coletor de rede ou dependência de LLM; só a trilha controlada sustenta afirmação causal; medida ausente continua ausente (`docs/adr/0003-study-protocol-and-historical-evidence.md:19-26`).

## Contexto

A evidência histórica de dogfood tinha métricas mutáveis e comparabilidade incompleta, e o estudo cobre um repositório consumidor privado que não pode aparecer em artefatos públicos (`docs/adr/0003-study-protocol-and-historical-evidence.md:13-15`).

## Consequências

Estudo reprodutível e auditável; lacunas históricas visíveis; escolha de modelo adiada (`docs/adr/0003-study-protocol-and-historical-evidence.md:37-40`). Implementação: `createStudyProtocol`, `createHistoricalEvidenceRegistry` e o filtro `isSafeStudyText` (`src/study/protocol.ts:11`, `src/study/protocol.ts:203-230`).

## Pacotes afetados

[[doc-bridge-estudo]].

## Substitui / substituído por

Nenhum.

## Fonte

`docs/adr/0003-study-protocol-and-historical-evidence.md`
