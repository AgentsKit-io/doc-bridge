---
tipo: pacote
repo: doc-bridge
camada: ferramenta
npm: "@agentskit/doc-bridge"
visibilidade: publico
verificado-em: 2026-10-16
commits:
  "doc-bridge": fd1e421
metodo: "análise estática do código; índice doc-bridge gerado localmente (`node bin/ak-docs.js index`) e handoff `ak-docs query package doc-bridge-index --agent` usados como evidência de edit root, checks e relações; testes não executados"
fontes:
  - src/index-builder/build-index.ts
  - src/index-builder/build-handoffs.ts
  - src/index-builder/scan-corpus.ts
  - src/index-builder/content-hash.ts
  - src/index-builder/human-adapters/index.ts
  - src/index-builder/watch-index.ts
  - src/discovery/repository.ts
  - src/discovery/areas.ts
  - src/entities/extract.ts
  - src/config/schema.ts
  - src/config/defaults.ts
  - src/query/load-index.ts
  - src/index.ts
  - tests/index-builder.test.ts
  - doc-bridge.config.json
  - package.json
  - src/cli/program.ts
  - docs/adr/0010-versioned-change-set-and-semantic-identity.md
  - docs/adr/0013-language-neutral-discovery-adapters.md
  - docs/adr/0018-opt-in-knowledge-entities.md
tags: [pacote, repo/doc-bridge, camada/ferramenta]
---

# doc-bridge-indexacao

> [!tldr] Em linguagem comum
> É o cartógrafo: lê o projeto (código, documentos, manifestos e quem é dono de cada pasta) e transforma tudo num mapa consultável — um arquivo `.doc-bridge/index.json`, um `llms.txt` para IAs e um resumo de capacidades.

← [[00 Hub - doc-bridge]]

## O que faz e por que existe

Área interna de `src/` (não é pacote npm separado) que implementa o passo **observar → declarar → projetar** (`src/index-builder/build-index.ts:89-96`):

1. **Descoberta** (`src/discovery/`): percorre o repositório com limites de segurança, extrai módulos JS/TS, documentos Markdown, pacotes, **áreas** (diretórios entre pacote e arquivo), fatos de superfície (símbolos, comandos/flags de CLI, chaves de config, assinaturas) e relações (imports, `covers`, `mentions`, `links-to`…), produzindo um `DiscoverySnapshotV1` com hash semântico (`src/discovery/repository.ts:169-243`).
2. **Corpus e roteamento** (`src/index-builder/`): lê o corpus de agentes, descobre pacotes pnpm/npm/yarn/Nx, adapta sites humanos (Fumadocs, Docusaurus, VitePress, Starlight, Nextra, Markdown simples) e monta `lookup` + `handoffs` por ownership (`src/index-builder/build-index.ts:192-215`).
3. **Projeção** de recuperação: toda entidade observada vira entrada pesquisável, com o overlay de enriquecimento aceito somente quando o Registry está ligado (`src/index-builder/build-index.ts:126-142`).

Existe para que consulta, MCP, gates e diff trabalhem sobre **um artefato reprodutível e verificável por hash**, em vez de varrer o repo a cada pergunta. Limites: não interpreta prosa; o que não analisa vira cobertura `not-analyzed`/`partial`, nunca sucesso silencioso.

## API e contratos

| Símbolo | Tipo | Para que serve | Onde |
|---|---|---|---|
| `buildDocBridgeIndex(opts: BuildIndexOptions): BuildIndexResult` | função | Constrói (e por padrão grava) índice, `llms.txt` e capabilities a partir do disco local | `src/index-builder/build-index.ts:169` |
| `buildStoredDocBridgeIndex(options): Promise<StorageResult>` | função | Mesmo build sobre `RepositoryReadV1`/`ArtifactIOV1` de uma partição exata | `src/index-builder/build-index.ts:337` |
| `discoverRepository(opts?)` / `discoverRepositoryWithRead(read, opts?)` | função | Snapshot local / snapshot por leitura injetada com binding de partição | `src/discovery/repository.ts:247`, `src/discovery/repository.ts:267` |
| `watchDocBridgeIndex(opts)` | função | Reconstrói ao detectar mudanças (`ak-docs index --watch`) | `src/index-builder/watch-index.ts:41` |
| `collectPackages`, `buildLookup` | função | Pacotes + tabela de ownership/handoffs | `src/index-builder/build-handoffs.ts:54`, `src/index-builder/build-handoffs.ts:137` |
| `contentHashForIndex`, `SEMANTIC_HASH_ALGORITHM`, `LEGACY_HASH_ALGORITHM` | função/const | Hash do índice; `sha256-semantic-v1` atual, `sha256-normalized-v1` só para migração | `src/index-builder/content-hash.ts:31-32`, `src/index-builder/content-hash.ts:67` |
| `deriveAreas`, `DEFAULT_AREA_ROOTS` | função/const | Áreas por convenção (`src`, `lib`, `app`, `packages`, `apps`…) e ownership | `src/discovery/areas.ts:28`, `src/discovery/areas.ts:133` |
| `extractKnowledgeEntities` | função | Seção opt-in `knowledgeEntities` (decisões, conceitos, mudanças) com histórico git limitado | `src/entities/extract.ts:222`, `src/index.ts:1127` |
| `DocBridgeIndexV1Schema`, `INDEX_SCHEMA_VERSION` | schema Zod | Contrato estrito do índice | `src/index.ts:51-61` |
| CLI `ak-docs index [--watch] [--allow-pending-findings]`, `ak-docs discover` | comando | Superfície humana/CI | `src/cli/program.ts:1565-1577` |

Exemplo real (teste):

```ts
// tests/index-builder.test.ts:42-50
const config = loadFixtureConfig()
const result = buildDocBridgeIndex({ root: fixtureRoot, config })
expect(existsSync(join(fixtureRoot, '.doc-bridge/index.json'))).toBe(true)
expect(result.index.lookup?.ownership?.['os-core']?.path).toBe('packages/os-core')
```

## Quem usa e do que depende

| Relação | Nota / evidência |
|---|---|
| Consumidor | [[doc-bridge-consulta-mcp]] — `loadFreshDocBridgeIndex` revalida o índice antes de cada consulta (`src/query/load-index.ts:73-103`) |
| Consumidor | [[doc-bridge-gates-qualidade]] — gates `index-freshness`, `index-reproducible`, `human-guide-links` reconstroem em memória |
| Consumidor | [[doc-bridge-divergencia]] — snapshots base/head vêm de `discoverRepository*` |
| Consumidor | [[doc-bridge-memoria-vault]] — `exportVault` roda descoberta; o build liga memórias a entidades (`src/index-builder/build-index.ts:148-150`) |
| Consumidor externo | [[engine-runner]] em [[00 Hub - alexandria]] (API pública) |
| Índice doc-bridge | `area:src/index-builder` importa `src/lib` (21), `src/config` (12), `src/schemas` (12); é importado por `tests` (67), `src/cli` (16), `src/discovery` (15) |
| Depende de | [[doc-bridge-armazenamento-servico]] (perfil e IO), [[doc-bridge-enriquecimento]] (overlay aceito) |
| Externas | `typescript` (parser), `unified`/`remark-*`, `graphology*`, `minimatch`, `ignore`, `zod` (`package.json:134-159`) |

## Dados e efeitos

| Efeito | Detalhe | Evidência |
|---|---|---|
| Lê | Arquivos permitidos por `safety` (exclusões, `maxFiles`, `maxBytes`) via `safeWalkOptions` | `src/discovery/repository.ts:175-178` |
| Executa | `git status --porcelain` e `git rev-parse HEAD` para `sourceRevision` (cai para hash de conteúdo se sujo ou sem git; nunca no perfil service) | `src/discovery/repository.ts:66-79` |
| Executa (opt-in) | `git` com `protocol.allow=never`, `GIT_TERMINAL_PROMPT=0`, timeout 10 s, para histórico de entidades | `src/entities/extract.ts:222` |
| Grava | `.doc-bridge/index.json` (ou `index.outFile`) | `src/index-builder/build-index.ts:177`, `src/index-builder/build-index.ts:277-280` |
| Grava | `llms.txt` (desligável em `index.llmsTxt.enabled`) | `src/index-builder/build-index.ts:284-295` |
| Grava | `.doc-bridge/capabilities.json` (desligável) | `src/index-builder/build-index.ts:298-312` |
| Lê (condicional) | Overlay `.doc-bridge/enrich/overlay.json` só com `intelligence.registry.enabled` | `src/index-builder/build-index.ts:131-133` |
| Redação | Perfil service redige segredos dos documentos e do índice | `src/index-builder/build-index.ts:120`, `src/index-builder/build-index.ts:257` |
| Rede / env | Nenhuma chamada de rede; nenhuma variável de ambiente lida pelo build | — |

## Como mexer (para agentes)

- **Comece por** `docs/agent-corpus/INDEX.md` (startHere do handoff `doc-bridge-index`) e `src/index-builder/build-index.ts`; descoberta em `src/discovery/repository.ts`.
- **Invariantes**: o índice é função do snapshot — sem scanner próprio (`src/index-builder/build-index.ts:217-223`); `knowledge[]` não pode passar de `RETRIEVAL_MAX_ENTRIES`, senão o build falha em vez de gravar algo que leitores rejeitam (`src/index-builder/build-index.ts:270-275`); emissão com hash legado é proibida (`src/index-builder/build-index.ts:176`); entidades de conhecimento exigem hash semântico (`src/index-builder/build-index.ts:174`); `generatedAt` é preservado quando o `contentHash` não muda (`src/index-builder/build-index.ts:155-167`) — é isso que torna o build duplo da CI byte-idêntico.
- **Agrupamentos de comunidade** (dependência `graphology-communities-louvain`, `package.json:141`) viram cobertura `not-analyzed`, nunca entidade de área (`src/discovery/repository.ts:218-228`).
- **Testes**: `tests/index-builder.test.ts`, `tests/discovery.test.ts`, `tests/incremental.test.ts`, `tests/areas.test.ts`, `tests/human-adapters.test.ts`, `tests/index-storage.test.ts`, `tests/reproducibility.test.ts`, `tests/knowledge-entities.test.ts`, `tests/watch-index.test.ts`.
- **Validação** (checks do handoff, `doc-bridge.config.json:47-52`): `pnpm test && pnpm typecheck && node bin/ak-docs.js index`; para um teste: `pnpm vitest run tests/index-builder.test.ts`.
- **Armadilhas**: mudar versão de analisador (`PIPELINE_VERSION`, `ANALYZER_VERSIONS`, `src/discovery/repository.ts:82-83`) invalida reuso incremental e muda o hash; mudar léxico de busca torna índices antigos "stale" (`src/query/load-index.ts:86-94`); plugins humanos `mkdocs`/`custom` passam no schema mas não têm adaptador (ver abaixo).

## Decisões e história

- [[doc-bridge ADR-0010 - ChangeSet versionado e identidade semântica]] — hash semântico separado de proveniência (revisão, timestamp).
- [[doc-bridge ADR-0013 - Adaptadores de descoberta neutros de linguagem]] — JS/TS como primeiro plugin do contrato v2.
- [[doc-bridge ADR-0014 - IO plugável e partições por revisão]] — `buildStoredDocBridgeIndex`.
- [[doc-bridge ADR-0018 - Entidades de conhecimento opt-in]] e [[doc-bridge ADR-0024 - Scripts de entrada e citações de palavra solta]].
- Recentes (`git log -- src/index-builder src/discovery src/retrieval`): 2026-10-14 `c7d9240` gate de publicação respeitado pelo `index`; 2026-10-11 `83dcd66` ranking prioriza registros sobre a consulta; 2026-10-11 `43e8a5f` palavras soltas não citam scripts de entrada; 2026-10-09 `e70891a` limpeza 2.0 (hashes, memória); 2026-10-08 `57da536` entidades de conhecimento opt-in.

> [!info]- Detalhe técnico
> - Seleção de descoberta de pacotes: `pnpm-monorepo`/`npm-workspaces`/`yarn-workspaces` ou `nx` (`src/index-builder/build-index.ts:200-211`).
> - Adaptadores humanos registrados: `src/index-builder/human-adapters/index.ts:16-24`; plugin sem adaptador é pulado em silêncio: `src/index-builder/human-adapters/index.ts:50-51`.
> - Defaults de índice (`outFile`, `llmsTxt`, `capabilities`): `src/config/defaults.ts:29-43`.
> - Build particionado nega `PARTITION_MISMATCH` e para em cobertura `limits:*` parcial: `src/index-builder/build-index.ts:344-353`.

> [!bug] Existe, mas ninguém usa
> - `corpus.human.plugin: 'mkdocs'` e `'custom'` são aceitos pelo schema (`src/config/schema.ts:5-15`), mas não há adaptador: `scanHumanDocRecords` pula o corpus sem aviso (`src/index-builder/human-adapters/index.ts:50-51`).
> - Entidades de conhecimento e Obsidian são opt-in; este próprio repo não liga `index.knowledgeEntities` (`doc-bridge.config.json:1-159`), e `ak-docs why src/diff` responde `enabled: false`.
