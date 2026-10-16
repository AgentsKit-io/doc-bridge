---
tipo: pacote
repo: doc-bridge
camada: ferramenta
npm: "@agentskit/doc-bridge"
visibilidade: publico
verificado-em: 2026-10-16
commits:
  "doc-bridge": fd1e421
metodo: "análise estática do código; índice doc-bridge gerado localmente usado para relações (src/agents e src/enrich não têm ownership próprio no config); nenhum agente do Registry foi executado; testes não executados"
fontes:
  - src/agents/registry-adapter.ts
  - src/enrich/stage.ts
  - src/enrich/overlay.ts
  - src/enrich/approvals.ts
  - src/enrich/review.ts
  - src/enrich/validate.ts
  - src/index-builder/build-index.ts
  - src/mcp/server.ts
  - src/config/schema.ts
  - src/index.ts
  - tests/enrich-stage.test.ts
  - agents/ecosystem-doc-bridge-corpus-scanner/agent.ts
  - docs/adr/0006-registry-semantic-grounding.md
  - docs/adr/0020-vault-edit-review.md
tags: [pacote, repo/doc-bridge, camada/ferramenta]
---

# doc-bridge-enriquecimento

> [!tldr] Em linguagem comum
> É a mesa de revisão das sugestões de IA: agentes do catálogo AgentsKit podem sugerir resumos, apelidos ou ligações extras para o mapa, mas cada sugestão precisa citar evidência real e só entra no mapa depois que uma pessoa aprova.

← [[00 Hub - doc-bridge]]

## O que faz e por que existe

Nota nova da v2 (na v1, o adaptador do Registry estava em [[doc-bridge-inteligencia]]). Áreas `src/agents/` e `src/enrich/`:

- **Adaptador do Registry** — carrega um agente instalado em `agents/<id>` (padrão `ecosystem-doc-bridge-corpus-scanner`) e o executa por **CLI configurada** (processo filho com JSON em stdin/stdout) ou por **módulo local** `doc-bridge-adapter.js`, com limites de tempo, bytes, tokens e concorrência (`src/agents/registry-adapter.ts:15`, `src/agents/registry-adapter.ts:114-226`). Propostas v1 precisam citar um diagnóstico conhecido e evidência presente no snapshot/relatório (`src/agents/registry-adapter.ts:99-112`).
- **Estágio de enriquecimento** — papéis `curator` (documentos), `reviewer` (documentos e áreas) e `adjudicator` (identidade obrigatoriamente diferente) sobre *context packs* limitados; resultados em cache por hash (`src/enrich/stage.ts:35-69`).
- **Overlay** — `.doc-bridge/enrich/overlay.json` guarda `accepted`, `pending`, `rejected` e estatísticas; entradas expiram quando o alvo muda; aceitas só **somam** relações ao grafo observado (`src/enrich/overlay.ts:30-35`, `src/enrich/overlay.ts:227-256`).
- **Aprovações** — registros em `.doc-bridge/approvals`, via gate HITL de `@agentskit/core/hitl` quando instalado ou espelho local idêntico (`src/enrich/approvals.ts:54-56`, `src/enrich/approvals.ts:171-180`).

Existe para permitir julgamento semântico **atribuível e reversível** sem contaminar a Layer 0: desligar `intelligence.registry.enabled` devolve exatamente o baseline determinístico (`src/index-builder/build-index.ts:126-133`).

## API e contratos

| Símbolo | Tipo | Para que serve | Onde |
|---|---|---|---|
| `createRegistryAgentAdapter(root, config, runner?)` | função | `{ metadata, run(snapshot, report…), enrich(task, packs) }` | `src/agents/registry-adapter.ts:217` |
| `loadRegistryAgentMetadata`, `loadRegistryAgentRunner` | função | Lê `agent.json`/`manifest.json`; importa o módulo runner contido no repo | `src/agents/registry-adapter.ts:191-214` |
| `REGISTRY_AGENT_PROTOCOL_V2 = 'doc-bridge.registry-agent.v2'` | const | Protocolo de packs (`curate`/`review`/`adjudicate`) | `src/agents/registry-adapter.ts:59-71` |
| `runEnrichment(options)` | função | Executa os papéis, valida e grava o overlay | `src/enrich/stage.ts:182` |
| `resolveEnrichmentRoles(config)` | função | Papéis ativos; erro se adjudicador = curador/revisor | `src/enrich/stage.ts:51-69` |
| `readEnrichmentOverlay`, `writeEnrichmentOverlay`, `sealEnrichmentOverlay`, `projectEnrichmentOverlay` | função | IO e projeção do overlay | `src/enrich/overlay.ts:44-73`, `src/enrich/overlay.ts:158` |
| `listEnrichment`, `decideEnrichment` | função | `ak-docs enrich list|approve|reject` e MCP `enrich-*` | `src/enrich/review.ts:25`, `src/enrich/review.ts:59` |
| `recordApproval`, `loadApprovalGate`, `createFileApprovalStore` | função | Persistência de decisões humanas | `src/enrich/approvals.ts:72`, `src/enrich/approvals.ts:171-198` |
| CLI `enrich [--retrieval-delta]`, `enrich list|approve|reject`, `suggest`, `check --enrich` | comando | Superfície humana | — (ver `ak-docs --help`) |

Exemplo real (teste):

```ts
// tests/enrich-stage.test.ts:208
const first = await runEnrichment({ root, config, ...artifacts(root, config), agent, now: () => '2026-09-14T00:00:00.000Z' })
```

## Quem usa e do que depende

| Relação | Nota / evidência |
|---|---|
| Depende de | [[doc-bridge-indexacao]] (snapshot, projeção), [[doc-bridge-armazenamento-servico]] (stores particionados `createStoredApprovalStore`, `src/enrich/approvals.ts:201`) |
| Depende de | [[00 Hub - agentskit-registry]] — agentes instalados com `npx agentskit add <id>` (`src/agents/registry-adapter.ts:208`); [[00 Hub - agentskit]] `@agentskit/core/hitl` opcional; `@agentskit/cross-platform` e `@agentskit/net` para processo e timeout (`src/agents/registry-adapter.ts:5-6`) |
| Consumidor | [[doc-bridge-indexacao]] (overlay aceito entra na projeção), [[doc-bridge-consulta-mcp]] (`docbridge.proposals`), [[doc-bridge-memoria-vault]] (`vault-edit`), [[doc-bridge-divergencia]] (rejeições suprimem findings) |
| Consumidor | [[doc-bridge-estudo]] — braço `registry-assisted` do estudo controlado |

## Dados e efeitos

| Efeito | Detalhe | Evidência |
|---|---|---|
| Executa | CLI do agente como processo filho **sem shell**, herdando `process.env` inteiro; mata a árvore no timeout | `src/agents/registry-adapter.ts:125-133` |
| Executa | `import()` de módulo local (`intelligence.registry.runnerModule` ou `agents/<id>/doc-bridge-adapter.js`) | `src/agents/registry-adapter.ts:194-197` |
| Limites padrão | timeout 120 s, entrada 8 MB, resposta 256 KB, concorrência 1 | `src/agents/registry-adapter.ts:222-226` |
| Contexto | Declara `network: false`, `shell: false` ao agente (declaração, não sandbox) | `src/agents/registry-adapter.ts:32-35` |
| Grava | `.doc-bridge/enrich/overlay.json`, cache em `.doc-bridge/enrich/cache`, aprovações em `.doc-bridge/approvals` | `src/enrich/overlay.ts:30-35`, `src/enrich/approvals.ts:54` |
| Grava | MCP `suggest` persiste a proposta no diretório de workflow | `src/mcp/server.ts:529-538` |
| Perfil service | Transporte, runner e estágio negados | `src/agents/registry-adapter.ts:192`, `src/agents/registry-adapter.ts:231`, `src/enrich/stage.ts:183-184` |

## Como mexer (para agentes)

- **Comece por** `src/enrich/stage.ts` (comentário de cabeçalho explica o contrato) e `src/agents/registry-adapter.ts`; contrato em `docs/spec/enrichment-overlay-v1.md`.
- **Invariantes**: o adaptador só checa transporte e orçamento; *grounding* é dos validadores (`src/agents/registry-adapter.ts:51-58`); aceitar nunca remove relação observada (`src/enrich/overlay.ts:245`); adjudicador com identidade distinta (`src/enrich/stage.ts:65-68`); sem `intelligence.registry.enabled` o adaptador recusa (`src/agents/registry-adapter.ts:219`).
- **Testes**: `tests/enrich-stage.test.ts`, `tests/enrichment.test.ts`, `tests/overlay-statistics.test.ts`, `tests/registry-adapter.test.ts`, `tests/semantic-benchmark.test.ts`.
- **Validação**: `pnpm vitest run tests/enrich-stage.test.ts tests/registry-adapter.test.ts` e depois `pnpm typecheck && pnpm test`.
- **Armadilhas**: mudar o formato do overlay quebra leitores estritos antigos (ex.: tipo `vault-edit`, [[doc-bridge ADR-0020 - Revisão de edições no vault gerado]]).

## Decisões e história

- [[doc-bridge ADR-0006 - Ancoragem da revisão semântica do Registry]], [[doc-bridge ADR-0011 - Findings e remediação por região]] (rejeições persistidas), [[doc-bridge ADR-0020 - Revisão de edições no vault gerado]], [[doc-bridge ADR-0012 - Perfil de serviço imposto pelo chamador]].
- Recentes (`git log -- src/agents src/enrich`): 2026-10-08 `9c3db9c` propostas `vault-edit`; 2026-10-07 `35f2293` contratos de findings/remediação; 2026-10-07 `9d41d7d` libera capacidade da CLI do Registry antes de reportar falha; 2026-10-02 `a4e741d` timeouts e cancelamento via `@agentskit/net`.

> [!info]- Detalhe técnico
> - Entrada do CLI v1/v2 e checagem de `maxInputBytes`: `src/agents/registry-adapter.ts:114-124`.
> - Gate HITL do ecossistema vs. espelho, mesmos arquivos: `src/enrich/approvals.ts:163-180`.

> [!question] Dúvida
> A pasta `agents/` deste repo tem `agent.ts`, `eval.ts` e `README.md` dos três agentes (`agents/ecosystem-doc-bridge-corpus-scanner/agent.ts:1-12`), mas não `agent.json`/`manifest.json`, que `loadRegistryAgentMetadata` exige (`src/agents/registry-adapter.ts:209-210`). Não está claro se `intelligence.registry` funcionaria com essa cópia ou se ela serve só a `scripts/run-registry-semantic-review.mjs`.
