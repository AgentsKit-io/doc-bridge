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
  - docs/adr/0012-caller-enforced-service-profile.md
  - src/execution/config.ts
  - src/execution/profile.ts
  - src/mcp/server.ts
tags: [adr, repo/doc-bridge, camada/ferramenta]
---

# doc-bridge ADR-0012 - Perfil de serviço imposto pelo chamador

> [!tldr] Em linguagem comum
> Quando o Doc Bridge roda dentro do sistema de outra empresa sobre um repositório não confiável, quem chama liga um "modo restrito" que o próprio repositório não consegue desligar: nada de executar módulos do repo, acessar a rede, publicar ou vigiar arquivos.

← [[00 Decisões - doc-bridge]]

## Status e datas

Aceito em 2026-10-06 (`docs/adr/0012-caller-enforced-service-profile.md:3-4`).

## A decisão

Perfil `service` escolhido pelo chamador antes de carregar o config, imutável e propagado por todas as entradas (config, descoberta, consulta, CLI/MCP, IO); desliga runners/módulos do Registry, CLIs de agente/estudo, plugins executáveis, federação, promoção de memória por PR e watch; leituras por capacidades limitadas ([[doc-bridge ADR-0014 - IO plugável e partições por revisão]]) e escrita só no armazenamento designado (`docs/adr/0012-caller-enforced-service-profile.md:15-17`). Config do repositório passa por uma **allowlist de folhas** (`corpus.agent.*`, `audit.documentation.*`, `reconciliation.*`, `analysis.areas.*`, `safety.*`) (`docs/adr/0012-caller-enforced-service-profile.md:19-30`).

## Contexto

Parsing estático do config não restringe execuções posteriores: a CLI do Registry herda `process.env`, runners importam módulos locais, federação busca URLs e a promoção de memória faz push (`docs/adr/0012-caller-enforced-service-profile.md:11`).

## Consequências

Não é sandbox de SO; opções ignoradas viram diagnósticos `not-analyzed` sem vazar valores; comportamento local fora do perfil inalterado (`docs/adr/0012-caller-enforced-service-profile.md:17`, `docs/adr/0012-caller-enforced-service-profile.md:32`). Implementação: `SERVICE_CONFIG_LEAVES` e `serviceConfig` (`src/execution/config.ts:6-53`), `denyServiceOperation` (`src/execution/profile.ts:18-20`), ferramentas MCP permitidas (`src/mcp/server.ts:350`).

## Pacotes afetados

[[doc-bridge-armazenamento-servico]], [[doc-bridge-consulta-mcp]], [[doc-bridge-indexacao]], [[doc-bridge-enriquecimento]], [[doc-bridge-inteligencia]], [[doc-bridge-memoria-vault]], [[doc-bridge-estudo]], [[doc-bridge-distribuicao]].

## Substitui / substituído por

Nenhum.

## Fonte

`docs/adr/0012-caller-enforced-service-profile.md`
