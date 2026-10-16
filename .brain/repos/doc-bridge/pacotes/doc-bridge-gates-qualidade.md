---
tipo: pacote
repo: doc-bridge
camada: ferramenta
npm: "@agentskit/doc-bridge"
visibilidade: publico
verificado-em: 2026-10-16
commits:
  "doc-bridge": fd1e421
metodo: "análise estática do código; índice doc-bridge gerado localmente e handoffs `ak-docs query package doc-bridge-gates|doc-bridge-audit --agent` usados como evidência de edit roots, checks e relações; testes não executados"
fontes:
  - src/gates/run-gates.ts
  - src/gates/reference-findings.ts
  - src/conformance/documentation-standard-v1.ts
  - src/audit/documentation.ts
  - src/doctor/run-doctor.ts
  - src/parity/check.ts
  - src/rules/engine.ts
  - src/config/schema.ts
  - src/config/defaults.ts
  - src/cli/program.ts
  - src/index.ts
  - doc-bridge.config.json
  - CONTRIBUTING.md
  - tests/gates.test.ts
  - tests/documentation-standard.test.ts
  - .github/workflows/ci.yml
  - docs/adr/0002-documentation-audit-boundary.md
  - docs/adr/0005-documentation-quality-and-criticality.md
  - docs/adr/0025-opt-in-publication-gate.md
tags: [pacote, repo/doc-bridge, camada/ferramenta]
---

# doc-bridge-gates-qualidade

> [!tldr] Em linguagem comum
> É o inspetor de qualidade: confere se o mapa está atualizado, se a documentação segue o padrão combinado, dá uma nota de saúde ao repositório e verifica se o que o projeto promete em público é verdade. Pode barrar uma publicação quando algo está errado.

← [[00 Hub - doc-bridge]]

## O que faz e por que existe

Nota nova da v2 (na v1, a auditoria estava dentro de [[doc-bridge-divergencia]]). Reúne as verificações determinísticas que **decidem passa/falha** ou dão nota:

- **Gates** (`src/gates/`): `index-freshness`, `index-reproducible`, `human-guide-links`, `okf-type`, `docs-style`, `documentation-standard-v1` e `reference-findings`; presets `minimal` (padrão), `standard`, `strict`, `playbook` (`src/gates/run-gates.ts:24-31`, `src/gates/run-gates.ts:409-436`).
- **Conformidade** `documentation-standard-v1` (`src/conformance/`): nove regras — `human-docs`, `llms-and-raw-source`, `agent-handoffs`, `contribution`, `metadata`, `cross-links`, `tested-quickstarts`, `visual-explanations`, `structured-diagrams` (`src/config/schema.ts:508-518`), com exceções exigindo motivo, aprovador e URL de rastreio (`src/config/schema.ts:520-527`).
- **Auditoria de documentação** (`src/audit/`): tipo, audiência, ciclo de vida, tier e criticidade por documento; dimensões de qualidade independentes ([[doc-bridge ADR-0005 - Qualidade e criticidade da documentação]]).
- **Doctor** (`src/doctor/`): nota A–F medindo alcance, conectividade e hit@3 do benchmark de retrieval (`src/doctor/run-doctor.ts:17-27`).
- **Paridade pública** (`src/parity/`): códigos `PARITY_STALE`, `PARITY_MISSING`, `PARITY_CONTRADICTION`, `PARITY_NOT_ANALYZED` sobre afirmações públicas (`src/parity/check.ts:39`).
- **Regras** (`src/rules/`): severidades configuráveis sobre um relatório de reconciliação (`src/config/schema.ts:157-182`).

Existe para que "a documentação está boa" seja **mensurável e reprodutível sem LLM**; o que não é provável vira `not-analyzed` ([[doc-bridge ADR-0002 - Fronteira da auditoria de documentação]]).

## API e contratos

| Símbolo | Tipo | Para que serve | Onde |
|---|---|---|---|
| `runGates(root, config, ids?)` / `runGate(root, config, id)` | função | Executa os gates resolvidos; `ok` só se todos passam | `src/gates/run-gates.ts:400-407`, `src/gates/run-gates.ts:55` |
| `resolveGateIds(config)` | função | Preset + `include` − `exclude`; ids reservados emitem aviso `AK_DOCS_RESERVED_GATE` | `src/gates/run-gates.ts:409-436` |
| `publicationDecision(root, config, { allowPendingFindings })` | função | Se `ak-docs index` pode publicar; override grava `publication.pendingReferenceFindings` | `src/gates/run-gates.ts:193-216` |
| `checkReferenceFindings(root, config)` | função | Diff local contra `gates.referenceFindings.base`; falha fechado sem base | `src/gates/reference-findings.ts:70`, `src/gates/reference-findings.ts:173` |
| `runDocumentationStandardV1(root, config)` | função | Relatório de conformidade v1 (status `stable`) | `src/conformance/documentation-standard-v1.ts:16-17`, `src/conformance/documentation-standard-v1.ts:454` |
| `auditDocumentation(options)` | função | `DocumentationAuditReportV1` | `src/audit/documentation.ts:257` |
| `runDoctor(root, config)` | função | `DoctorReport` com nota, issues e badge | `src/doctor/run-doctor.ts:384` |
| `checkPublicParity(options)` | função | `PublicParityReportV1` | `src/parity/check.ts:143` |
| `evaluateRules(...)` | função | Achados de regras com severidade | `src/rules/engine.ts:136` |
| CLI `gate run [id]`, `conformance run documentation-standard-v1`, `audit documentation`, `doctor [--badge\|--write-badge]`, `parity`, `rules run` | comando | Superfície humana/CI | `src/cli/program.ts:2080-2095` (doctor) |

Exemplo real (teste):

```ts
// tests/documentation-standard.test.ts:102-103,117
const first = runDocumentationStandardV1(root, config)
const second = runDocumentationStandardV1(root, config)
expect(runGates(root, config, ['documentation-standard-v1']).results[0]?.details).toEqual(first)
```

## Quem usa e do que depende

| Relação | Nota / evidência |
|---|---|
| Depende de | [[doc-bridge-indexacao]] — gates reconstroem o índice em memória (`src/gates/run-gates.ts:218-221`) |
| Depende de | [[doc-bridge-divergencia]] — `reference-findings` usa o mesmo agrupamento de findings do advisory (`docs/adr/0025-opt-in-publication-gate.md:35-41`) |
| Consumidor | [[doc-bridge-consulta-mcp]] (`gate.status`), [[doc-bridge-divergencia]] (`verify` pós-apply), Action de [[doc-bridge-distribuicao]] (passo de gates bloqueantes) |
| Consumidor | CI deste repo: `gate run`, `conformance run`, `doctor`, `parity`, `bench retrieval` (`.github/workflows/ci.yml:66-78`) |
| Índice doc-bridge | `area:src/audit` importa `src/render` (2), `src/config`, `src/discovery`; importado por `tests` (5), `src/index.ts`, `src/agents` |
| Externo | `@agentskit/cross-platform` (`splitFrontmatter`) (`src/gates/run-gates.ts:3`) |

## Dados e efeitos

| Efeito | Detalhe | Evidência |
|---|---|---|
| Lê | Índice publicado, corpus de agentes, docs humanas; `reference-findings` lê o snapshot base e redescobre o working tree | `src/gates/run-gates.ts:11-15`, `docs/adr/0025-opt-in-publication-gate.md:48-51` |
| Grava | `doctor --write-badge` grava `.doc-bridge/coverage-badge.json` | `src/cli/program.ts:2084-2088` |
| Bloqueia | Com `reference-findings` selecionado e falhando, `index` não grava nada e sai 1 | `docs/adr/0025-opt-in-publication-gate.md:59-62` |
| Saída | Código de saída ≠ 0 quando o gate/doctor falha (`report.ok`) | `src/cli/program.ts:2095` |
| Rede / env | Nenhuma | — |

## Como mexer (para agentes)

- **Comece por** `docs/agent-corpus/gates.md`, `docs/agent-corpus/conformance.md`, `docs/agent-corpus/doctor.md`, `docs/agent-corpus/audit.md` (startHere dos handoffs) e `src/gates/run-gates.ts`.
- **Invariantes**: nenhum preset seleciona `reference-findings`; o bloco `gates.referenceFindings` sozinho não liga nada (`src/gates/run-gates.ts:181-182`); gate selecionado sem base **falha** em vez de passar (`docs/adr/0025-opt-in-publication-gate.md:52-58`); override não persiste entre execuções (`docs/adr/0025-opt-in-publication-gate.md:63-71`); auditoria nunca edita documentação gerada (`docs/adr/0002-documentation-audit-boundary.md:15`).
- **Testes**: `tests/gates.test.ts`, `tests/publication-gate.test.ts`, `tests/publication-gate-mcp.test.ts`, `tests/documentation-standard.test.ts`, `tests/documentation-standard-cli.test.ts`, `tests/documentation-audit.test.ts`, `tests/doctor.test.ts`, `tests/doctor-measured.test.ts`, `tests/parity.test.ts`, `tests/rules.test.ts`, `tests/rules-cli.test.ts`, `tests/ecosystem-contract.test.ts`.
- **Validação** (checks do índice): gates `pnpm test && node bin/ak-docs.js gate run`; conformidade `node bin/ak-docs.js conformance run documentation-standard-v1 --text`; doctor `node bin/ak-docs.js doctor --text` (`doc-bridge.config.json:68-88`). Antes, `node bin/ak-docs.js index`.
- **Armadilhas**: este repo usa `preset: minimal` + `documentation-standard-v1` + `index-reproducible` (`doc-bridge.config.json:106-109`); `index-freshness` só faz sentido com índice commitado — aqui o índice é gerado, não versionado (`CONTRIBUTING.md:23-26`).

## Decisões e história

- [[doc-bridge ADR-0002 - Fronteira da auditoria de documentação]], [[doc-bridge ADR-0005 - Qualidade e criticidade da documentação]], [[doc-bridge ADR-0025 - Gate opt-in de publicação]], [[doc-bridge ADR-0015 - Action de advisory e índice gerado na CI]].
- Recentes (`git log -- src/conformance src/doctor src/parity src/rules src/gates`): 2026-10-14 `c7d9240` gate opt-in `reference-findings`; 2026-10-09 `e70891a` limpeza 2.0; 2026-10-07 `20cdb31` hash semântico e ChangeSetV1; 2026-09-16 `25f16f3` índice commitado que não poderia vir de checkout limpo; 2026-09-15 `6409c68` paridade de afirmações públicas.

> [!info]- Detalhe técnico
> - `GateResult` com `pendingCount`, `reasonCode`, `findings` só para `reference-findings`: `src/gates/run-gates.ts:35-48`.
> - Doctor exige 100% de alcance, 80% de conectividade e hit@3 ≥ 0,8 para nota A: `src/doctor/run-doctor.ts:27`.
> - Defaults: `gates.preset = minimal`, `rules.mode = default`: `src/config/defaults.ts:44-51`.

> [!bug] Existe, mas ninguém usa
> - `link-rot`, `routing-currency` e `bootstrap-size` estão no enum de gates (`src/config/schema.ts:123-134`) mas são reservados: incluir um deles só gera aviso e não roda nada (`src/gates/run-gates.ts:33`, `src/gates/run-gates.ts:422-428`).
