---
tipo: global
repo: doc-bridge
camada: ferramenta
visibilidade: publico
verificado-em: 2026-10-16
commits:
  "doc-bridge": f8824f1
metodo: "comparação das notas v1 (commit ca2c233) com o código; `git diff ca2c233 fd1e421` fora de `.brain/` é vazio, então as linhas valem nos dois commits; auditado em 2026-10-16 (auditoria v2: referências e afirmações reconferidas contra o código)"
fontes:
  - package.json
  - README.md
  - src/cli/program.ts
  - src/fixes/regions.ts
  - src/mcp/server.ts
  - src/query/load-index.ts
  - src/diff/change-set.ts
  - src/audit/documentation.ts
  - docs/adr/0018-opt-in-knowledge-entities.md
  - docs/adr/0019-memory-entity-evidence.md
  - docs/adr/0010-versioned-change-set-and-semantic-identity.md
  - docs/RELEASE.md
tags: [global, repo/doc-bridge, camada/ferramenta]
---

# Auditoria - doc-bridge

> [!tldr] Em linguagem comum
> Registro do que estava errado ou fraco nas notas v1 deste repositório e do que foi mudado na v2, mais divergências entre a documentação do próprio repo e o código.

← [[00 Hub - doc-bridge]]

## Auditoria v2 — 2026-10-16

Auditor independente das notas escritas por outro agente. Commit auditado: `f8824f1` (o código é idêntico ao de `ca2c233`; a diferença é só `.brain/`).

### Escopo e contagens

| Item | Resultado |
|---|---|
| Notas auditadas | 48 (hub, 10 notas de pacote/área, 1 app, 4 fluxos, 5 guias, índice de decisões, 25 ADRs, esta nota) |
| Referências `arquivo:linha[-linha]` conferidas | **813** na entrada (832 após as correções que acrescentaram evidência); 813/813 apontam para arquivo existente e linha dentro do arquivo |
| Referências com a linha errada | **3** corrigidas (ver abaixo); nas outras 810 li o trecho citado (primeiras linhas de cada intervalo) ao lado da afirmação e rodei a checagem automática de símbolo por vizinhança de ±2 linhas; nenhuma outra divergiu |
| Símbolos em backticks perto de referência | 553 testados; 55 não apareciam perto da linha citada; todos foram buscados no código e **existem** (eram palavras de enum, nomes de variável de ambiente ou símbolos definidos em outra linha) |
| Símbolos/caminhos em backticks sem linha | todos os caminhos de `tests/`, `docs/`, `scripts/`, `agents/`, `mcpb/` etc. citados existem; 38 hashes de commit citados existem e o assunto bate com o que a nota diz |
| Blocos de exemplo (`// arquivo:linhas`) | todas as linhas de código copiadas estão no arquivo citado, dentro do intervalo indicado (única exceção, um `…` de elisão em `doc-bridge-estudo`) |
| ADRs | 25 arquivos em `docs/adr/` ↔ 25 notas; status e data de cada nota e do índice batem com o arquivo (0018, 0019 e 0021 continuam `proposed` no arquivo) |
| Links wiki (duplo colchete) | 392; os únicos fora desta fatia são hubs/globais do vault completo (`Camada - Ferramentas`, `Dúvidas abertas`, `Capacidades não usadas`, hubs dos vizinhos, `engine-runner`) — não auditáveis aqui; toda nota tem um único link de volta |
| Comandos de validação em "Como mexer" | todos existem (scripts de `package.json`, workflows, `docs/adr/0022…:8`); não foram executados |

### Referências erradas corrigidas (3)

| Nota | Antes | Depois | Evidência |
|---|---|---|---|
| [[doc-bridge-indexacao]] | `extractKnowledgeEntities` → `src/entities/extract.ts:222` (essa linha é o helper `git`) | `src/entities/extract.ts:35` | `export const extractKnowledgeEntities` está em `src/entities/extract.ts:35` |
| [[Doc Bridge - Do repositório ao handoff]] | `resolveHandoffEntry` em `src/query/handoff.ts:84-90` (cortava o último `find`) | `src/query/handoff.ts:84-92` | a função fecha na linha 92 |
| [[doc-bridge-docs]] | `.gitignore:18-19` para `out` e `public/*` | `.gitignore:18-20` | a linha 20 é `!apps/docs/public/figures/` |

### Afirmações corrigidas

| Nota | O que estava errado | O que é certo | Evidência |
|---|---|---|---|
| [[doc-bridge-inteligencia]] | Invariante "nenhuma função da Layer 0 pode importar isto de forma estática" — a CLI importa `src/intelligence/chat.ts` estaticamente | Só os **peers** (`@agentskit/*`, `react`, `ink`) são carregados por `importPeer`; o módulo `src/intelligence` é estático na CLI | `src/cli/program.ts:33`, `src/intelligence/peers.ts:49-59` |
| [[doc-bridge-docs]] | "`apps/docs/public/*` gerados, ignorados pelo git" | ignorados **exceto** `apps/docs/public/figures/`, que é versionada | `.gitignore:19-20`; `git ls-files` lista `apps/docs/public/figures/*` |
| [[Doc Bridge - Do repositório ao handoff]] | Ordem de resolução "ownership → alias → caminho" | id da entidade → id de ownership → alias → caminho de área/pacote → qualquer caminho | `src/query/handoff.ts:84-92` |
| [[Doc Bridge - Do repositório ao handoff]] | "índice com hash inválido → regenerar" sem evidência | mensagem "Invalid index content hash … Run: ak-docs index" | `src/query/load-index.ts:55-56` |
| [[doc-bridge-indexacao]] | Contagens de importação do índice apresentadas como exatas | recontagem por `import` estático: `src/schemas` 13 (nota: 12), `tests` 65 (nota: 67), demais iguais; mantidas como "contagem do índice" com a recontagem ao lado | script de auditoria (imports relativos de `src/` e `tests/`) |
| [[Doc Bridge - Lançar uma versão]] | Estendia ao PR de versão a regra "PR de `GITHUB_TOKEN` não dispara CI" | o repo só documenta isso para o PR do sync do ecossistema; o PR de versão usa `github.token` mas o efeito não está documentado | `CONTRIBUTING.md:37-40`, `.github/workflows/changesets.yml:68` |
| [[doc-bridge-docs]] | "`apps/docs/AGENTS.md` é gerado pelo `next dev`" | é um bloco `nextjs-agent-rules` tratado como caminho gerado pelo config; quem o gera não está no repo | `apps/docs/AGENTS.md:1-9`, `doc-bridge.config.json:25-29` |
| [[doc-bridge-divergencia]] | `applyRemediation` descrito sem mencionar a reversão | backup, troca, `verify` e restauração em caso de falha | `src/fixes/write.ts:10-45`, `src/fixes/regions.ts:134` |

Evidência acrescentada (sem mudar o sentido): comandos `gate`/`conformance`/`audit`/`parity`/`rules` em [[doc-bridge-gates-qualidade]] (`src/cli/program.ts:1980`, `2008`, `1719`, `1720`, `2006`); comandos `retrieve`/`rag`/`chat`/`ask` em [[doc-bridge-inteligencia]] (`src/cli/program.ts:2204`, `2223`, `2258`, `2296`); `sync-version.mjs` também ressela `readme-standard-v1.json` em [[Doc Bridge - Lançar uma versão]] (`scripts/sync-version.mjs:72-83`).

### Afirmações removidas por não serem verificáveis

- [[doc-bridge-distribuicao]]: "repositórios que usam a Action (ex.: agents-playbook, segundo o hub v1)". Nada neste código prova consumidores externos; ficaram só os usos dentro do repo (`.github/workflows/doc-bridge-advisory.yml:20`, `.github/workflows/ci.yml:84-90`).
- [[doc-bridge-docs]]: origem do `apps/docs/AGENTS.md` ("gerado pelo `next dev`"), ver acima.
- [[Doc Bridge - Lançar uma versão]]: efeito de `GITHUB_TOKEN` sobre o PR de versão, ver acima.

Permanecem sinalizadas como não verificáveis por este repo (e já estavam marcadas): o host que serve `doc-bridge.agentskit.io` (Pages × Cloudflare), a relação com [[engine-runner]]/[[00 Hub - alexandria]] ("fixada em 2.0.0 segundo o hub de Alexandria"), a publicação do MCP em registries por [[00 Hub - ecosystem-distribution-ops]], e a dúvida sobre `agents/` sem `agent.json` ([[doc-bridge-enriquecimento]]). Os números "30 entidades, 640 entradas" do `metodo` do hub vêm de um índice gerado pela autora; **não foram regenerados** nesta auditoria (nada foi executado).

### Lacunas de cobertura

O repo publica **um único pacote npm** e um workspace (`pnpm-workspace.yaml:1`), mais o app `apps/docs`; as notas por "área" cobrem esses limites. Áreas de `src/` sem nota própria e sem nenhuma referência `arquivo:linha` (listadas, não escritas, porque passam de 3):

| Área | Quem a usa (evidência) |
|---|---|
| `src/render` (6 arquivos) | `ak-docs render` (`src/cli/usage.ts:57`); importada por `src/index-builder` |
| `src/studio` | `ak-docs studio export` (`src/cli/usage.ts:55`) |
| `src/reconciliation`, `src/report`, `src/workflow`, `src/budget` | `scan/reconcile/check/map` (`src/cli/usage.ts:34`); estado de workflow lido pelo MCP (`src/mcp/server.ts:315-334`) |
| `src/retrieval`, `src/graph` | citadas só como edit root no hub; sem arquivo de entrada nem testes indicados |
| `src/safety`, `src/lib`, `src/schemas`, `src/shims` | infraestrutura compartilhada; só mencionada de passagem |
| `src/playbook` | `ak-docs playbook`; a nota de consulta cita só a ferramenta MCP inexistente (`playbook.pattern.get`) |

Fluxos que faltam: `check`/`reconcile`/`rules` (reconciliação), estudo controlado (do plano ao ledger) e `ak-docs init`/`demo`. Notas globais (`Dúvidas abertas`, `Capacidades não usadas`) estão fora desta fatia e não puderam ser conferidas.

### Utilidade para agentes ("Como mexer")

Todas as 11 notas de pacote/app trazem arquivo de entrada, testes (todos os caminhos existem) e comando de validação que existe. Ajustes feitos: comandos `rag/chat/retrieve/ask` e `gate/conformance/audit/parity/rules` agora apontam para o despachante em `src/cli/program.ts`. Uma lacuna que permanece: para `src/render`, `src/studio`, `src/graph`, `src/retrieval` um agente não acha entrada/teste/validação em nenhuma nota (ver lacunas).

### Confiança por nota

| Nota | Confiança | Motivo |
|---|---|---|
| [[00 Hub - doc-bridge]] | alta | pacote, binários, entradas tsup, CI, deploy e vizinhos conferidos; só os números do índice e os vizinhos externos não são verificáveis aqui |
| [[doc-bridge-indexacao]] | alta | uma referência corrigida; contagens do índice anotadas |
| [[doc-bridge-consulta-mcp]] | alta | 19 ferramentas, lista do perfil service, invariantes e instalação conferidos |
| [[doc-bridge-divergencia]] | alta | ciclo de remediação, bloqueios e reversão conferidos linha a linha |
| [[doc-bridge-gates-qualidade]] | alta | gates, presets, reservados e conformidade conferidos |
| [[doc-bridge-enriquecimento]] | alta | limites, papéis e perfil service conferidos; dúvida sobre `agents/` mantida |
| [[doc-bridge-memoria-vault]] | alta | rotas, limites, git/gh e vault conferidos |
| [[doc-bridge-inteligencia]] | média | invariante da Layer 0 estava errada (corrigida); o resto bate |
| [[doc-bridge-armazenamento-servico]] | alta | contrato de IO, allowlist e CLI service conferidos |
| [[doc-bridge-distribuicao]] | média | Action, MCPB e plugins batem; consumidores externos não verificáveis |
| [[doc-bridge-estudo]] | alta | executor, env e custos conferidos; dúvida sobre allowlist mantida |
| [[doc-bridge-docs]] | média | duas afirmações corrigidas; host de produção continua incerto |
| 4 notas de fluxo | alta | passos conferidos; evidência de reversão acrescentada |
| 5 guias | alta | todos os comandos existem; um alcance corrigido em [[Doc Bridge - Lançar uma versão]] |
| [[00 Decisões - doc-bridge]] e 25 notas de ADR | alta | status, datas, fontes e implementações citadas batem |

## Erros e fragilidades da v1

| # | Nota v1 | Problema | Correção v2 |
|---|---|---|---|
| 1 | [[doc-bridge-inteligencia]] | Citava `package.json:195` como evidência dos peers; a linha 195 é `@changesets/cli` (devDependency). Peers ficam em `package.json:161-188` | Referência corrigida |
| 2 | [[doc-bridge-docs]] | Citava `package.json:107` para scripts do portal; a linha 107 é `"keywords": [`. Scripts ficam em `package.json:86-105` | Referência corrigida |
| 3 | [[00 Hub - doc-bridge]] | O aviso sobre métricas citava `README.md:97`, que é a seção "Verify documentation divergence" (`README.md:96-101`) e não trata de métricas | Aviso reancorado em `docs/adr/0002-documentation-audit-boundary.md:13` |
| 4 | [[doc-bridge-divergencia]] | "Do que depende: … autenticação de revisão humana" — o motor não autentica; recebe `authenticateHuman` do chamador e a CLI diz que `--by` "is not authentication" (`src/fixes/regions.ts:114-118`, `src/cli/program.ts:1087`) | Texto corrigido |
| 5 | [[doc-bridge-divergencia]] | Incluía a auditoria de documentação (`auditDocumentation`) como parte da divergência; é um módulo de qualidade separado (`src/audit/documentation.ts:257`) | Movida para [[doc-bridge-gates-qualidade]] |
| 6 | [[doc-bridge-consulta-mcp]] | Dizia que a única escrita do MCP era salvar proposta/decisão; omitia que `docbridge.proposals` `suggest` **executa** o agente do Registry (CLI ou módulo) e persiste a proposta (`src/mcp/server.ts:529-538`) | Incluído em "Dados e efeitos" |
| 7 | [[doc-bridge-inteligencia]] | Colocava o adaptador do Registry na camada de chat/RAG e listava "React" como peer de [[00 Hub - agentskit]] (é o pacote `react`) | Adaptador movido para [[doc-bridge-enriquecimento]]; peers listados com nome exato |
| 8 | v1 de indexação e divergência | Usavam o callout "Existe, mas ninguém usa" para limitações (opt-in, prosa não analisada), não para capacidades sem chamador | Callouts agora listam só capacidades sem uso real |
| 9 | Várias | Referências fracas a linhas de `import` (`src/diff/change-set.ts:1`, `src/audit/documentation.ts:1`, `src/query/load-index.ts:1`) | Trocadas por linhas que contêm o símbolo citado |
| 10 | Todas | Sem as seções v2 (API com exemplo real, dados e efeitos, como mexer, decisões); `fontes` com prefixo `doc-bridge/` e sem tag `camada/*` | Reescritas no formato v2 com caminhos relativos ao repo |

## Divergências entre docs do repo e código (não são erros da v1)

- ADR-0018 e ADR-0019 dizem `status: proposed`, mas estão implementados (config `index.knowledgeEntities`, `memoryRelations`) (`docs/adr/0018-opt-in-knowledge-entities.md:3`, `docs/adr/0019-memory-entity-evidence.md:3`).
- ADR-0010 diz "version routing is not implemented yet" (`docs/adr/0010-versioned-change-set-and-semantic-identity.md:25`), mas `stampChangeSet`/`changeSetEligibility` existem.
- `docs/RELEASE.md` ainda fala em "Current track: `1.7.45` stable" (`docs/RELEASE.md:35`) com o pacote em 2.1.0 (`package.json:3`).

O que não foi confirmado pertence a [[Dúvidas abertas]]; capacidades condicionais ou sem chamador encontrado vão para [[Capacidades não usadas]].
