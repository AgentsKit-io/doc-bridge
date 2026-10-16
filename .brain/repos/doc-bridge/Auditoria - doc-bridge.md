---
tipo: guia
repo: doc-bridge
camada: ferramenta
visibilidade: publico
verificado-em: 2026-10-16
commits:
  "doc-bridge": fd1e421
metodo: "comparação das notas v1 (commit ca2c233) com o código; `git diff ca2c233 fd1e421` fora de `.brain/` é vazio, então as linhas valem nos dois commits"
fontes:
  - package.json
  - README.md
  - src/cli/program.ts
  - src/fixes/regions.ts
  - src/mcp/server.ts
  - src/query/load-index.ts
  - src/diff/change-set.ts
  - src/audit/documentation.ts
  - docs/adr/0018-opt-in-knowledge-entities.md
  - docs/adr/0019-memory-entity-evidence.md
  - docs/adr/0010-versioned-change-set-and-semantic-identity.md
  - docs/RELEASE.md
tags: [guia, repo/doc-bridge, camada/ferramenta]
---

# Auditoria - doc-bridge

> [!tldr] Em linguagem comum
> Registro do que estava errado ou fraco nas notas v1 deste repositório e do que foi mudado na v2, mais divergências entre a documentação do próprio repo e o código.

← [[00 Hub - doc-bridge]]

## Erros e fragilidades da v1

| # | Nota v1 | Problema | Correção v2 |
|---|---|---|---|
| 1 | [[doc-bridge-inteligencia]] | Citava `package.json:195` como evidência dos peers; a linha 195 é `@changesets/cli` (devDependency). Peers ficam em `package.json:161-188` | Referência corrigida |
| 2 | [[doc-bridge-docs]] | Citava `package.json:107` para scripts do portal; a linha 107 é `"keywords": [`. Scripts ficam em `package.json:86-105` | Referência corrigida |
| 3 | [[00 Hub - doc-bridge]] | O aviso sobre métricas citava `README.md:97`, que é a seção "Verify documentation divergence" (`README.md:96-101`) e não trata de métricas | Aviso reancorado em `docs/adr/0002-documentation-audit-boundary.md:13` |
| 4 | [[doc-bridge-divergencia]] | "Do que depende: … autenticação de revisão humana" — o motor não autentica; recebe `authenticateHuman` do chamador e a CLI diz que `--by` "is not authentication" (`src/fixes/regions.ts:114-118`, `src/cli/program.ts:1087`) | Texto corrigido |
| 5 | [[doc-bridge-divergencia]] | Incluía a auditoria de documentação (`auditDocumentation`) como parte da divergência; é um módulo de qualidade separado (`src/audit/documentation.ts:257`) | Movida para [[doc-bridge-gates-qualidade]] |
| 6 | [[doc-bridge-consulta-mcp]] | Dizia que a única escrita do MCP era salvar proposta/decisão; omitia que `docbridge.proposals` `suggest` **executa** o agente do Registry (CLI ou módulo) e persiste a proposta (`src/mcp/server.ts:529-538`) | Incluído em "Dados e efeitos" |
| 7 | [[doc-bridge-inteligencia]] | Colocava o adaptador do Registry na camada de chat/RAG e listava "React" como peer de [[00 Hub - agentskit]] (é o pacote `react`) | Adaptador movido para [[doc-bridge-enriquecimento]]; peers listados com nome exato |
| 8 | v1 de indexação e divergência | Usavam o callout "Existe, mas ninguém usa" para limitações (opt-in, prosa não analisada), não para capacidades sem chamador | Callouts agora listam só capacidades sem uso real |
| 9 | Várias | Referências fracas a linhas de `import` (`src/diff/change-set.ts:1`, `src/audit/documentation.ts:1`, `src/query/load-index.ts:1`) | Trocadas por linhas que contêm o símbolo citado |
| 10 | Todas | Sem as seções v2 (API com exemplo real, dados e efeitos, como mexer, decisões); `fontes` com prefixo `doc-bridge/` e sem tag `camada/*` | Reescritas no formato v2 com caminhos relativos ao repo |

## Divergências entre docs do repo e código (não são erros da v1)

- ADR-0018 e ADR-0019 dizem `status: proposed`, mas estão implementados (config `index.knowledgeEntities`, `memoryRelations`) (`docs/adr/0018-opt-in-knowledge-entities.md:3`, `docs/adr/0019-memory-entity-evidence.md:3`).
- ADR-0010 diz "version routing is not implemented yet" (`docs/adr/0010-versioned-change-set-and-semantic-identity.md:25`), mas `stampChangeSet`/`changeSetEligibility` existem.
- `docs/RELEASE.md` ainda fala em "Current track: `1.7.45` stable" (`docs/RELEASE.md:35`) com o pacote em 2.1.0 (`package.json:3`).

O que não foi confirmado pertence a [[Dúvidas abertas]]; capacidades condicionais ou sem chamador encontrado vão para [[Capacidades não usadas]].
