---
tipo: pacote
repo: doc-bridge
camada: ferramenta
npm: "@agentskit/doc-bridge"
visibilidade: publico
verificado-em: 2026-10-16
commits:
  "doc-bridge": f8824f1
metodo: "análise estática do código; índice doc-bridge gerado localmente e handoffs `ak-docs query package doc-bridge-query|doc-bridge-mcp|doc-bridge-cli --agent` usados como evidência de edit roots, checks e relações; `ak-docs --help` executado; testes não executados; auditado em 2026-10-16 (auditoria v2: referências e afirmações reconferidas contra o código)"
fontes:
  - src/query/query.ts
  - src/query/search.ts
  - src/query/handoff.ts
  - src/query/load-index.ts
  - src/query/why.ts
  - src/mcp/server.ts
  - src/mcp/knowledge.ts
  - src/mcp/install.ts
  - src/cli/program.ts
  - src/config/schema.ts
  - src/config/defaults.ts
  - src/index-builder/capabilities.ts
  - src/index.ts
  - tests/mcp.test.ts
  - doc-bridge.config.json
  - .mcp.json
  - AGENTS.md
  - docs/adr/0011-findings-and-region-remediation.md
  - docs/adr/0025-opt-in-publication-gate.md
tags: [pacote, repo/doc-bridge, camada/ferramenta]
---

# doc-bridge-consulta-mcp

> [!tldr] Em linguagem comum
> É o balcão de informações: quando um agente ou pessoa pergunta "onde mexo para mudar X?", devolve por onde começar a ler, quais pastas pode editar e quais verificações rodar — pela linha de comando ou por um servidor MCP que IDEs e agentes conectam.

← [[00 Hub - doc-bridge]]

## O que faz e por que existe

Três áreas de `src/` que expõem o índice:

- `src/query/` — consulta determinística: handoff por pacote/ownership/qualquer entidade, busca BM25 com explicação, `why` sobre entidades de conhecimento e o carregamento **com verificação de frescor** do índice.
- `src/mcp/` — servidor JSON-RPC sobre **stdio** (aceita framing `Content-Length` e JSON por linha) com 19 ferramentas, mais o instalador de config do Cursor/Claude Desktop.
- `src/cli/` — o programa `ak-docs` (todos os comandos; `--help` lista ~50 formas de uso) e os despachos para perfil `service`, Action e advisory (`src/cli/program.ts:1565-1577`).

Existe para dar a agentes contexto **pequeno, citável e verificável** antes de um `grep` amplo. Consultar **não** autoriza editar: o handoff é orientação; executar `checks` é do consumidor.

## API e contratos

| Símbolo / ferramenta | Tipo | Para que serve | Onde |
|---|---|---|---|
| `runQuery(index, config, req: QueryRequest, options?)` | função | `kind` = `package`/`ownership`/`intent`/`change`/`search`; com `agent: true` devolve `AgentHandoffV1` ou `AgentSearchV1` limitado por orçamento | `src/query/query.ts:16-27`, `src/query/query.ts:100` |
| `DEFAULT_AGENT_CONTEXT_BUDGET_TOKENS = 128` | const | Orçamento padrão de busca de agente (medido sobre 60 casos) | `src/query/query.ts:34-40` |
| `searchIndex(index, term, limit = 20, options?)` | função | Busca sobre a projeção (ou legado `knowledge[]`) | `src/query/search.ts:40` |
| `handoffForEntity(index, id, config, options?)`, `resolveHandoffEntry` | função | Handoff para qualquer entidade (pacote, área, módulo, documento) derivado do grafo | `src/query/handoff.ts:84`, `src/query/handoff.ts:335` |
| `loadFreshDocBridgeIndex(root, config)` | função | Lança `IndexNotFoundError`/`IndexStaleError` se o índice não bate com os inputs atuais | `src/query/load-index.ts:21-33`, `src/query/load-index.ts:73` |
| `knowledgeWhy(index, input, service?)` | função | `ak-docs why` e ferramentas `knowledge.decision/concept/whyChanged` | `src/query/why.ts:27` |
| `knowledgeSearch`, `knowledgeLookup`, `budgetedHandoff` | função | Ferramentas `knowledge.search`/`knowledge.lookup` e corte por orçamento | `src/mcp/knowledge.ts:200`, `src/mcp/knowledge.ts:402`, `src/mcp/knowledge.ts:480` |
| `MCP_TOOLS` (19 ferramentas) | const | Contrato MCP; todas `readOnlyHint` exceto `docbridge.proposals` | `src/mcp/server.ts:49-214` |
| `handleMcpRequest(ctx, request)`, `startMcpStdioServer(ctx)` | função | `initialize` (com `instructions`), `tools/list`, `tools/call` | `src/mcp/server.ts:379`, `src/mcp/server.ts:583` |
| `installMcpConfig(root, 'cursor' \| 'claude')`, `mcpSnippet` | função | Grava entrada `ak-docs` no config do cliente | `src/mcp/install.ts:47`, `src/mcp/install.ts:85` |

Ferramentas MCP: `handoff.resolve`, `doc.search`, `doc.get`, `gate.status`, `retriever.query`, `memory.classify`, `memory.promoteDraft`, `registry.topology`, `docbridge.snapshot|report|diagnostics|relations|run|proposals`, `knowledge.search|lookup|decision|concept|whyChanged` (`src/mcp/server.ts:49-214`). O conjunto pode ser filtrado por `surfaces.mcp.tools` (`src/mcp/server.ts:343-347`).

Exemplo real (teste):

```ts
// tests/mcp.test.ts:61-70
const result = handleMcpRequest(
  { root: fixtureRoot, config },
  { jsonrpc: '2.0', id: 1, method: 'tools/list' },
) as { tools: { name: string }[] }
expect(result.tools).toBe(MCP_TOOLS)
expect(result.tools).toHaveLength(19)
```

## Quem usa e do que depende

| Relação | Nota / evidência |
|---|---|
| Depende de | [[doc-bridge-indexacao]] (índice fresco), [[doc-bridge-gates-qualidade]] (`gate.status` chama `runGates`, `src/mcp/server.ts:452`) |
| Depende de | [[doc-bridge-memoria-vault]] (`memory.*`), [[doc-bridge-enriquecimento]] (`docbridge.proposals` ações `suggest`/`enrich-*`), [[doc-bridge-divergencia]] (`remediationWorkflow`, `src/mcp/server.ts:542`), [[doc-bridge-inteligencia]] (`retriever.query` → `retrieveDocBridgeChunks`) |
| Índice doc-bridge | `area:src/mcp` importa `src/schemas` (10), `src/query` (7), `src/execution` (5); `area:src/query` é importado por `tests` (26), `src/cli` (8), `src/mcp` (7) |
| Consumidores | Agentes de IDE via `.mcp.json` (`npx -y @agentskit/doc-bridge@2.1.0 mcp`, `.mcp.json:3-9`), MCPB/plugins de [[doc-bridge-distribuicao]], chat de [[doc-bridge-inteligencia]] (handoff-first) |
| Externo | `zod` para validar argumentos das ferramentas (`src/mcp/server.ts:220-270`) |

## Dados e efeitos

| Efeito | Detalhe | Evidência |
|---|---|---|
| Lê | Índice; por `doc.get`, o documento indexado com checagem de `realpath` contra escape da raiz | `src/mcp/server.ts:292-313`, `src/mcp/server.ts:447-450` |
| Lê | Estado de workflow em `.doc-bridge/workflow` (ou `workflow.stateDir`) para `docbridge.snapshot/report/diagnostics/relations/run` | `src/mcp/server.ts:315-334` |
| Grava | `docbridge.proposals` (`propose`/`revalidate`) salva `.doc-bridge/proposal.json` | `src/mcp/server.ts:336-341`, `src/mcp/server.ts:541-544` |
| Grava | `docbridge.proposals` `enrich-approve`/`enrich-reject` registra decisão no overlay; `suggest` roda o agente do Registry e persiste a proposta no diretório de workflow | `src/mcp/server.ts:513-538` |
| Recusa | `approve`/`apply` de remediação pelo MCP sempre falham ("return to a human through the local CLI") | `src/mcp/server.ts:540` |
| Grava (install) | `.cursor/mcp.json` no projeto, ou `~/Library/Application Support/Claude/claude_desktop_config.json` | `src/mcp/install.ts:42-45` |
| Rede / env | Nenhuma no caminho determinístico; `suggest` pode executar CLI/módulo do Registry (ver [[doc-bridge-enriquecimento]]) | — |
| Perfil service | Só 11 nomes de ferramenta permitidos; exige `loadIndex` injetado e `readDocument` para `doc.get`; respostas redigidas | `src/mcp/server.ts:350`, `src/mcp/server.ts:405` |

## Como mexer (para agentes)

- **Comece por** `docs/agent-corpus/query.md` / `docs/agent-corpus/mcp.md` / `docs/agent-corpus/cli.md` (startHere dos handoffs) e depois `src/mcp/server.ts` e `src/query/query.ts`.
- **Invariantes**: ferramentas determinísticas não chamam LLM (`AGENTS.md:16-17`); o servidor só lê o índice já publicado — o gate de publicação apenas avisa no stderr depois que o servidor sobe (`src/cli/program.ts:2056-2072`); orçamento declarado é contrato e falha fechado, o padrão só trunca (`src/query/query.ts:89-96`); novas ferramentas precisam entrar no enum de `surfaces.mcp.tools` (`src/config/schema.ts:311-337`), nos defaults (`src/config/defaults.ts:64-70`), no `mcpb/manifest.json` e nos testes de contrato.
- **Testes**: `tests/mcp.test.ts`, `tests/mcp-knowledge.test.ts`, `tests/knowledge-tools.test.ts`, `tests/query.test.ts`, `tests/knowledge-query.test.ts`, `tests/handoff-caveats.test.ts`, `tests/cli.test.ts`, `tests/cli-controls.test.ts`, `tests/demo-mcp.test.ts`, `tests/publication-gate-mcp.test.ts`.
- **Validação** (checks do índice): query `pnpm test && pnpm typecheck`; MCP `pnpm test && pnpm typecheck && pnpm smoke:packaged`; CLI `pnpm test && pnpm typecheck && node examples/verify-handoff.mjs` (`doc-bridge.config.json:40-67`).
- **Armadilhas**: `installMcpConfig('claude')` usa sempre o caminho do macOS, mesmo em Linux/Windows (`src/mcp/install.ts:44`); o `inputSchema` de `docbridge.proposals` não anuncia `approve`/`apply`, mas o parser os aceita só para recusar (`src/mcp/server.ts:178`, `src/mcp/server.ts:270`).

## Decisões e história

- [[doc-bridge ADR-0011 - Findings e remediação por região]] — `caveats` opcionais no handoff e MCP sem poder de aprovar.
- [[doc-bridge ADR-0012 - Perfil de serviço imposto pelo chamador]] — lista de ferramentas do perfil service.
- [[doc-bridge ADR-0025 - Gate opt-in de publicação]] — MCP avisa, nunca bloqueia.
- Recentes (`git log -- src/query src/mcp src/cli`): 2026-10-14 `c7d9240` gate de publicação; 2026-10-11 `2ec2a74` busca de agente deixa de falhar fechado no orçamento padrão; 2026-10-11 `9e4d5c5` `initialize` anuncia instruções; 2026-10-09 `10b5efd`/`c113930` consultas `why` com evidência de memória; 2026-10-09 `1249758` remediação L2 opcional na CLI.

> [!info]- Detalhe técnico
> - `instructions` só citam ferramentas anunciadas: `src/mcp/server.ts:359-372`.
> - `handoff.resolve` usa `runQuery(kind: ownership|package, agent: true)` e `budgetedHandoff` quando há `budgetTokens`: `src/mcp/server.ts:409-419`.
> - Frescor: re-hash dos inputs + versão do léxico e das métricas de grafo; índice sem `inputs` cai para rebuild completo: `src/query/load-index.ts:78-102`.
> - Capabilities listam `mcp` salvo `surfaces.mcp.enabled: false`: `src/index-builder/capabilities.ts:28`.

> [!bug] Existe, mas ninguém usa
> - `playbook.pattern.get` está no enum de `surfaces.mcp.tools` e na lista do perfil service, mas não existe em `MCP_TOOLS` (`src/config/schema.ts:318`, `src/mcp/server.ts:350`); o padrão só sai pela CLI `ak-docs playbook pattern`.
> - `surfaces.mcp.transport: 'http'` e `surfaces.mcp.http.{port,path}` são aceitos (`src/config/schema.ts:338-345`), mas só há servidor stdio (`src/mcp/server.ts:583`).
> - `surfaces.mcp.enabled: false` só some do capabilities; `ak-docs mcp` não consulta a chave (`src/cli/program.ts:2056-2058`).
