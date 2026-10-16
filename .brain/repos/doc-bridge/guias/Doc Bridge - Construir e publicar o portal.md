---
tipo: guia
repo: doc-bridge
camada: ferramenta
visibilidade: publico
verificado-em: 2026-10-16
commits:
  "doc-bridge": f8824f1
metodo: "derivado de package.json, wrangler.toml, pages.yml e ci.yml; portal não construído nesta verificação; auditado em 2026-10-16 (auditoria v2: referências e afirmações reconferidas contra o código)"
fontes:
  - package.json
  - wrangler.toml
  - apps/docs/next.config.mjs
  - .github/workflows/pages.yml
  - .github/workflows/ci.yml
tags: [guia, repo/doc-bridge, camada/ferramenta]
---

# Doc Bridge - Construir e publicar o portal

> [!tldr] Em linguagem comum
> Como rodar o site de documentação localmente, conferir que ele está bom e publicá-lo.

← [[00 Hub - doc-bridge]]

## Quando usar

Mudanças em `apps/docs/`, em `docs/` publicadas no site, na lista `apps/docs/public-docs.json` ou nos artefatos para agentes.

## Pré-requisitos

`pnpm install`. Para deploy manual na Cloudflare: variáveis `CLOUDFLARE_API_TOKEN` e `CLOUDFLARE_ACCOUNT_ID` (só os nomes; `wrangler.toml:3`).

## Passos

1. Desenvolvimento: `pnpm docs:dev` (`package.json:86`).
2. Tipos e MDX: `pnpm docs:typecheck` (`package.json:89`).
3. Build estático: `pnpm docs:build` = build do motor + `docs:artifacts` (roda `ak-docs index`) + `next build` → `apps/docs/out` (`package.json:87-88`).
4. Contratos dos artefatos: `pnpm test:docs-artifacts` (`package.json:101`).
5. Navegador: `pnpm exec playwright install --with-deps chromium && pnpm docs:e2e`; Lighthouse: `pnpm docs:lighthouse` (`.github/workflows/ci.yml:110-122`).
6. Publicar:
   - **GitHub Pages**: automático em push na `main`, com `NEXT_PUBLIC_SITE_URL=https://doc-bridge.agentskit.io` e CNAME (`.github/workflows/pages.yml:3-54`).
   - **Cloudflare Workers assets**: `pnpm cf:deploy` = `docs:build` + `cf:headers` + `npx -y wrangler@4 deploy` (`package.json:104-105`, `wrangler.toml:4-11`).

## Como validar

`apps/docs/out/docs/getting-started/index.html` existe e não contém `href="/doc-bridge/` (mesma verificação do Pages, `.github/workflows/pages.yml:38-45`).

## Erros comuns

- Definir `DOCS_BASE_PATH` em produção (só para prévias de subcaminho) (`apps/docs/next.config.mjs:4-6`).
- Esquecer que `docs:build` reconstrói `dist/` e o índice; erros do motor aparecem aqui.

## Notas relacionadas

[[doc-bridge-docs]] · [[Doc Bridge - Gerar e conferir o índice do repositório]]
