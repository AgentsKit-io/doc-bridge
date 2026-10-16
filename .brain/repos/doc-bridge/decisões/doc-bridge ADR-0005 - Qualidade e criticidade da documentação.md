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
  - docs/adr/0005-documentation-quality-and-criticality.md
  - src/config/schema.ts
  - AGENTS.md
tags: [adr, repo/doc-bridge, camada/ferramenta]
---

# doc-bridge ADR-0005 - Qualidade e criticidade da documentação

> [!tldr] Em linguagem comum
> Cada documento recebe tipo, público, ciclo de vida, nível de importância e criticidade; documentos críticos precisam declarar dono e forma de validação, sem impor a mesma burocracia a todos os outros.

← [[00 Decisões - doc-bridge]]

## Status e datas

Aceito em 2026-08-30 (`docs/adr/0005-documentation-quality-and-criticality.md:3-4`).

## A decisão

A auditoria classifica cada documento (tipo, audiência, ciclo de vida, tier, criticidade); tiers configuráveis e sobrescritos por frontmatter; qualidade exposta em dimensões independentes — correção, completude, clareza, eficiência para agentes, manutenibilidade — e só `partial`/`validated` para o que o sinal realmente prova (`docs/adr/0005-documentation-quality-and-criticality.md:11-13`).

## Contexto

Evitar colapsar toda a documentação numa só nota e dar prioridade a guias operacionais e de agentes (Tier 0) (`docs/adr/0005-documentation-quality-and-criticality.md:17`).

## Consequências

Metadados críticos ausentes ficam visíveis; presença de exemplo não é confundida com exemplo executável (`docs/adr/0005-documentation-quality-and-criticality.md:17-20`). Configuração: `defaultTier`, `tierRules`, `requiredCriticalMetadata` (`owner`, `lifecycle`, `sourceOfTruth`, `validationPath`) (`src/config/schema.ts:207-213`). O próprio `AGENTS.md` deste repo traz esse frontmatter (`AGENTS.md:1-6`).

## Pacotes afetados

[[doc-bridge-gates-qualidade]], [[doc-bridge-divergencia]] (classificação usada no roteamento de findings).

## Substitui / substituído por

Nenhum.

## Fonte

`docs/adr/0005-documentation-quality-and-criticality.md`
