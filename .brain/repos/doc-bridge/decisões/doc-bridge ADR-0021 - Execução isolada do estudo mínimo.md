---
tipo: adr
repo: doc-bridge
camada: ferramenta
visibilidade: publico
status: proposto
verificado-em: 2026-10-16
commits:
  "doc-bridge": f8824f1
metodo: "leitura do ADR e conferência estática do script citado; nenhuma execução do estudo; auditado em 2026-10-16 (auditoria v2: referências e afirmações reconferidas contra o código)"
fontes:
  - docs/adr/0021-minimal-study-isolation.md
  - scripts/study-minimal.mjs
tags: [adr, repo/doc-bridge, camada/ferramenta]
---

# doc-bridge ADR-0021 - Execução isolada do estudo mínimo

> [!tldr] Em linguagem comum
> Um estudo menor (seis perguntas, um modelo, dois cenários: com e sem Doc Bridge) roda por fora dos contratos do estudo grande, usando o Claude Code em modo automático, com teto de gasto e julgamento feito por outra execução de IA "às cegas".

← [[00 Decisões - doc-bridge]]

## Status e datas

**Proposto** em 2026-10-09 (`docs/adr/0021-minimal-study-isolation.md:3-4`), com transporte de piloto definido em 2026-10-09 e emenda de 2026-10-10 (`docs/adr/0021-minimal-study-isolation.md:34`, `docs/adr/0021-minimal-study-isolation.md:85`).

## A decisão

Manifesto público versionado e script de pesquisa separados; reuso do servidor MCP local real, comparações pareadas e adjudicação por um agente diferente e cego ao cenário; nenhuma operação Layer 0 chama provedor (`docs/adr/0021-minimal-study-isolation.md:14-23`). Piloto aprovado só com teto cumulativo de 1 USD para `claude-haiku-5-5` (`docs/adr/0021-minimal-study-isolation.md:29-32`). Transporte: `claude -p` headless autenticado pelo login do CLI, sem ler nem repassar `ANTHROPIC_API_KEY`, `cwd` em export somente-leitura (0444/0555) por tentativa, ferramentas só de leitura e cenários diferindo só em `--mcp-config` (`docs/adr/0021-minimal-study-isolation.md:36-45`). Emenda: versão do CLI fixada em 2.1.296, transcript `stream-json`, checagem cruzada de custo e falha fechada (`docs/adr/0021-minimal-study-isolation.md:85-145`).

## Contexto

Os schemas do estudo controlado exigem 4 categorias, 2 modelos e 3 cenários; encaixar o estudo mínimo neles publicaria contagens enganosas (`docs/adr/0021-minimal-study-isolation.md:9-12`, `docs/adr/0021-minimal-study-isolation.md:25-28`).

## Consequências

O ledger privado não é aceito pelos comandos `study ledger` existentes; isolamento parcial (`CLAUDE.md` e memória automática não excluídos) (`docs/adr/0021-minimal-study-isolation.md:77-83`). Implementação: transporte HTTP opcional para a API da Anthropic e remoção da chave no filho do transporte CLI (`scripts/study-minimal.mjs:206`, `scripts/study-minimal.mjs:274`).

## Pacotes afetados

[[doc-bridge-estudo]], [[doc-bridge-consulta-mcp]] (servidor MCP real como tratamento).

## Substitui / substituído por

Nenhum; reaproveita regras de [[doc-bridge ADR-0009 - Adaptador CLI de provedores do estudo]].

## Fonte

`docs/adr/0021-minimal-study-isolation.md`
