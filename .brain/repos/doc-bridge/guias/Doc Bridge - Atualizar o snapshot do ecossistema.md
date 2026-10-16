---
tipo: guia
repo: doc-bridge
camada: ferramenta
visibilidade: publico
verificado-em: 2026-10-16
commits:
  "doc-bridge": fd1e421
metodo: "derivado de CONTRIBUTING.md, package.json e ecosystem-sync.yml; scripts não executados"
fontes:
  - CONTRIBUTING.md
  - package.json
  - .github/workflows/ecosystem-sync.yml
  - .github/workflows/ci.yml
  - .github/workflows/release.yml
  - doc-bridge.config.json
tags: [guia, repo/doc-bridge, camada/ferramenta]
---

# Doc Bridge - Atualizar o snapshot do ecossistema

> [!tldr] Em linguagem comum
> O Doc Bridge guarda uma cópia fixa da lista oficial de produtos AgentsKit (para o site e para conferir afirmações públicas); este guia explica como atualizá-la sem quebrar PRs abertos.

← [[00 Hub - doc-bridge]]

## Quando usar

Quando `ecosystem.json`, `ecosystem-claims.json` ou `ecosystem-upstream.json` precisam refletir o upstream; ou quando a verificação de release reclama de afirmação desatualizada.

## Pré-requisitos

Acesso de rede ao upstream (só para `--sync` e `--against-upstream-head`). Os arquivos alimentam a regra de contrato do ecossistema da conformidade (`doc-bridge.config.json:131-135`).

## Passos

1. Verificar contra o commit fixado (o que a CI faz): `pnpm check:ecosystem-upstream` (`package.json:61`, `.github/workflows/ci.yml:34-35`).
2. Sincronizar do upstream `main`: `pnpm sync:ecosystem-upstream` — copia os arquivos e atualiza o pin e os SHA-256 (`package.json:59`, `CONTRIBUTING.md:30-33`).
3. Testes sem rede: `pnpm test:ecosystem-upstream` (`package.json:60`).
4. Automação: `ecosystem-sync.yml` roda diariamente às 06:17 UTC e mantém um PR em `automation/ecosystem-upstream` (`.github/workflows/ecosystem-sync.yml:3-6`, `.github/workflows/ecosystem-sync.yml:33-53`).

## Como validar

`pnpm check:ecosystem-upstream` com saída 0; na release, `pnpm check:ecosystem-upstream --against-upstream-head` (`.github/workflows/release.yml:57`).

## Erros comuns

- O PR automático é criado com `GITHUB_TOKEN` e **não** dispara CI: um mantenedor precisa fechar e reabrir o PR após cada atualização (`CONTRIBUTING.md:37-40`).
- O repositório precisa permitir que Actions criem PRs (`CONTRIBUTING.md:40`).

## Notas relacionadas

[[doc-bridge-gates-qualidade]] (paridade pública) · [[doc-bridge-docs]] (bloco do ecossistema no `llms.txt`)
