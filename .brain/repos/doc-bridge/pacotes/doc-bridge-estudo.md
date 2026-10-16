---
tipo: pacote
repo: doc-bridge
camada: ferramenta
npm: "@agentskit/doc-bridge"
visibilidade: publico
verificado-em: 2026-10-16
commits:
  "doc-bridge": f8824f1
metodo: "análise estática do código e dos ADRs de estudo; índice doc-bridge gerado localmente usado para relações; nenhum provedor nem estudo foi executado; testes não executados; auditado em 2026-10-16 (auditoria v2: referências e afirmações reconferidas contra o código)"
fontes:
  - src/study/protocol.ts
  - src/study/runner.ts
  - src/study/execution.ts
  - src/study/metrics.ts
  - src/study/provider-cli.ts
  - src/study/adjudication.ts
  - src/bench/retrieval.ts
  - src/doctor/run-doctor.ts
  - src/index.ts
  - scripts/study-minimal.mjs
  - package.json
  - .github/workflows/ci.yml
  - tests/bench-retrieval.test.ts
  - docs/adr/0003-study-protocol-and-historical-evidence.md
  - docs/adr/0004-controlled-study-runner.md
  - docs/adr/0007-longitudinal-study-metrics.md
  - docs/adr/0008-study-verification-boundary.md
  - docs/adr/0009-study-provider-cli-adapter.md
  - docs/adr/0021-minimal-study-isolation.md
tags: [pacote, repo/doc-bridge, camada/ferramenta]
---

# doc-bridge-estudo

> [!tldr] Em linguagem comum
> É o laboratório: mede se agentes de IA trabalham melhor (mais rápido, mais barato, com menos erros) quando usam o Doc Bridge, com protocolo fixo, dados anonimizados e uma régua de qualidade de busca que a CI confere a cada mudança.

← [[00 Hub - doc-bridge]]

## O que faz e por que existe

Nota nova da v2. Áreas `src/study/`, `src/bench/` e `src/metrics/` mais scripts `scripts/study-*.mjs`:

- **Contratos versionados e endereçados por conteúdo** para protocolo, evidência histórica, suíte de tarefas, plano de execução, observações, ledger, provedores, verificação e métricas ([[doc-bridge ADR-0003 - Protocolo de estudo e evidência histórica]] … [[doc-bridge ADR-0009 - Adaptador CLI de provedores do estudo]]).
- **Executor controlado**: cada tentativa é um processo filho sem shell, com orçamento de tempo/saída e id de sessão `DOC_BRIDGE_STUDY_SESSION_ID` (`src/study/runner.ts:323-335`).
- **Métricas longitudinais**: eficiência subordinada a qualidade — mais barato com regressão de qualidade é `regressed`; amostras pequenas são `inconclusive` ([[doc-bridge ADR-0007 - Métricas longitudinais do estudo]]).
- **Benchmark de retrieval** (`ak-docs bench retrieval`): hit@k e rank recíproco sobre uma suíte dourada; a CI falha em regressão de hit@3 (`.github/workflows/ci.yml:75-78`) e o doctor usa a mesma suíte (`src/doctor/run-doctor.ts:17`).
- **Estudo mínimo** separado (`scripts/study-minimal.mjs`) com o Claude Code CLI em modo headless ([[doc-bridge ADR-0021 - Execução isolada do estudo mínimo]]).

Existe para sustentar as afirmações públicas de eficiência com evidência auditável e sem dados privados.

## API e contratos

| Símbolo | Tipo | Para que serve | Onde |
|---|---|---|---|
| `createStudyProtocol`, `parseStudyProtocol`, `isSafeStudyText` | função | Protocolo v1; texto público não pode ter caminhos locais, segredos ou URLs | `src/study/protocol.ts:11`, `src/study/protocol.ts:203-219` |
| `runControlledCommand(request)` | função | Uma execução controlada → `ControlledStudyObservationV1` | `src/study/runner.ts:370` |
| `persistControlledStudyLedger(path, ledger)` | função | Grava o ledger | `src/study/runner.ts:448` |
| `runControlledStudy(options)`, `ASSISTED_SCENARIO = 'registry-assisted'` | função/const | Execução de plano × tarefas × provedores | `src/study/execution.ts:125`, `src/study/execution.ts:256` |
| `calculateStudyMetrics(observations, options?)` | função | Relatório de métricas com comparação baseline/atual | `src/study/metrics.ts:393` |
| `validateStudyProviderCommand(provider, cwd)` | função | Confere executável no `PATH` | `src/study/provider-cli.ts:98-105` |
| `runRetrievalBench(options)` | função | Benchmark de retrieval | `src/bench/retrieval.ts:251` |
| CLI `study protocol|history|tasks|select|plan|providers|run|adjudicate|ledger|verification|metrics|expectations`, `bench retrieval`, `benchmark` | comando | Superfície (ver `ak-docs --help`) | — |

Exemplo real (teste):

```ts
// tests/bench-retrieval.test.ts:120-128
const index = fixtureIndex()
const result = runRetrievalBench({
  index,
  suite: suite([
    { id: 'first', input: 'alpha', metadata: { expectedTargets: ['docs/alpha.md'], kind: 'path', lang: 'en' } },
    …
  ]),
})
```

## Quem usa e do que depende

| Relação | Nota / evidência |
|---|---|
| Depende de | [[doc-bridge-consulta-mcp]] (busca e servidor MCP reais nos cenários), [[doc-bridge-indexacao]] (índice), [[doc-bridge-enriquecimento]] (cenário `registry-assisted`) |
| Consumidor | [[doc-bridge-gates-qualidade]] (doctor mede hit@3), CI (`bench retrieval`), afirmações do README verificadas por paridade pública |
| Externo | `@agentskit/cross-platform` (`spawnNodeChild`, `killProcessTree`) |

## Dados e efeitos

| Efeito | Detalhe | Evidência |
|---|---|---|
| Executa | Processos filhos configurados (CLIs de modelo/agente), destacados, com `killProcessTree` no limite | `src/study/runner.ts:318-335` |
| Env | Com `envAllowlist`, só `PATH`, `HOME`, `TMPDIR` + nomes listados; **sem** allowlist, herda `process.env` inteiro | `src/study/runner.ts:324-326` |
| Env | Adjudicação sempre com allowlist | `src/study/adjudication.ts:54` |
| Rede / env (script) | `study-minimal.mjs` com transporte HTTP chama `https://api.anthropic.com/v1/messages` e exige `ANTHROPIC_API_KEY`; no transporte CLI, remove `ANTHROPIC_API_KEY` do filho | `scripts/study-minimal.mjs:206`, `scripts/study-minimal.mjs:246`, `scripts/study-minimal.mjs:274`, `scripts/study-minimal.mjs:578` |
| Grava | Ledger no caminho pedido pelo chamador; os artefatos publicados do estudo ficam versionados em `docs/study/*.json` | `src/study/runner.ts:448` |
| Perfil service | Executor e adjudicação negados | `src/study/runner.ts:371`, `src/study/adjudication.ts:124` |

## Como mexer (para agentes)

- **Comece por** `docs/study/README.md` e `docs/spec/study-*.md`; código em `src/study/runner.ts` e `src/study/metrics.ts`.
- **Invariantes**: histórico é observacional, só o controlado sustenta afirmação causal (`docs/adr/0003-study-protocol-and-historical-evidence.md:26`); medida ausente continua ausente; nenhum transcript bruto vai para artefato público (`docs/adr/0004-controlled-study-runner.md:12`); agente não aprova o próprio resultado; publicação exige revisão humana (`docs/adr/0008-study-verification-boundary.md:21`).
- **Testes**: `tests/study-*.test.ts`, `tests/bench-retrieval.test.ts`, `tests/benchmark.test.ts`, `tests/semantic-benchmark.test.ts`, `tests/quality-scorecard.test.ts`, `scripts/study-doc-bridge-query.test.mjs`.
- **Validação**: `pnpm vitest run tests/study-runner.test.ts tests/study-metrics.test.ts`; benchmark: `pnpm bench:retrieval` (`package.json:58`); scorecard: `pnpm quality:scorecard` (`package.json:93`).
- **Armadilhas**: atualizar o baseline exige `--update-baseline --by <nome> [--reason]` (ver `ak-docs --help`); mudar ranking/léxico muda hit@3 e pode quebrar a CI.

## Decisões e história

- [[doc-bridge ADR-0001 - Contrato de verificação enterprise]], [[doc-bridge ADR-0003 - Protocolo de estudo e evidência histórica]], [[doc-bridge ADR-0004 - Executor controlado do estudo]], [[doc-bridge ADR-0007 - Métricas longitudinais do estudo]], [[doc-bridge ADR-0008 - Fronteira de verificação do estudo]], [[doc-bridge ADR-0009 - Adaptador CLI de provedores do estudo]], [[doc-bridge ADR-0021 - Execução isolada do estudo mínimo]].
- Recentes (`git log -- src/study src/bench src/metrics scripts/study-minimal.mjs`): 2026-10-10 `185b018` nega a união de ferramentas MCP não permitidas; 2026-10-10 `a00fd4d` preço por `modelUsage` com cache TTL; 2026-10-10 `4168b58` estudo mínimo de eficiência; 2026-09-15 `9a775a5` retrieval e enriquecimento (PRD completo).

> [!question] Dúvida
> [[doc-bridge ADR-0009 - Adaptador CLI de provedores do estudo]] diz que o adaptador "allowlists environment variables", mas `runAttempt` herda `process.env` inteiro quando `envAllowlist` não é informado (`src/study/runner.ts:324-325`). Não ficou claro se todo plano real informa a allowlist.
