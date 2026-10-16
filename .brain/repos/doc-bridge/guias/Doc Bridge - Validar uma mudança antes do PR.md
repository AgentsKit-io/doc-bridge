---
tipo: guia
repo: doc-bridge
camada: ferramenta
visibilidade: publico
verificado-em: 2026-10-16
commits:
  "doc-bridge": fd1e421
metodo: "derivado de AGENTS.md, CONTRIBUTING.md, package.json, doc-bridge.config.json e ci.yml; `pnpm install` e `node bin/ak-docs.js index`/`query` executados localmente; a suíte de testes não foi executada"
fontes:
  - AGENTS.md
  - CONTRIBUTING.md
  - package.json
  - doc-bridge.config.json
  - .github/workflows/ci.yml
tags: [guia, repo/doc-bridge, camada/ferramenta]
---

# Doc Bridge - Validar uma mudança antes do PR

> [!tldr] Em linguagem comum
> A sequência de comandos que um agente ou pessoa roda para provar que uma alteração no Doc Bridge está pronta para revisão.

← [[00 Hub - doc-bridge]]

## Quando usar

Qualquer mudança em `src/`, `scripts/`, `bin/`, `apps/docs` ou contratos públicos antes de abrir PR. A CI é a porta de merge (`AGENTS.md:28-30`).

## Pré-requisitos

- Node ≥ 22 (`package.json:128-130`) e pnpm (a CI usa 11.19.0, `.github/workflows/ci.yml:23-25`).
- `pnpm install` — o `prepare` já roda `tsup` e gera `dist/` (necessário para `bin/ak-docs.js`).

## Passos

1. Descubra o que validar para a área tocada (handoff determinístico do próprio repo):
   ```bash
   node bin/ak-docs.js index
   node bin/ak-docs.js query package doc-bridge-query --agent   # troque pelo id da área
   ```
   Ids: `doc-bridge`, `doc-bridge-cli`, `doc-bridge-index`, `doc-bridge-query`, `doc-bridge-mcp`, `doc-bridge-gates`, `doc-bridge-conformance`, `doc-bridge-doctor`, `doc-bridge-memory`, `doc-bridge-chat` (`doc-bridge.config.json:32-103`).
2. Rode o teste mais estreito primeiro: `pnpm vitest run tests/<arquivo>.test.ts` (`AGENTS.md:28`).
3. Antes do PR: `pnpm typecheck && pnpm test && pnpm build` (`AGENTS.md:29`, `CONTRIBUTING.md:54`). `pnpm test` inclui vitest + contratos de plugins, skill e upstream (`package.json:55`).
4. Mudou pacote ou README: `npm pack --dry-run` (`CONTRIBUTING.md:55`) e `pnpm check:readme-standard`.
5. Mudou contrato público: atualize `docs/spec/` ou `docs/schemas/` (`AGENTS.md:18`) e o `CHANGELOG.md` / changeset (`CONTRIBUTING.md:56`).
6. Opcional, o que a CI também roda: `pnpm check:no-legacy-chat-imports`, `pnpm check:cross-platform`, `pnpm check:marketplace`, `pnpm test:marketplace`, `pnpm coverage`, `pnpm smoke:packaged` (`.github/workflows/ci.yml:31-45`).

## Como validar

Todos os comandos acima com saída 0; para docs, siga [[Doc Bridge - Gerar e conferir o índice do repositório]].

## Erros comuns

- Introduzir LLM/chave em `init`, `index`, `query`, `list`, gates ou ferramentas MCP de handoff — viola a Layer 0 (`AGENTS.md:16-17`).
- Nomes de repositórios privados, caminhos locais, ids de tickets ou credenciais em código, docs, fixtures ou commits (`AGENTS.md:34-36`).
- Importar `@agentskit/chat-protocol` ou `@agentskit/chat-react` (`CONTRIBUTING.md:49`).
- Commitar `.doc-bridge/index.json` ou `llms.txt` — são gerados e ignorados neste repo (`CONTRIBUTING.md:23-26`).

## Notas relacionadas

[[00 Hub - doc-bridge]] · [[doc-bridge-consulta-mcp]] · [[Doc Bridge - Lançar uma versão]]
