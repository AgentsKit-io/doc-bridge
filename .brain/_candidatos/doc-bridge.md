# Candidatos globais — doc-bridge

Matéria-prima para as notas globais (Glossário, Mapa de dependências, Infra e deploy, Onde ficam os dados, Dúvidas abertas, Capacidades não usadas, conceitos/). Commit `fd1e421` (código idêntico a `ca2c233`). Caminhos relativos ao repo `doc-bridge`.

## Conceitos

- **Handoff (AgentHandoffV1)** → Resposta determinística a "onde mexo?": `startHere`, `readBeforeEditing`, `editRoots`, `checks`, `humanDoc`, `related` e `explain` com a origem de cada campo. Orienta, não autoriza edição; executar `checks` é do consumidor. → [[doc-bridge-consulta-mcp]], [[Doc Bridge - Do repositório ao handoff]], [[doc-bridge-distribuicao]] → `src/query/handoff.ts:335`, `src/mcp/server.ts:55-69`, `skills/doc-bridge-handoff/SKILL.md:15-28`.
- **Layer 0 / Layer 1 / L2** → Layer 0 é o núcleo determinístico sem LLM nem chave (`init`, `index`, `query`, `list`, gates, ferramentas MCP de handoff); Layer 1 são camadas opcionais (RAG/chat, advisory de PR); L2 é a remediação interpretativa proposta por provedor e aceita só por reanálise determinística. → [[00 Hub - doc-bridge]], [[doc-bridge-inteligencia]], [[doc-bridge-divergencia]] → `AGENTS.md:16-17`, `src/intelligence/peers.ts:14-15`, `docs/adr/0022-l2-remediation-acceptance.md:21-31`.
- **Snapshot de descoberta (DiscoverySnapshotV1)** → Observação canônica do repositório (entidades, relações, cobertura, `sourceRevision`, versões de analisadores) com hash semântico. Tudo — índice, diff, vault — deriva dele. → [[doc-bridge-indexacao]], [[doc-bridge-divergencia]] → `src/discovery/repository.ts:86-104`.
- **Hash semântico vs. proveniência** → `sha256-semantic-v1` identifica o conteúdo e exclui revisão, timestamp e estatística de reuso; proveniência fica em campos separados. Hashes de algoritmos diferentes nunca são comparados. → [[doc-bridge-indexacao]], [[doc-bridge ADR-0010 - ChangeSet versionado e identidade semântica]] → `src/index-builder/content-hash.ts:31-32`, `docs/adr/0010-versioned-change-set-and-semantic-identity.md:21-23`.
- **Área** → Unidade de arquitetura entre pacote e arquivo, derivada por convenção (`src`, `lib`, `app`, `packages`, `apps`…) e por ownership; cada módulo pertence a uma área. Agrupamentos de comunidade nunca viram área. → [[doc-bridge-indexacao]] → `src/discovery/areas.ts:28`, `src/discovery/repository.ts:106-167`.
- **Cobertura `not-analyzed`/`partial`** → Forma explícita de dizer "não analisei isto"; nunca vira sucesso silencioso. Usada para limites, capacidades ausentes, perfil service e prosa natural. → todas as notas de pacote → `src/execution/profile.ts:23-26`, `src/diff/change-set.ts:365-379`.
- **ChangeSet (ChangeSetV1)** → Lista canônica de mudanças entre dois snapshots (arquivos, símbolos, CLI, config, assinaturas, pacotes) com compatibilidade provada e hash semântico. → [[doc-bridge-divergencia]] → `src/diff/change-set.ts:46-96`, `src/diff/change-set.ts:359`.
- **Finding / Remediação por região / Decisão** → Três contratos separados: o problema com evidência e status epistêmico; a correção como edições de bytes exatos com hash; a decisão humana atribuída. Roteamento não muda o status; apresentação não é aceitação. → [[doc-bridge-divergencia]], [[doc-bridge ADR-0011 - Findings e remediação por região]] → `src/findings/contracts.ts:12-24`, `src/fixes/regions.ts:100-143`.
- **Perfil `service` (teto de capacidades)** → Modo imposto pelo chamador que o repositório não consegue relaxar: sem módulos do repo, processos, rede, publicação, watch ou escrita local; config filtrado por allowlist de folhas. Não é sandbox de SO. → [[doc-bridge-armazenamento-servico]], [[doc-bridge ADR-0012 - Perfil de serviço imposto pelo chamador]] → `src/execution/profile.ts:12-20`, `src/execution/config.ts:6-53`.
- **Partição** → Par `{repositoryId, revision}` ao qual toda leitura e artefato ficam presos; sem fallback para "latest". → [[doc-bridge-armazenamento-servico]] → `src/storage/contract.ts:6`, `src/storage/contract.ts:52`.
- **Overlay de enriquecimento** → Arquivo com sugestões de agentes (aceitas/pendentes/rejeitadas) que só soma relações ao grafo observado e expira quando o alvo muda; desligar o Registry restaura o baseline. → [[doc-bridge-enriquecimento]] → `src/enrich/overlay.ts:30-35`, `src/index-builder/build-index.ts:126-134`.
- **Gate (e gate de publicação)** → Verificação determinística passa/falha; o gate opt-in `reference-findings` impede `ak-docs index` de publicar contexto com citações quebradas, com override registrado. → [[doc-bridge-gates-qualidade]], [[doc-bridge ADR-0025 - Gate opt-in de publicação]] → `src/gates/run-gates.ts:193-216`, `src/gates/run-gates.ts:409-436`.
- **Advisory** → Comentário de PR apenas informativo com findings de base/head; separado dos gates bloqueantes. → [[doc-bridge-distribuicao]], [[Doc Bridge - Do PR ao advisory]] → `src/cli/action.ts:150-169`, `action.yml:135-163`.
- **Índice commitado vs. CI-built** → `committed` valida o índice versionado; `ci-built` gera um isolado fora do checkout e ainda reporta drift do versionado. → [[doc-bridge ADR-0015 - Action de advisory e índice gerado na CI]] → `src/cli/action.ts:86-123`.
- **Entidades de conhecimento** → Seção opt-in do índice com decisões, conceitos e mudanças históricas, com evidência e histórico git limitado. → [[doc-bridge-indexacao]] → `src/config/schema.ts:43-47`, `src/index-builder/build-index.ts:143-151`.
- **Vault gerado** → Notas Obsidian de navegação exportadas para pasta ignorada; edições viram propostas `vault-edit`. → [[doc-bridge-memoria-vault]] → `src/vault/export.ts:88-97`, `src/vault/diff.ts:27-81`.

## Glossário

- `ak-docs` — CLI do motor (`package.json:8`). `ak-verify` — repasse ao CLI do harness (`bin/ak-verify.js:5-7`).
- `startHere` / `readBeforeEditing` / `editRoots` / `checks` — campos do handoff.
- `llms.txt` — índice textual para LLMs gerado pelo `index` (`src/index-builder/build-index.ts:284-295`).
- `capabilities.json` — resumo do que o repo expõe (CLI/MCP) (`src/index-builder/capabilities.ts:5`).
- `purl` / `vers` — identidade de pacote e notação de faixa de versões adotadas pelo ADR-0010.
- `hit@3` — fração de casos da suíte dourada com alvo esperado no top 3; nota A do doctor exige ≥ 0,8 (`src/doctor/run-doctor.ts:27`).
- MCPB — bundle MCP instalável (Claude Desktop) (`mcpb/manifest.json:1-33`).
- `BROKEN_REFERENCE` / `AMBIGUOUS_REFERENCE` / `CHANGED_REFERENCE` — códigos de finding (`src/gates/reference-findings.ts:13`).
- `documentation-standard-v1` — padrão de documentação com 9 regras (`src/config/schema.ts:508-518`).

## Arestas de dependência

- doc-bridge --> harness : dependência fixa `@agentskit/harness` 0.22.3 e binário `ak-verify` : `package.json:136`, `bin/ak-verify.js:5-7`
- doc-bridge --> agentskit : deps diretas `@agentskit/cross-platform`, `@agentskit/net` : `package.json:135`, `package.json:137`
- doc-bridge --> agentskit : peers opcionais `@agentskit/{core,rag,adapters,memory,ink}` + `react` para RAG/chat : `package.json:161-188`
- doc-bridge --> agentskit : gate HITL opcional `@agentskit/core/hitl` : `src/enrich/approvals.ts:171-180`
- doc-bridge --> agentskit-registry : agente padrão `ecosystem-doc-bridge-corpus-scanner`, instalação `npx agentskit add <id>` : `src/agents/registry-adapter.ts:15`, `src/agents/registry-adapter.ts:208`
- doc-bridge-docs --> agentskit-chat : `@agentskit/chat` 0.4.1 (dev) no widget do portal : `package.json:190`, `apps/docs/components/chat-widget.tsx:4-5`
- doc-bridge-docs --> agentskit (serviço Ask) : endpoint padrão `ask.agentskit.io/v1/ask` com `corpus: 'doc-bridge'` : `apps/docs/components/chat-widget.tsx:30`
- doc-bridge (CI) --> doc-bridge (Action 2.0.0) : advisory deste repo fixa a Action no commit da 2.0.0 : `.github/workflows/doc-bridge-advisory.yml:20`
- alexandria --> doc-bridge : `engine-runner` consome a API pública (evidência no hub de Alexandria, não neste repo)

## Infra e deploy

- npm `@agentskit/doc-bridge` público; caminho rotineiro Changesets (`changesets.yml`, ambiente `npm`, Trusted Publishing/OIDC, provenance); `release.yml` por tag `v*.*.*` como recuperação guardada (`docs/RELEASE.md:41-49`, `.github/workflows/changesets.yml:15-71`, `.github/workflows/release.yml:3-148`).
- Portal: GitHub Pages automático com CNAME `doc-bridge.agentskit.io` (`.github/workflows/pages.yml:34-54`); Cloudflare Workers static assets `ak-doc-bridge`, `workers_dev = true`, deploy manual `pnpm cf:deploy` (`wrangler.toml:4-11`, `package.json:105`); `vercel.json` presente (`vercel.json:15-18`).
- CI: `ubuntu-latest`, pnpm 11.19.0, Node 22 (release usa Node 24) (`.github/workflows/ci.yml:18-28`, `.github/workflows/release.yml:38-40`).
- `ecosystem-sync.yml` cron `17 6 * * *` (UTC) abre PR em `automation/ecosystem-upstream` (`.github/workflows/ecosystem-sync.yml:3-6`).
- Sem banco, fila ou serviço hospedado no repo; o motor roda local/CI.

## Onde ficam os dados

- `.doc-bridge/index.json`, `.doc-bridge/capabilities.json`, `llms.txt` (gerados; ignorados neste repo) (`.gitignore:9-10`).
- `.doc-bridge/workflow/` (estado de workflow), `.doc-bridge/proposal.json`, `.doc-bridge/enrich/overlay.json` + `cache/`, `.doc-bridge/approvals/`, `.doc-bridge/drafts/`, `.doc-bridge/vault/` + `.doc-bridge-vault.json`, `.doc-bridge/vectors/`, `.doc-bridge/coverage-badge.json`.
- Entradas de memória: `.agent-memory/`, `.cursor/rules/` (`src/config/defaults.ts:89-92`).
- Env (nomes): `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `OPENROUTER_API_KEY` (Layer 1); `GITHUB_ACTIONS`; `DOC_BRIDGE_TOKEN` e demais `DOC_BRIDGE_*` na Action; `NEXT_PUBLIC_*`, `DOCS_BASE_PATH`, `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID` no portal.
- Lista de espera do portal envia e-mail para `NEXT_PUBLIC_WAITLIST_URL` (destino fora do repo) (`apps/docs/components/home/waitlist-form.tsx:46-54`).

## Dúvidas abertas

- Qual host serve `doc-bridge.agentskit.io` hoje: GitHub Pages ou Cloudflare Workers? (`.github/workflows/pages.yml:46-49`, `wrangler.toml:6`)
- Qual serviço recebe `NEXT_PUBLIC_WAITLIST_URL`? Provavelmente o Worker de lista de espera de [[00 Hub - alexandria]], mas não há evidência neste repo.
- `agents/` tem cópias de agentes do Registry sem `agent.json`/`manifest.json`, que o adaptador exige (`src/agents/registry-adapter.ts:209-210`); servem só a `scripts/run-registry-semantic-review.mjs`?
- `runAttempt` do estudo herda `process.env` inteiro sem `envAllowlist` (`src/study/runner.ts:324-325`), em tensão com ADR-0009.
- `ink` é importado como peer (`src/intelligence/chat.ts:118`) sem estar em `peerDependencies`.
- MCPB declara só `darwin` (`mcpb/manifest.json:125-127`): intencional?
- `installMcpConfig('claude')` grava sempre no caminho do macOS (`src/mcp/install.ts:44`).
- `surfaces.mcp.enabled: false` não impede `ak-docs mcp` (`src/cli/program.ts:2056-2058`).
- ADR-0018/0019/0021 seguem `proposed` com 0018/0019 implementados; atualizar status?
- `docs/RELEASE.md` desatualizado (1.7.45 vs 2.1.0).

## Capacidades não usadas

- Gates reservados `link-rot`, `routing-currency`, `bootstrap-size` (aviso e nada roda) (`src/gates/run-gates.ts:33`, `src/gates/run-gates.ts:422-428`).
- Plugins humanos `mkdocs` e `custom` sem adaptador (`src/config/schema.ts:5-15`, `src/index-builder/human-adapters/index.ts:16-24`).
- Ferramenta MCP `playbook.pattern.get` só no schema e na lista do perfil service (`src/config/schema.ts:318`, `src/mcp/server.ts:350`).
- `surfaces.mcp.transport: 'http'` + `http.{port,path}` sem servidor HTTP (`src/config/schema.ts:338-345`).
- `intelligence.retriever.{enabled,mode,embedModel,chunkSize}`, `intelligence.runtime`, `intelligence.runtimeModule`, `intelligence.memory.classify`, `intelligence.memory.promote.*` não lidos em `src/` (`src/config/schema.ts:383-415`).
- API legada `applyFixProposal`, `createMarkdownLinkFixProposal`, `createArtifactNormalizationProposal`, e `mergeRemediation`/`stampChangeSet` sem chamador interno (`src/index.ts:296-303`, `src/index.ts:1113`, `src/index.ts:1120`).
- Ingestão de docs humanas no RAG comentada como futura (`src/intelligence/rag.ts:66`).
- Este repo não liga `index.knowledgeEntities` (`ak-docs why` responde `enabled: false`).
