---
tipo: pacote
repo: doc-bridge
camada: ferramenta
npm: "@agentskit/doc-bridge"
visibilidade: publico
verificado-em: 2026-10-16
commits:
  "doc-bridge": f8824f1
metodo: "análise estática do código; índice doc-bridge gerado localmente e handoff `ak-docs query package doc-bridge-fixes --agent` usados como evidência de edit root, checks e relações (src/diff não tem ownership próprio); testes não executados; auditado em 2026-10-16 (auditoria v2: referências e afirmações reconferidas contra o código)"
fontes:
  - src/diff/change-set.ts
  - src/diff/version-routing.ts
  - src/findings/contracts.ts
  - src/fixes/regions.ts
  - src/fixes/workflow.ts
  - src/fixes/llm.ts
  - src/fixes/llm-cli.ts
  - src/fixes/proposals.ts
  - src/enrich/settled.ts
  - src/cli/program.ts
  - src/cli/action.ts
  - src/mcp/server.ts
  - src/index.ts
  - package.json
  - tsup.config.ts
  - tests/change-set.test.ts
  - tests/region-remediation.test.ts
  - docs/adr/0010-versioned-change-set-and-semantic-identity.md
  - docs/adr/0011-findings-and-region-remediation.md
  - docs/adr/0022-l2-remediation-acceptance.md
  - docs/adr/0023-changed-reference-claims.md
tags: [pacote, repo/doc-bridge, camada/ferramenta]
---

# doc-bridge-divergencia

> [!tldr] Em linguagem comum
> É o conferente: compara duas versões do projeto, aponta quais documentos citam algo que sumiu ou mudou, e prepara uma correção exata do trecho — que só é aplicada depois que uma pessoa aprova.

← [[00 Hub - doc-bridge]]

## O que faz e por que existe

Áreas `src/diff/`, `src/findings/` e `src/fixes/`:

1. **ChangeSet** — compara dois `DiscoverySnapshotV1` do **mesmo projeto** (`src/diff/change-set.ts:363`) e lista mudanças em arquivos (`module`, `doc-path`, `package`) e fatos (`symbol`, `cli-command`, `cli-flag`, `config-key`, `signature`), com `compatibility: compatible` quando a assinatura nova é provadamente compatível (`src/diff/change-set.ts:46-96`).
2. **Impacto e findings** — documentos que citam (`covers`, `mentions`, `mentions-symbol`, `links-to`) algo alterado viram `documentsToReview` (`src/diff/change-set.ts:30`, `src/diff/change-set.ts:99-122`) e findings `BROKEN_REFERENCE`, `AMBIGUOUS_REFERENCE` ou `CHANGED_REFERENCE`, com status epistêmico (`conflict`, `stale-or-unverified`, `unresolved`) separado do roteamento de política (`proposed`, `excluded`, `routed-to-L2`, `pending-version`) (`src/diff/change-set.ts:420-423`, `src/diff/change-set.ts:450-497`).
3. **Remediação por região** — `RemediationV1` liga finding + hash da evidência + edições `{path, range, expectedRegionHash, replacement}`; ciclo `proposed → in-review → merged` (`src/fixes/regions.ts:110-143`).
4. **L2 opcional** — um provedor propõe regiões; cada proposta só é apresentada se, aplicada em memória, o finding original some e nenhum novo aparece no documento ([[doc-bridge ADR-0022 - Aceitação de propostas L2]]).

Existe para separar **evidência mecânica** de **decisão humana**: o motor prova remoção/mudança; aceitar a correção é sempre de uma pessoa.

## API e contratos

| Símbolo | Tipo | Para que serve | Onde |
|---|---|---|---|
| `diffSnapshots(base, head, options?)` | função | ChangeSet + impacto + findings + política; `headRoot` lê textos do head verificados por hash | `src/diff/change-set.ts:359` |
| `diffSnapshotsWithRead(base, head, read, options?)` | função | Mesmo diff lendo o head por `RepositoryReadV1` de revisão exata (`HEAD_PARTITION_MISMATCH` se divergir) | `src/diff/change-set.ts:318-319` |
| `snapshotChanges`, `changeImpact`, `parseChangeSet` | função | Partes reutilizáveis do diff; parse revalida o hash semântico | `src/diff/change-set.ts:46`, `src/diff/change-set.ts:99`, `src/diff/change-set.ts:128` |
| `stampChangeSet`, `changeSetEligibility` | função | Carimbo de release (evento → purl/versão) e elegibilidade por alvo do documento | `src/diff/version-routing.ts:19`, `src/diff/version-routing.ts:37` |
| `createFinding`, `findingIdentity`, `routeFinding` | função | Contrato `FindingV1`; id = categoria + localizador + evidência (sem revisão/tempo) | `src/findings/contracts.ts:12-24` |
| `createRemediation`, `revalidateRemediation`, `approveRemediation`, `applyRemediation`, `mergeRemediation` | função | Ciclo de vida da remediação | `src/fixes/regions.ts:100-143` |
| `remediationWorkflow(root, config, base, input, allowedRoots, op?)` | função | Recalcula findings do head e monta `validateEvidence` + `verify` (gates pós-apply) | `src/fixes/workflow.ts:14-33` |
| `recordDecision`, `findingSuppressed`, `replayRemediation` | função | Decisões humanas persistidas; rejeição suprime evidência inalterada | `src/enrich/settled.ts:9-23` |
| `runL2Fix` / export `./remediation` | função / subpath | `ak-docs fix --llm`; build separado `dist/llm/program.js` | `src/fixes/llm-cli.ts:17`, `tsup.config.ts:8`, `package.json:22-25` |
| CLI `ak-docs diff`, `ak-docs fix propose\|revalidate\|approve\|apply\|reject` | comando | Superfície humana | `src/cli/program.ts:1066-1103` |

Exemplo real (teste):

```ts
// tests/region-remediation.test.ts:23,32-36
const proposal = createRemediation(project, { findingId: 'finding-1', evidenceHash: hash, baseRevision: 'r1', configurationHash: hash, edits }, options)
expect(() => applyRemediation(project, proposal, applyOptions())).toThrow('approval')
const approved = approve(proposal)
const applied = applyRemediation(project, approved, applyOptions())
expect(applied.status).toBe('in-review')
```

## Quem usa e do que depende

| Relação | Nota / evidência |
|---|---|
| Depende de | [[doc-bridge-indexacao]] (snapshots, fatos de superfície, citações Markdown) |
| Depende de | [[doc-bridge-gates-qualidade]] (`verify` pós-apply roda `runGates`, `src/fixes/workflow.ts:29`) e [[doc-bridge-enriquecimento]] (rejeições persistidas no overlay, `src/fixes/workflow.ts:18-24`) |
| Consumidor | [[doc-bridge-consulta-mcp]] (`docbridge.proposals` prepara/revalida; nunca aprova) |
| Consumidor | Action/advisory de [[doc-bridge-distribuicao]] (`runAdvisoryDiff` usa `diffSnapshotsWithRead`, `src/cli/action.ts:150-165`) e gate `reference-findings` de [[doc-bridge-gates-qualidade]] |
| Consumidor externo | [[engine-runner]] em [[00 Hub - alexandria]] (comparação Layer 1) |
| Índice doc-bridge | `area:src/fixes` importa `src/discovery` (6), `src/schemas` (6), `src/execution` (4); importado por `tests` (11), `src` (2), `src/cli` (2) |
| Opcional | Peer `@agentskit/core` (`AdapterFactory`) só para L2 com provedor real (`src/fixes/llm-cli.ts:10`, `src/fixes/llm-cli.ts:27-30`) |

## Dados e efeitos

| Efeito | Detalhe | Evidência |
|---|---|---|
| Lê | Dois snapshots JSON; textos do head até 1 MB cada, só usados se o hash bate com o snapshot | `src/diff/change-set.ts:303-315` |
| Executa | `remediationWorkflow` roda descoberta completa do head local | `src/fixes/workflow.ts:16-17` |
| Grava | `applyRemediation` substitui arquivos de forma atômica por arquivo dentro de `allowedRoots`, e roda `verify`; se algo falha, restaura os originais (o arquivo de backup `*.docbridge-<uuid>.original` só permanece se a própria restauração falhar) | `src/fixes/regions.ts:120-136`, `src/fixes/write.ts:10-45` |
| Bloqueia | Edição que cruza região gerada/protegida, sobreposta, fora da raiz ou com hash de região divergente | `src/fixes/regions.ts:65-96` |
| Env | `GITHUB_ACTIONS=true` proíbe `fix approve/apply/reject` | `src/cli/program.ts:1085` |
| Rede (opt-in) | `fix --llm` sem `--responses` resolve o provedor de [[doc-bridge-inteligencia]] (chaves por variável de ambiente) | `src/fixes/llm-cli.ts:27-30` |
| Interação | `approve/apply/reject` exigem `--by` e confirmação TTY, ou `--yes` explícito | `src/cli/program.ts:1086-1092` |

## Como mexer (para agentes)

- **Comece por** `docs/agent-corpus/fixes.md`, `src/diff/change-set.ts` (diff e findings) e `src/fixes/regions.ts` (mutação).
- **Invariantes**: diff só entre snapshots com a mesma identidade de projeto (`src/diff/change-set.ts:363`); `BROKEN_REFERENCE` exige remoção provada, falha de resolução só gera incerteza (`docs/adr/0010-versioned-change-set-and-semantic-identity.md:19`); `CHANGED_REFERENCE` só quando o trecho afirma algo sobre o aspecto alterado ([[doc-bridge ADR-0023 - Afirmações sobre referências alteradas]]); revalidar **sempre** limpa aprovação e apresentação (`src/fixes/regions.ts:99-105`); aplicação comum exige aprovação com `bindingHash` exato; o modo `review-presentation` exige fronteira de branch isolada atestada pelo chamador (`src/fixes/regions.ts:128-132`); `mergeRemediation` exige humano autenticado e verificação da revisão mesclada (`src/fixes/regions.ts:137-143`).
- **Testes**: `tests/change-set.test.ts`, `tests/changed-claims.test.ts`, `tests/generic-fact-diff.test.ts`, `tests/version-routing.test.ts`, `tests/finding-contracts.test.ts`, `tests/region-remediation.test.ts`, `tests/remediation-surfaces.test.ts`, `tests/llm-remediation.test.ts`, `tests/advisory-policy.test.ts`, `tests/signatures.test.ts`.
- **Validação**: `pnpm test` (check do handoff `doc-bridge-fixes`); específico: `pnpm vitest run tests/region-remediation.test.ts tests/change-set.test.ts`; ADR-0022 indica `pnpm vitest run tests/llm-remediation.test.ts --maxWorkers=2` (`docs/adr/0022-l2-remediation-acceptance.md:8`).
- **Armadilhas**: mudar a regra de citação altera findings do advisory e do gate de publicação ao mesmo tempo; `--by` é atribuição, **não** autenticação (`src/cli/program.ts:1087`).

## Decisões e história

- [[doc-bridge ADR-0010 - ChangeSet versionado e identidade semântica]], [[doc-bridge ADR-0011 - Findings e remediação por região]], [[doc-bridge ADR-0016 - Evidência de compatibilidade de chamáveis]], [[doc-bridge ADR-0017 - Compatibilidade com imports locais]], [[doc-bridge ADR-0022 - Aceitação de propostas L2]], [[doc-bridge ADR-0023 - Afirmações sobre referências alteradas]], [[doc-bridge ADR-0024 - Scripts de entrada e citações de palavra solta]].
- Recentes (`git log -- src/diff src/fixes src/findings`): 2026-10-14 `c7d9240` findings alimentam o gate de publicação; 2026-10-11 `43e8a5f` palavras soltas não citam scripts de entrada; 2026-10-09 `7989fa5` classificação de afirmações alteradas; 2026-10-09 `1249758` remediação L2 verificada; 2026-10-08 `5b80003` compatibilidade através de imports locais.

> [!info]- Detalhe técnico
> - Cobertura do ChangeSet marca `not-analyzed` para capacidades sem extração e `release-event` sem carimbo: `src/diff/change-set.ts:365-379`.
> - `documentationUpdate = 'updated-in-this-change'` quando a citação mudou de hash no mesmo diff: `src/diff/change-set.ts:437-449`.
> - Localização de região: range exato, senão âncoras limitadas com **um** único match: `src/fixes/regions.ts:37-53`.
> - `remediationBindingHash` cobre id, finding, evidência, edições, revisão base, config, binding e revalidação: `src/fixes/regions.ts:98`.

> [!bug] Existe, mas ninguém usa
> - API legada de `FixProposalV1` (`applyFixProposal`, `createMarkdownLinkFixProposal`, `createArtifactNormalizationProposal`) continua exportada (`src/index.ts:296-303`) sem chamador em `src/`.
> - `mergeRemediation` e `stampChangeSet` são exportados (`src/index.ts:1113`, `src/index.ts:1120`) sem chamador interno: ficam para consumidores da biblioteca.
> - A análise mecânica não avalia a verdade de texto livre; sem revisão semântica isso fica `not-analyzed`.
