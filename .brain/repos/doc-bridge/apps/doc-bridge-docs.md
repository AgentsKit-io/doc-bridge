---
tipo: app
repo: doc-bridge
camada: ferramenta
visibilidade: publico
verificado-em: 2026-10-16
commits:
  "doc-bridge": fd1e421
metodo: "análise estática de apps/docs, scripts de artefatos e workflows; o portal não foi construído nem implantado nesta verificação"
fontes:
  - apps/docs/next.config.mjs
  - apps/docs/source.config.ts
  - apps/docs/app/api/search/route.ts
  - apps/docs/app/page.tsx
  - apps/docs/components/chat-widget.tsx
  - apps/docs/components/home/waitlist-form.tsx
  - apps/docs/lib/discovery.ts
  - apps/docs/lib/site.ts
  - apps/docs/lib/shell.ts
  - .gitignore
  - apps/docs/AGENTS.md
  - scripts/build-docs-artifacts.mjs
  - package.json
  - wrangler.toml
  - vercel.json
  - doc-bridge.config.json
  - .github/workflows/pages.yml
  - .github/workflows/ci.yml
  - CONTRIBUTING.md
tags: [app, repo/doc-bridge, camada/ferramenta]
---

# doc-bridge-docs

> [!tldr] Em linguagem comum
> É o site onde as pessoas leem os guias do Doc Bridge (doc-bridge.agentskit.io). O mesmo conteúdo também vira arquivos que agentes conseguem consultar, e o site tem um chat que tenta responder localmente antes de pedir ajuda a um servidor.

← [[00 Hub - doc-bridge]]

## O que faz e por que existe

App Next 16 + Fumadocs em `apps/docs`, **sem `package.json` próprio**: dependências e scripts ficam na raiz (`package.json:86-105`, `package.json:206-214`). Gera um **export estático** (`output: 'export'`, `trailingSlash`, imagens não otimizadas) em `apps/docs/out` (`apps/docs/next.config.mjs:9-20`). O conteúdo vem direto de `docs/` filtrado por `apps/docs/public-docs.json` (`apps/docs/source.config.ts:5-11`); a busca é um índice estático do Fumadocs (`apps/docs/app/api/search/route.ts:4-7`).

Antes do `next build`, `pnpm docs:artifacts` roda `ak-docs index` e gera artefatos públicos para agentes (incluindo bloco do ecossistema em `llms.txt` e o conhecimento determinístico do chat) (`scripts/build-docs-artifacts.mjs:43-58`, `package.json:87-88`).

Existe para ser a face humana do produto e, ao mesmo tempo, provar o próprio padrão: docs humanas e corpus para agentes saem da mesma fonte.

## API e contratos

| Superfície | Contrato | Onde |
|---|---|---|
| Páginas | `/` (home), `/docs/<slug>` (rota catch-all opcional do Next), `/for-agents`, `robots`, `sitemap`, imagem OpenGraph | `apps/docs/app/` |
| Busca | `GET /api/search` estático | `apps/docs/app/api/search/route.ts:6-7` |
| Chat "Ask Doc Bridge" | Primeiro `/deterministic/site-config.json` + `/deterministic/knowledge.json` locais; senão backend Ask (`corpus: 'doc-bridge'`) | `apps/docs/lib/discovery.ts:7-21`, `apps/docs/components/chat-widget.tsx:29-43` |
| Lista de espera | `POST` JSON (e-mail, repo opcional, consentimento) para `NEXT_PUBLIC_WAITLIST_URL` | `apps/docs/app/page.tsx:25`, `apps/docs/components/home/waitlist-form.tsx:46-54` |
| Scripts | `docs:dev`, `docs:artifacts`, `docs:build`, `docs:typecheck`, `docs:e2e`, `docs:lighthouse`, `cf:headers`, `cf:deploy` | `package.json:86-105` |

Exemplo real (adapter do chat):

```tsx
// apps/docs/components/chat-widget.tsx:30-31
const fallback = createAskAdapter({ endpoint: process.env.NEXT_PUBLIC_ASK_ENDPOINT ?? 'https://ask.agentskit.io/v1/ask', corpus: 'doc-bridge' })
const answer = createDiscoveryAdapter({
```

## Quem usa e do que depende

| Relação | Nota / evidência |
|---|---|
| Depende de | [[doc-bridge-indexacao]] (o build gera o índice, `scripts/build-docs-artifacts.mjs:44-47`), conteúdo de `docs/` |
| Depende de | [[00 Hub - agentskit-chat]] (`@agentskit/chat`, `@agentskit/chat/react`, `@agentskit/chat/protocol` 0.4.x) e `@agentskit/core` (`apps/docs/lib/discovery.ts:1-3`); Next, React, Fumadocs, Tailwind (devDependencies) |
| Backend externo | Serviço Ask de [[00 Hub - agentskit]] em `ask.agentskit.io` (padrão) |
| Consumidores | Visitantes humanos e agentes que leem `llms.txt`/docs; [[doc-bridge-consulta-mcp]] é a outra porta ao motor |

## Dados e efeitos

| Efeito | Detalhe | Evidência |
|---|---|---|
| Grava (build) | `apps/docs/out`, `apps/docs/public/*` (gerados, ignorados pelo git) | `.gitignore:18-19`, `wrangler.toml:9` |
| Env (nomes) | `NEXT_PUBLIC_SITE_URL`, `DOCS_BASE_PATH`/`NEXT_PUBLIC_BASE_PATH`, `NEXT_PUBLIC_ASK_ENDPOINT`, `NEXT_PUBLIC_WAITLIST_URL`, `NEXT_PUBLIC_AGENTSKIT_SHELL_ORIGIN`, `SOURCE_DATE_EPOCH` (build); `CLOUDFLARE_API_TOKEN`/`CLOUDFLARE_ACCOUNT_ID` no deploy manual | `apps/docs/next.config.mjs:6-18`, `apps/docs/lib/site.ts:2-5`, `apps/docs/lib/shell.ts:7`, `scripts/build-docs-artifacts.mjs:55-58`, `wrangler.toml:3` |
| Rede (navegador) | Backend Ask quando o artefato local não responde; endpoint da lista de espera | `apps/docs/components/chat-widget.tsx:30`, `apps/docs/components/home/waitlist-form.tsx:46` |
| Dados pessoais | O formulário envia e-mail ao endpoint configurado; destino e retenção estão fora deste repo | `apps/docs/components/home/waitlist-form.tsx:52` |
| Deploy | GitHub Pages em push na `main` (CNAME `doc-bridge.agentskit.io`); Cloudflare Workers assets via `pnpm cf:deploy` manual; `vercel.json` ainda presente | `.github/workflows/pages.yml:3-54`, `wrangler.toml:1-11`, `vercel.json:1-30` |

## Como mexer (para agentes)

- **Comece por** `apps/docs/app/layout.tsx`, `apps/docs/source.config.ts` e `scripts/build-docs-artifacts.mjs`. `apps/docs/AGENTS.md` é gerado pelo `next dev` e avisa que esta versão do Next difere do treinamento (`apps/docs/AGENTS.md:1-9`); o config o marca como gerado (`doc-bridge.config.json:25-29`).
- **Invariantes**: só `@agentskit/chat` 0.4.x — nunca `@agentskit/chat-protocol`/`chat-react` (`CONTRIBUTING.md:49`, `pnpm check:no-legacy-chat-imports`); domínio na raiz, sem `basePath` em produção (`apps/docs/next.config.mjs:4-6`, `.github/workflows/pages.yml:38-45`).
- **Testes**: `tests/docs-e2e/portal.spec.ts`, `tests/docs-e2e/assembly-figure.spec.ts` (Playwright), `scripts/docs-artifacts-contract.test.mjs`, `scripts/aliases.test.mjs`, Lighthouse (`lighthouserc.json`).
- **Validação**: `pnpm docs:typecheck && pnpm docs:build && pnpm test:docs-artifacts`; navegador: `pnpm exec playwright install --with-deps chromium && pnpm docs:e2e` (igual ao job `docs` da CI, `.github/workflows/ci.yml:95-122`).
- **Armadilhas**: `docs:build` faz `pnpm build` do motor antes (`package.json:88`); `vercel.json` repete a chave `"main"` em `deploymentEnabled` (`vercel.json:6-7`).

## Decisões e história

- Nenhum ADR específico do portal; [[doc-bridge ADR-0002 - Fronteira da auditoria de documentação]] trata docs geradas como só-presença.
- Recentes (`git log -- apps/docs scripts/build-docs-artifacts.mjs wrangler.toml`): 2026-10-15 `1d194d1` remove fonte JetBrains Mono da home; 2026-10-12 `8f18b88` figura interativa da linha de montagem; 2026-10-12 `de72c5d` seções do lançamento 2.0 e lista de espera; 2026-10-07 `5765518` índice gerado fora do git; 2026-10-02 `6f394e0` export servido por Cloudflare Workers assets.

> [!question] Dúvida
> Qual host atende `doc-bridge.agentskit.io` hoje — GitHub Pages (workflow automático com CNAME) ou Cloudflare Workers (deploy manual, `workers_dev = true`)? O código prova os dois caminhos, não o tráfego.
