---
tipo: pacote
repo: doc-bridge
camada: ferramenta
npm: "@agentskit/doc-bridge"
visibilidade: publico
verificado-em: 2026-10-16
commits:
  "doc-bridge": fd1e421
metodo: "análise estática de action.yml, scripts de Action/empacotamento, manifestos MCPB/plugins e workflows; nenhuma Action, publicação ou empacotamento foi executado"
fontes:
  - action.yml
  - scripts/action-runner.mjs
  - src/cli/action.ts
  - src/cli/program.ts
  - mcpb/manifest.json
  - mcp.json
  - .mcp.json
  - plugin.json
  - .claude-plugin/plugin.json
  - .cursor-plugin/plugin.json
  - skills/doc-bridge-handoff/SKILL.md
  - scripts/sync-version.mjs
  - bin/ak-docs.js
  - bin/ak-verify.js
  - package.json
  - .github/workflows/ci.yml
  - .github/workflows/doc-bridge-advisory.yml
  - docs/adr/0015-advisory-action-and-ci-built-index.md
  - docs/adr/0025-opt-in-publication-gate.md
tags: [pacote, repo/doc-bridge, camada/ferramenta]
---

# doc-bridge-distribuicao

> [!tldr] Em linguagem comum
> São as embalagens do mesmo motor: uma ação pronta para o GitHub que confere a documentação em cada PR, um pacote instalável para o Claude Desktop, plugins para Claude Code, Cursor e Copilot, e um roteiro portátil que ensina agentes a pedir o "mapa" antes de mexer no código.

← [[00 Hub - doc-bridge]]

## O que faz e por que existe

Nota nova da v2. Não há lógica de negócio aqui: tudo chama `ak-docs`.

- **Action composta** `doc-bridge-gate` (`action.yml:1-188`): instala uma versão **exata** publicada do pacote num diretório temporário com `--ignore-scripts` (`action.yml:114-121`), roda gates bloqueantes com índice `committed` ou `ci-built`, opcionalmente analisa base/head e publica um comentário advisory. O modo `engine: checkout` só vale para o próprio repo, sem comentário (`action.yml:98-109`).
- **`scripts/action-runner.mjs`**: materializa revisões por `git worktree --no-checkout` + `cat-file`, sem hooks, filtros nem fsmonitor (`scripts/action-runner.mjs:22-60`), e publica/atualiza o comentário via API do GitHub com marcador próprio (`scripts/action-runner.mjs:203-207`).
- **`ak-docs action index|snapshot`** e **`ak-docs diff --advisory`** (`src/cli/action.ts:72-169`).
- **MCPB** (`mcpb/manifest.json`), **plugins** Claude (`.claude-plugin/plugin.json`), Cursor (`.cursor-plugin/plugin.json` → `skills/` + `mcp.json`) e Copilot/agent-plugins (`plugin.json`), **skill portátil** `skills/doc-bridge-handoff`.
- **`ak-verify`** repassa argumentos ao CLI de `@agentskit/harness` (`bin/ak-verify.js:5-7`).

Existe para levar o handoff determinístico a cada cliente sem reescrever o motor, e para que o advisory de PR seja seguro com código não confiável ([[doc-bridge ADR-0015 - Action de advisory e índice gerado na CI]]).

## API e contratos

| Superfície | Contrato | Onde |
|---|---|---|
| Action inputs | `config-path`, `gate`, `index-source` (`committed`/`ci-built`), `advisory`, `comment`, `fail-on-findings`, `base-revision`, `head-revision`, `pr-number`, `node-version`, `engine` (`published`/`checkout`), `package-version` (padrão `2.1.0`) | `action.yml:7-55` |
| Action outputs | `index-report`, `index-source`, `source-revision`, `advisory-report`, `comment-status` | `action.yml:57-72` |
| `ak-docs action index --revision <sha> --root <checkout> --output <fora>` | Gates + índice CI-built isolado com proveniência e checagem de reprodutibilidade | `src/cli/action.ts:75-127` |
| `ak-docs action snapshot` | Snapshot sob perfil service de uma revisão exata | `src/cli/action.ts:129-137` |
| `ak-docs diff --advisory` | Advisory Markdown com marcador `<!-- doc-bridge:advisory:v1:<repo>:<pr> -->` | `src/cli/action.ts:150-169` |
| MCPB | `server/ak-docs.js mcp --config ${user_config.project_config}`; 19 ferramentas listadas; plataforma `darwin` | `mcpb/manifest.json:20-33`, `mcpb/manifest.json:124-130` |
| `.mcp.json` / `mcp.json` | `npx -y @agentskit/doc-bridge@2.1.0 mcp` | `.mcp.json:3-9` |
| Skill `doc-bridge-handoff` | Resolver handoff, ler `readBeforeEditing`, ficar em `editRoots`, rodar `checks`; parar se a rota faltar | `skills/doc-bridge-handoff/SKILL.md:15-28` |

Exemplo real (uso da Action neste repo):

```yaml
# .github/workflows/doc-bridge-advisory.yml:20-25
- uses: AgentsKit-io/doc-bridge@b4aaf15c1c3383227928694e9a35979c9ad04ac1 # 2.0.0
  with:
    config-path: doc-bridge.config.json
    index-source: ci-built
    advisory: 'true'
    comment: 'true'
```

## Quem usa e do que depende

| Relação | Nota / evidência |
|---|---|
| Depende de | [[doc-bridge-gates-qualidade]] (gates), [[doc-bridge-divergencia]] (`diffSnapshotsWithRead`), [[doc-bridge-armazenamento-servico]] (snapshot sob service), [[doc-bridge-consulta-mcp]] (servidor MCP) |
| Depende de | [[00 Hub - harness]] (`ak-verify`), `@agentskit/cross-platform` resolvido da instalação confiável, não do PR (`scripts/action-runner.mjs:12-13`) |
| Consumidores | Repositórios que usam a Action (ex.: [[00 Hub - agents-playbook]] segundo o hub v1); clientes MCP; [[00 Hub - ecosystem-distribution-ops]] publica o MCP em registries externos |

## Dados e efeitos

| Efeito | Detalhe | Evidência |
|---|---|---|
| Rede | `npm install @agentskit/doc-bridge@<versão>` no runner | `action.yml:118-121` |
| Rede / segredo (nome) | Publicação do comentário usa `DOC_BRIDGE_TOKEN` (= `github.token`) contra `api.github.com`; sem token cai para o resumo do job | `action.yml:162`, `scripts/action-runner.mjs:203-207` |
| Permissões | Workflow do advisory pede `contents: read` e `pull-requests: write` | `.github/workflows/doc-bridge-advisory.yml:3-13` |
| Grava | `GITHUB_OUTPUT`, `GITHUB_STEP_SUMMARY`, relatórios fora do checkout; runtime removido no fim | `scripts/action-runner.mjs:11`, `scripts/action-runner.mjs:130`, `action.yml:165-173` |
| Bloqueia | Passo de índice falho sempre reprova; advisory só reprova com `fail-on-findings: true` | `action.yml:175-188` |
| Env (nomes) | `DOC_BRIDGE_PACKAGE_VERSION`, `DOC_BRIDGE_ENGINE`, `DOC_BRIDGE_ADVISORY`, `DOC_BRIDGE_COMMENT`, `DOC_BRIDGE_FAIL_ON_FINDINGS`, `DOC_BRIDGE_INDEX_SOURCE`, `DOC_BRIDGE_BASE_REVISION`, `DOC_BRIDGE_HEAD_REVISION`, `DOC_BRIDGE_PR_NUMBER` | `action.yml:85-161` |
| Proíbe | `fix approve/apply/reject` quando `GITHUB_ACTIONS=true` | `src/cli/program.ts:1085` |

## Como mexer (para agentes)

- **Comece por** `docs/MARKETPLACE.md`, `docs/guides/action-advisory.md` e `action.yml`.
- **Invariantes**: o publicador nunca executa código do PR (`docs/adr/0015-advisory-action-and-ci-built-index.md:19`); índice CI-built nunca sobrescreve o índice commitado (`src/cli/action.ts:108-109`); versão do pacote, da Action, do MCPB, dos plugins, do `.mcp.json`, do resolver da skill e do README sobem juntas via `scripts/sync-version.mjs` (`scripts/sync-version.mjs:7-70`).
- **Testes**: `scripts/marketplace-contract.test.mjs`, `scripts/mcpb-contract.test.mjs`, `scripts/claude-plugin-contract.test.mjs`, `scripts/cursor-plugin-contract.test.mjs`, `scripts/copilot-plugin-contract.test.mjs`, `scripts/portable-skill-contract.test.mjs`; o `ci.yml` roda a própria Action com `engine: checkout` (`.github/workflows/ci.yml:84-90`).
- **Validação**: `pnpm test` (inclui os contratos de plugin e skill, `package.json:55`), `pnpm test:marketplace && pnpm check:marketplace`, `pnpm test:mcpb`, `pnpm mcpb:pack` para gerar o bundle (`package.json:69-73`).
- **Armadilhas**: o workflow de advisory deste repo fixa a Action no commit da **2.0.0** enquanto o pacote está em 2.1.0 (`.github/workflows/doc-bridge-advisory.yml:20`); MCPB declara só `darwin`, enquanto a skill declara `darwin`, `linux`, `windows` (`mcpb/manifest.json:125-127`, `skills/doc-bridge-handoff/SKILL.md:7-10`).

## Decisões e história

- [[doc-bridge ADR-0015 - Action de advisory e índice gerado na CI]], [[doc-bridge ADR-0025 - Gate opt-in de publicação]], [[doc-bridge ADR-0012 - Perfil de serviço imposto pelo chamador]].
- Recentes (`git log -- mcpb .claude-plugin .cursor-plugin plugin.json skills action.yml scripts/action-runner.mjs src/cli/action.ts`): 2026-10-15 `d0e1ff6` versão 2.1.0; 2026-10-14 `c7d9240` gate de publicação na Action; 2026-10-11 `9e4d5c5` instruções MCP; 2026-10-09 `e70891a` 2.0.

> [!info]- Detalhe técnico
> - Captura de revisão: limite de 100 000 entradas e 60 s: `scripts/action-runner.mjs:54-58`.
> - Saída do advisory é escapada e redigida antes de virar comentário: `src/cli/action.ts:70`.
