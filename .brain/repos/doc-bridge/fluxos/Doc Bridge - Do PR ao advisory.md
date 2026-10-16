---
tipo: fluxo
repo: doc-bridge
camada: ferramenta
visibilidade: publico
verificado-em: 2026-10-16
commits:
  "doc-bridge": f8824f1
metodo: "análise estática de action.yml, scripts/action-runner.mjs, src/cli/action.ts e ADRs 0015/0025; nenhuma Action foi executada; auditado em 2026-10-16 (auditoria v2: referências e afirmações reconferidas contra o código)"
fontes:
  - action.yml
  - scripts/action-runner.mjs
  - src/cli/action.ts
  - .github/workflows/doc-bridge-advisory.yml
  - docs/adr/0015-advisory-action-and-ci-built-index.md
  - docs/adr/0025-opt-in-publication-gate.md
tags: [fluxo, repo/doc-bridge, camada/ferramenta]
---

# Doc Bridge - Do PR ao advisory

> [!tldr] Em linguagem comum
> Em cada pull request, a ação do GitHub confere se o mapa e a documentação passam nas regras (isso pode barrar o PR) e, se pedido, escreve um comentário apenas informativo listando documentos que citam código alterado.

← [[00 Hub - doc-bridge]]

## Entrada e resultado

Entrada: evento de PR com base/head já no checkout (`fetch-depth: 0`). Resultado: relatório de gates (bloqueante), relatório advisory JSON/Markdown e comentário ou resumo do job (não bloqueante, salvo `fail-on-findings`).

| Etapa | O que acontece | Quem atua |
|---|---|---|
| 1. Instalar | Valida inputs booleanos; instala `@agentskit/doc-bridge@<package-version>` exato com `--ignore-scripts` em pasta temporária (`action.yml:82-121`) | [[doc-bridge-distribuicao]] |
| 2. Gates | `ak-docs action index`: com `committed`, roda gates sobre o índice versionado; com `ci-built`, gera índice isolado fora do checkout, checa reprodutibilidade e proveniência e **ainda** reporta drift do índice commitado (`src/cli/action.ts:75-127`) | [[doc-bridge-gates-qualidade]] |
| 3. Snapshots | Base e head capturados por `git worktree --no-checkout` + blobs, sem hooks/filtros, sob perfil service (`scripts/action-runner.mjs:45-60`, `src/cli/action.ts:129-137`) | [[doc-bridge-armazenamento-servico]] |
| 4. Advisory | `ak-docs diff --advisory` → findings agrupados em pendentes e atualizados no mesmo PR, com marcador e binding de revisões (`src/cli/action.ts:150-169`) | [[doc-bridge-divergencia]] |
| 5. Publicar | Passo separado, sem executar código do PR, cria/atualiza o comentário próprio via API do GitHub com `DOC_BRIDGE_TOKEN`; sem permissão, escreve no resumo do job (`action.yml:151-163`, `scripts/action-runner.mjs:194-207`) | [[doc-bridge-distribuicao]] |
| 6. Resultado | Falha se o passo de gates falhou; advisory só reprova com `fail-on-findings: true` (`action.yml:175-188`) | — |

**Erros e recuperação**: revisão ausente no checkout → "Exact base/head Git hashes are required" (`scripts/action-runner.mjs:9`); índice commitado com drift → regenerar e commitar (o CI-built nunca o conserta, `src/cli/action.ts:118-119`); com o gate `reference-findings` selecionado, `action index` falha até a CI fornecer o snapshot base no caminho configurado (`docs/adr/0025-opt-in-publication-gate.md:116-118`).

> [!info]- Detalhe técnico
> - Uso neste repo: `.github/workflows/doc-bridge-advisory.yml:9-25` (permissões `contents: read`, `pull-requests: write`).
> - Decisão: [[doc-bridge ADR-0015 - Action de advisory e índice gerado na CI]], emendada por [[doc-bridge ADR-0025 - Gate opt-in de publicação]].

O que não foi confirmado pertence a [[Dúvidas abertas]]; capacidades condicionais ou sem chamador encontrado vão para [[Capacidades não usadas]].
