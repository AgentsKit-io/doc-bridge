---
tipo: guia
repo: doc-bridge
camada: ferramenta
visibilidade: publico
verificado-em: 2026-10-16
commits:
  "doc-bridge": fd1e421
metodo: "derivado de CONTRIBUTING.md, package.json, scripts/sync-version.mjs e dos workflows changesets.yml/release.yml; nenhuma publicação executada"
fontes:
  - CONTRIBUTING.md
  - package.json
  - scripts/sync-version.mjs
  - .github/workflows/changesets.yml
  - .github/workflows/release.yml
  - docs/RELEASE.md
tags: [guia, repo/doc-bridge, camada/ferramenta]
---

# Doc Bridge - Lançar uma versão

> [!tldr] Em linguagem comum
> Como uma mudança vira nova versão do pacote npm `@agentskit/doc-bridge`, com todas as embalagens (Action, MCPB, plugins, skill) acompanhando o mesmo número.

← [[00 Hub - doc-bridge]]

## Quando usar

Mudança de comportamento que precisa chegar a consumidores.

## Pré-requisitos

- Trusted Publisher do npm configurado para `AgentsKit-io/doc-bridge`, workflow `changesets.yml`, ambiente `npm`; nenhum token npm guardado no GitHub (`CONTRIBUTING.md:77-86`).
- **Não** publicar de worktree sujo nem rodar `pnpm release` localmente (`CONTRIBUTING.md:87`).

## Passos

1. No PR: `pnpm changeset` (`CONTRIBUTING.md:81-83`).
2. Após merge na `main`, `changesets.yml` audita prod, roda typecheck, upstream, testes e build, e então abre o PR "chore: version packages" ou publica (`.github/workflows/changesets.yml:47-71`).
3. O PR de versão roda `pnpm version-packages` = `changeset version` + `scripts/sync-version.mjs` + `ak-docs index` (`package.json:80`). O sync propaga a versão para `src/version.ts`, default de `action.yml`, `mcpb/manifest.json`, manifestos de plugin, `mcp.json`/`.mcp.json`, resolver da skill e README (`scripts/sync-version.mjs:7-70`).
4. Ao mesclar o PR de versão, o mesmo workflow roda `pnpm release` = `build` + `test` + `changeset publish` com provenance (`package.json:81`, `.github/workflows/changesets.yml:61-71`).
5. Caminho por tag (recuperação guardada; ver `docs/RELEASE.md:46-49`): push de `vX.Y.Z` dispara `release.yml`, que verifica tag = versão do `package.json` e ancestral de `main`, audita, testa, empacota, publica o tarball verificado (pula se já publicado), confere propagação no npm e cria **rascunho** de release no GitHub (`.github/workflows/release.yml:43-49`, `.github/workflows/release.yml:99-148`).
6. Publicar o rascunho de release manualmente após completar os campos do Marketplace (`.github/workflows/release.yml:148`).

## Como validar

`npm view @agentskit/doc-bridge version` mostra a nova versão; o job "Verify package is visible" passou (`.github/workflows/release.yml:114-127`).

## Erros comuns

- `release.yml` ignora tags com `-` (pré-release) (`.github/workflows/release.yml:25`).
- `sync-version.mjs` falha se não achar o padrão de versão na Action, no resolver da skill ou no README (`scripts/sync-version.mjs:15-17`, `scripts/sync-version.mjs:54-59`, `scripts/sync-version.mjs:67-69`).
- PRs abertos por `GITHUB_TOKEN` não disparam workflows de PR (mesma observação do sync do ecossistema, `CONTRIBUTING.md:37-40`).

- Confundir os dois caminhos: o rotineiro é Changesets; `release.yml` é o caminho **guardado de recuperação** para uma tag semver imutável, também por Trusted Publishing; nunca mover ou recriar tag (`docs/RELEASE.md:41-49`, `docs/RELEASE.md:60-64`).
- `docs/RELEASE.md` ainda diz "Current track: `1.7.45` stable" e usa exemplos 1.x, enquanto o pacote está em 2.1.0 (`docs/RELEASE.md:35`, `package.json:3`) — use os números atuais.

## Notas relacionadas

[[doc-bridge-distribuicao]] · [[Doc Bridge - Validar uma mudança antes do PR]] · [[00 Hub - doc-bridge]]
