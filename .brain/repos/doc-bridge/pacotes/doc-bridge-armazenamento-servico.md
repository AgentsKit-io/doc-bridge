---
tipo: pacote
repo: doc-bridge
camada: ferramenta
npm: "@agentskit/doc-bridge"
visibilidade: publico
verificado-em: 2026-10-16
commits:
  "doc-bridge": f8824f1
metodo: "análise estática do código; índice doc-bridge gerado localmente usado para relações (`area:src/execution` aparece como dependência de query, mcp e fixes); nenhum backend externo foi exercitado; testes não executados; auditado em 2026-10-16 (auditoria v2: referências e afirmações reconferidas contra o código)"
fontes:
  - src/storage/contract.ts
  - src/storage/local.ts
  - src/storage/artifacts.ts
  - src/storage/operation.ts
  - src/execution/profile.ts
  - src/execution/config.ts
  - src/execution/repository.ts
  - src/plugins/contract.ts
  - src/cli/service.ts
  - src/cli/program.ts
  - src/index-builder/build-index.ts
  - src/discovery/repository.ts
  - src/mcp/server.ts
  - src/index.ts
  - tests/index-storage.test.ts
  - docs/adr/0012-caller-enforced-service-profile.md
  - docs/adr/0013-language-neutral-discovery-adapters.md
  - docs/adr/0014-pluggable-io-and-revision-partitions.md
tags: [pacote, repo/doc-bridge, camada/ferramenta]
---

# doc-bridge-armazenamento-servico

> [!tldr] Em linguagem comum
> É a parte que deixa o Doc Bridge rodar com segurança dentro do sistema de outra pessoa: em vez de ler e gravar livremente no disco, ele usa "tomadas" de leitura e escrita entregues por quem o chama, presas a uma versão exata do repositório, e um modo restrito que desliga tudo o que poderia executar código ou acessar a rede.

← [[00 Hub - doc-bridge]]

## O que faz e por que existe

Nota nova da v2. Três peças transversais:

- **IO plugável por partição** (`src/storage/`): `RepositoryReadV1` (listar, `stat`, ler bytes verificados por hash) e `ArtifactIOV1` (ler, listar e `replaceAtomic` com compare-and-swap pelo `byteHash` anterior), sempre amarrados a uma `Partition` `{ repositoryId, revision }` (`src/storage/contract.ts:6`, `src/storage/contract.ts:27-51`). Há implementações locais (`createLocalRepositoryRead`, `createLocalArtifactIO`) e o chamador pode trazer a sua.
- **Perfil de execução** (`src/execution/`): `local` ou `service`, propagado por `AsyncLocalStorage`; uma vez `service`, chamadas aninhadas não voltam a `local` (`src/execution/profile.ts:7-20`). `serviceConfig` filtra o config do repositório por uma **allowlist de folhas** e força segredos redigidos, sem `llms.txt`/capabilities, sem inteligência/Registry e sem federação (`src/execution/config.ts:6-53`).
- **Plugins de descoberta v2** (`src/plugins/contract.ts`): manifesto com capacidades e limites, registrado pelo chamador (`src/plugins/contract.ts:151`).

Existe para que um consumidor hospedado (por exemplo [[00 Hub - alexandria]]) possa usar o motor sobre repositórios não confiáveis com um **teto de capacidades imposto pelo chamador**, não pelo repositório. Não é sandbox de SO e não prova que exista um serviço hospedado deste repo ([[doc-bridge ADR-0012 - Perfil de serviço imposto pelo chamador]]).

## API e contratos

| Símbolo | Tipo | Para que serve | Onde |
|---|---|---|---|
| `RepositoryReadV1`, `ArtifactIOV1`, `Partition`, `StorageLimits`, `StorageResult` | tipos | Contrato de IO; falhas são valores (`missing`, `mismatch`, `denied`, `limit`, `cancelled`, `error`) | `src/storage/contract.ts:6-51` |
| `StorageFailureCodeSchema` | enum | `PARTITION_MISMATCH`, `CONTENT_MISMATCH`, `PATH_DENIED`, `FILE_LIMIT`, `CAS_CONFLICT`… | `src/storage/contract.ts:10` |
| `ArtifactKindSchema` | enum | `snapshot`, `index`, `overlay`, `cache`, `approval`, `workflow`, `proposal` | `src/storage/contract.ts:35` |
| `createLocalRepositoryRead(options)` | função | Leitura local contra um inventário de hashes confirmado pelo chamador | `src/storage/local.ts:103` |
| `createLocalArtifactIO(options)` | função | Artefatos locais em `<root>/<hash-da-partição>/<kind>/<name>.json` | `src/storage/artifacts.ts:39-46` |
| `createOperation(reader, options)` | função | Orçamento de tempo, cancelamento, progresso e métricas (`--max-duration`, `--progress`) | `src/storage/operation.ts:16` |
| `withExecutionProfile`, `executionContext`, `denyServiceOperation` | função | Selecionar e impor o perfil | `src/execution/profile.ts:12-20` |
| `serviceConfig(input)`, `SERVICE_CONFIG_LEAVES` | função/const | Filtro do config + diagnósticos de chaves ignoradas | `src/execution/config.ts:6-15` |
| `createDiscoveryRegistryV2`, `createJsTsPluginV2`, `createMarkdownPluginV2`, `createObsidianPluginV2` | função | Registro e plugins embutidos v2 | `src/plugins/contract.ts:151`, `src/index.ts:1100-1103` |
| CLI `ak-docs --profile service validate-config|discover|index|search|why|mcp` | comando | Única porta de linha de comando do perfil | `src/cli/program.ts:1566-1573`, `src/cli/service.ts:26-27` |

Exemplo real (teste):

```ts
// tests/index-storage.test.ts:53-58
const repository = await createLocalRepositoryRead({ root, partition, limits, inventory: inventory(root) })
const artifacts = await createLocalArtifactIO({ root: temporary(), partition, limits })
const legacy = buildDocBridgeIndex({ root, config, snapshot, overlay: 'ignore', write: false }).index
expect((await writeJsonArtifact(artifacts, request, { kind: 'index', name: 'index' }, 'DocBridgeIndexV1', legacy, null)).status).toBe('ok')
const built = await buildStoredDocBridgeIndex({ ...request, repository, artifacts, config, snapshot, overlay: 'ignore' })
expect(built.status).toBe('ok')
```

## Quem usa e do que depende

| Relação | Nota / evidência |
|---|---|
| Consumidor | [[doc-bridge-indexacao]] (`buildStoredDocBridgeIndex`, `discoverRepositoryWithRead`), [[doc-bridge-divergencia]] (`diffSnapshotsWithRead`), [[doc-bridge-consulta-mcp]] (lista de ferramentas do perfil service), [[doc-bridge-enriquecimento]] (stores particionados) |
| Consumidor | Action/advisory de [[doc-bridge-distribuicao]]: `ak-docs action snapshot` e `diff --advisory` descobrem sob perfil service |
| Consumidor externo | [[engine-runner]] em [[00 Hub - alexandria]] (fluxo Layer 1 sobre checkouts) |
| Índice doc-bridge | `area:src/execution` é importado por `src/query` (8), `src/mcp` (5), `src/fixes` (4), `src/intelligence` (1) |
| Externo | `zod` (schemas estritos), `node:async_hooks` |

## Dados e efeitos

| Efeito | Detalhe | Evidência |
|---|---|---|
| Lê | Só caminhos relativos POSIX sem `..`, `:` ou `\` | `src/storage/contract.ts:5` |
| Grava | Artefato com envelope (`partition`, `key`, `contentHash`, `byteHash`) e troca atômica | `src/storage/contract.ts:39-50` |
| Nega no service | módulos do repositório, processos de agente/estudo, federação/provedores, publicação de memória, watch, escrita local | `src/execution/profile.ts:23-26` |
| Força no service | `redactSecrets: true`, `llmsTxt`/`capabilities` desligados, `intelligence`/`federation` desligados | `src/execution/config.ts:44-49` |
| CLI service | `index` exige `--artifact-root` separado da raiz lida; sinal `SIGINT` aborta | `src/cli/service.ts:21-29`, `src/cli/service.ts:50-52` |
| Rede / env | Nenhuma | — |

## Como mexer (para agentes)

- **Comece por** `docs/spec/service-profile-v1.md` e `docs/spec/storage-io-v1.md`, depois `src/execution/config.ts` e `src/storage/contract.ts`.
- **Invariantes**: a allowlist é enumerada e versionada — ampliar exige decisão revisada (`docs/adr/0012-caller-enforced-service-profile.md:43`); containers não concedem folhas futuras (`src/execution/config.ts:5`); toda leitura nomeia revisão exata e nunca cai para "latest" (`docs/adr/0014-pluggable-io-and-revision-partitions.md:19`); novo ponto de entrada com efeito colateral precisa chamar `denyServiceOperation`.
- **Testes**: `tests/service-profile.test.ts`, `tests/storage.test.ts`, `tests/index-storage.test.ts`, `tests/discovery-io.test.ts`, `tests/discovery-plugin-v2.test.ts`, `tests/analyzer-plugin.test.ts`, `tests/operation-limits.test.ts`, `tests/injected-entrypoints.test.ts`.
- **Validação**: `pnpm vitest run tests/service-profile.test.ts tests/index-storage.test.ts` e `pnpm typecheck && pnpm test`.
- **Armadilhas**: a partição do CLI service usa `repositoryId: 'repository'` e revisão = hash do inventário (`src/cli/service.ts:58`); `beforeRename` em `createLocalArtifactIO` é só ponto de falha para teste, sem garantia de durabilidade (`src/storage/artifacts.ts:36-37`).

## Decisões e história

- [[doc-bridge ADR-0012 - Perfil de serviço imposto pelo chamador]], [[doc-bridge ADR-0013 - Adaptadores de descoberta neutros de linguagem]], [[doc-bridge ADR-0014 - IO plugável e partições por revisão]].
- Recentes (`git log -- src/storage src/execution src/plugins src/cli/service.ts`): 2026-10-09 `10b5efd` consultas de rationale; 2026-10-08 `33482c3` restaura capturas do advisory e exports CI-built; 2026-10-07 `8c8ec5a` operações limitadas com progresso e métricas; 2026-10-07 `4a5fa2f` versões de pacote e carimbo de release; 2026-10-07 `3915742` perfil service; 2026-10-07 `14337ae` storage plugável e plugins v2.

> [!info]- Detalhe técnico
> - `isServiceProfile` também reconhece objetos "carimbados" por `bindServiceCapability` (`WeakMap`): `src/execution/profile.ts:17-22`.
> - Diagnósticos de chaves ignoradas truncam em 127 + `diagnostics.truncated`: `src/execution/config.ts:18-23`.
> - O build particionado ignora overlay e `snapshotBinding` sob service: `src/index-builder/build-index.ts:338`.
