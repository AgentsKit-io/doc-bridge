---
tipo: pacote
repo: doc-bridge
camada: ferramenta
npm: "@agentskit/doc-bridge"
visibilidade: publico
verificado-em: 2026-10-16
commits:
  "doc-bridge": fd1e421
metodo: "análise estática do código; índice doc-bridge gerado localmente e handoff `ak-docs query package doc-bridge-memory --agent` usados como evidência de edit root, checks e relações (src/vault não tem ownership próprio); testes não executados"
fontes:
  - src/memory/ingest.ts
  - src/memory/pipeline.ts
  - src/memory/github-pr.ts
  - src/vault/export.ts
  - src/vault/diff.ts
  - src/config/defaults.ts
  - src/config/schema.ts
  - src/index-builder/build-index.ts
  - src/mcp/server.ts
  - src/index.ts
  - tests/memory-pipeline.test.ts
  - tests/vault-diff.test.ts
  - doc-bridge.config.json
  - docs/adr/0019-memory-entity-evidence.md
  - docs/adr/0020-vault-edit-review.md
tags: [pacote, repo/doc-bridge, camada/ferramenta]
---

# doc-bridge-memoria-vault

> [!tldr] Em linguagem comum
> É uma caixa de sugestões: junta anotações que agentes deixaram durante o trabalho e edições feitas à mão num caderno Obsidian gerado, e transforma isso em rascunhos para alguém revisar — nunca em verdade do projeto automaticamente.

← [[00 Hub - doc-bridge]]

## O que faz e por que existe

Duas áreas de `src/`:

- **Memória** (`src/memory/`): lê notas Markdown de `.agent-memory` (adaptador `playbook-memory`) e regras de `.cursor/rules` (`cursor-rules`) (`src/config/defaults.ts:89-92`), classifica cada fato em rota `agent`, `human`, `playbook` ou `discard` por palavras-chave (`src/memory/pipeline.ts:37-48`), marca duplicatas contra o índice, varre segredos e e-mails privados, e monta um **rascunho** de promoção (`src/memory/pipeline.ts:139-174`). Com entidades de conhecimento ligadas, cria relações `memory-supports` só por correspondência exata e única (`src/memory/pipeline.ts:50-91`).
- **Vault** (`src/vault/`): exporta notas de navegação Obsidian para uma pasta **ignorada pelo git** e separada das notas humanas (`src/vault/export.ts:88-97`); `vault diff` compara as notas editadas com um baseline regenerado e cria propostas `vault-edit` **pendentes** no overlay de enriquecimento (`src/vault/diff.ts:26-81`).

Existe para que aprendizados de agentes e ajustes no mapa voltem ao projeto **por revisão**, sem atalhos.

## API e contratos

| Símbolo | Tipo | Para que serve | Onde |
|---|---|---|---|
| `ingestMemoryCandidates(root, intelligence?)` | função | Candidatos `MemoryCandidateV1` dos diretórios configurados (contidos no repo) | `src/memory/ingest.ts:64-85` |
| `ingestAgentMemory`, `ingestCursorRules` | função | Atalhos por adaptador | `src/memory/ingest.ts:43-47` |
| `classifyMemoryCandidates(candidates, index)` | função | Rota, alvo (`package X owns…`), `duplicateOf` (score ≥ 16), relações de entidade | `src/memory/pipeline.ts:93-115` |
| `scanMemorySafety`, `draftMemoryPromotion` | função | Achados `secret`/`private-email`; rascunho com `ok: false` se houver achado | `src/memory/pipeline.ts:117-174` |
| `linkMemoryToEntities(candidates, section)` | função | Relações `memory-supports` exatas; limite de 10 000 | `src/memory/pipeline.ts:51-91` |
| `writePromotionDraft`, `promoteMemoryToGithubPr` | função | Grava rascunho; opcionalmente cria branch, commit, push e PR **draft** via `gh` | `src/memory/github-pr.ts:39-45`, `src/memory/github-pr.ts:47` |
| `exportVault(root, config)` / `diffVault(root, config)` | função (não exportada no barrel) | `ak-docs vault export|diff` | `src/vault/export.ts:88`, `src/vault/diff.ts:27` |
| `MANIFEST = '.doc-bridge-vault.json'`, `VAULT_NOTE_TYPES` | const | Manifesto de hashes das notas próprias; tipos de nota exportáveis | `src/vault/export.ts:20`, `src/vault/export.ts:40-49` |
| MCP `memory.classify`, `memory.promoteDraft` | ferramenta | Mesma classificação/rascunho, só leitura | `src/mcp/server.ts:459-465` |

Exemplo real (teste):

```ts
// tests/memory-pipeline.test.ts:56-66
const result = classifyMemoryCandidates(
  [
    candidate('agent', 'package sidecar owns transport boundaries'),
    candidate('human', 'Add a user-facing guide for setup'),
    candidate('playbook', 'This is a reusable playbook pattern'),
    candidate('discard', 'scratch noise discard'),
  ],
  index,
)
expect(result.map((item) => item.route)).toEqual(['agent', 'human', 'playbook', 'discard'])
```

## Quem usa e do que depende

| Relação | Nota / evidência |
|---|---|
| Depende de | [[doc-bridge-indexacao]] (`searchIndex` para duplicatas, `discoverRepository` para o vault, `extractKnowledgeEntities`) |
| Depende de | [[doc-bridge-enriquecimento]] — `vault diff` grava propostas no overlay e usa `validateEnrichmentProposal` (`src/vault/diff.ts:7-10`, `src/vault/diff.ts:64`) |
| Consumidor | [[doc-bridge-indexacao]] (o build liga memórias a entidades, `src/index-builder/build-index.ts:148-150`), [[doc-bridge-consulta-mcp]] (`memory.*`) |
| Relaciona-se | Rota `playbook` aponta para [[00 Hub - agents-playbook]]; `fix --llm --pr` reutiliza o rascunho de PR (ver [[doc-bridge-divergencia]]) |
| Índice doc-bridge | `area:src/memory` importa `src/lib` (4), `src/schemas` (4), `src/config` (2); importado por `tests` (6), `src/cli` (3), `src/index-builder` (2) |
| Externo | `yaml`, `zod`, `@agentskit/cross-platform` (`runCommand` para `git check-ignore`) (`src/vault/export.ts:1-6`) |

## Dados e efeitos

| Efeito | Detalhe | Evidência |
|---|---|---|
| Lê | `.agent-memory/**/*.md(c)` e `.cursor/rules/**` (ou `intelligence.memory.ingestDir`/`rulesDir`), sem respeitar `.gitignore` | `src/memory/ingest.ts:24`, `src/config/defaults.ts:89-92` |
| Grava | Rascunho em `.doc-bridge/drafts/memory-promotion-<data>.md` | `src/memory/github-pr.ts:36-45` |
| Executa / rede | `promoteMemoryToGithubPr` sem `--dry-run`: `git checkout -b`, `git add`, `git commit`, `git push -u origin`, `gh pr create --draft`; exige `gh auth status` ok | `src/memory/github-pr.ts:109-170` |
| Grava | `vault export` → `.doc-bridge/vault` (ou `vault.output`) + manifesto; recusa se a pasta não estiver ignorada, se houver symlink/hard link, ou se coincidir com `docs/notes` | `src/vault/export.ts:52-97` |
| Executa | `git check-ignore` e `git ls-files` para provar que a saída é ignorada | `src/vault/export.ts:78-81` |
| Grava | `vault diff` acrescenta propostas pendentes a `.doc-bridge/enrich/overlay.json`; nunca toca nas fontes | `src/vault/diff.ts:69-79` |
| Limites | Nota até 256 KiB, UTF-8, sem segredo; senão vai para `unproposed` | `src/vault/diff.ts:46-52` |

## Como mexer (para agentes)

- **Comece por** `docs/agent-corpus/memory.md` (startHere do handoff `doc-bridge-memory`), `src/memory/pipeline.ts`, `src/vault/export.ts`.
- **Invariantes**: só `playbook-memory` e `cursor-rules` são aceitos; outro adaptador lança erro (`src/memory/ingest.ts:49-72`); diretórios de memória precisam ficar dentro do repo (`src/memory/ingest.ts:80`); rascunho com achado de segurança bloqueia a promoção salvo `--force` (`src/memory/github-pr.ts:53-62`); propostas de vault só nascem quando o baseline regenerado bate com o manifesto (`src/vault/diff.ts:49-50`); vault e notas humanas sempre disjuntos (`src/vault/diff.ts:32`).
- **Testes**: `tests/memory-pipeline.test.ts`, `tests/github-pr.test.ts`, `tests/vault-export.test.ts`, `tests/vault-diff.test.ts`, `tests/obsidian.test.ts`, `tests/knowledge-entities.test.ts`.
- **Validação**: `pnpm test && pnpm typecheck` (`doc-bridge.config.json:89-95`); focado: `pnpm vitest run tests/memory-pipeline.test.ts tests/vault-diff.test.ts`.
- **Armadilhas**: a classificação é por regex de palavras ("guide", "pattern", "noise"…), não semântica (`src/memory/pipeline.ts:37-48`); `--pr` sem `--dry-run` faz push real.

## Decisões e história

- [[doc-bridge ADR-0019 - Fonte de memória e evidência de entidade]] (status *proposed* no arquivo, mas implementado), [[doc-bridge ADR-0020 - Revisão de edições no vault gerado]], [[doc-bridge ADR-0018 - Entidades de conhecimento opt-in]], [[doc-bridge ADR-0012 - Perfil de serviço imposto pelo chamador]] (promoção por PR negada no perfil service).
- Recentes (`git log -- src/memory src/vault src/entities`): 2026-10-09 `e70891a` limpeza 2.0 de caminhos de memória; 2026-10-09 `8f86194` adaptadores reservados viram aviso; 2026-10-09 `7263365` notas configuráveis ligadas a entidades; 2026-10-08 `9c3db9c` revisão de notas editadas do vault; 2026-10-08 `c42c527` export determinístico de vault.

> [!info]- Detalhe técnico
> - E-mail privado: regex que exclui `example.com` (`src/memory/pipeline.ts:35`).
> - `requireIgnored` usa o filtro `.gitignore` interno e, fora dele, `git check-ignore --no-index` + `git ls-files -z` (`src/vault/export.ts:71-86`).
> - Uma proposta `vault-edit` por documento-fonte vinculado (`src/vault/diff.ts:58-67`).

> [!bug] Existe, mas ninguém usa
> - `intelligence.memory.classify` e `intelligence.memory.promote.{enabled,targets,requireApproval}` são aceitos pelo schema (`src/config/schema.ts:402-410`) mas não são lidos em `src/`.
