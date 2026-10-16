---
tipo: fluxo
repo: doc-bridge
camada: ferramenta
visibilidade: publico
verificado-em: 2026-10-16
commits:
  "doc-bridge": fd1e421
metodo: "análise estática do código e dos ADRs 0019 e 0020; nada foi executado"
fontes:
  - src/memory/ingest.ts
  - src/memory/pipeline.ts
  - src/memory/github-pr.ts
  - src/vault/export.ts
  - src/vault/diff.ts
  - src/enrich/review.ts
  - src/mcp/server.ts
tags: [fluxo, repo/doc-bridge, camada/ferramenta]
---

# Doc Bridge - Da memória e do vault à proposta

> [!tldr] Em linguagem comum
> Um aprendizado anotado por um agente, ou uma edição feita à mão no caderno Obsidian gerado, vira uma sugestão rastreável que alguém aceita ou recusa; nada muda nas fontes sozinho.

← [[00 Hub - doc-bridge]]

## Entrada e resultado

Duas entradas paralelas, mesmo destino (revisão humana):

| Etapa | O que acontece | Quem atua |
|---|---|---|
| M1. Ingerir | `.agent-memory` e `.cursor/rules` (ou diretórios configurados, dentro do repo) → `MemoryCandidateV1` (`src/memory/ingest.ts:64-85`) | [[doc-bridge-memoria-vault]] |
| M2. Classificar | Rota `agent`/`human`/`playbook`/`discard`, alvo, duplicata (`src/memory/pipeline.ts:93-115`) | [[doc-bridge-memoria-vault]] |
| M3. Segurança e rascunho | Segredo ou e-mail privado → rascunho `ok: false` (`src/memory/pipeline.ts:117-174`) | [[doc-bridge-memoria-vault]] |
| M4. Promover | `ak-docs memory promote [--pr] [--dry-run]` grava `.doc-bridge/drafts/…`; com `--pr` real cria branch, push e PR draft via `gh` (`src/memory/github-pr.ts:47-193`) | pessoa revisa o PR |
| V1. Exportar | `ak-docs vault export` → `.doc-bridge/vault` + manifesto de hashes; exige pasta ignorada e disjunta de `docs/notes` (`src/vault/export.ts:88-97`) | [[doc-bridge-memoria-vault]] |
| V2. Editar | Pessoa edita notas no Obsidian | pessoa |
| V3. Comparar | `ak-docs vault diff` regenera o baseline; se bate com o manifesto, cria propostas `vault-edit` pendentes por documento-fonte (`src/vault/diff.ts:42-67`) | [[doc-bridge-memoria-vault]] |
| V4. Decidir | `ak-docs enrich approve|reject` ou MCP `docbridge.proposals` `enrich-*` (`src/enrich/review.ts:59`, `src/mcp/server.ts:513-520`) | [[doc-bridge-enriquecimento]] |

**Erros e recuperação**: fonte ou config mudou desde o export → nota vai para `unproposed` ("original binding cannot be revalidated"), é preciso reexportar ou revisar à mão (`src/vault/diff.ts:49-50`); overlay inválido → recusa sobrescrever (`src/vault/diff.ts:70-71`).

> [!info]- Detalhe técnico
> - Aprovar uma proposta `vault-edit` nunca escreve nas fontes nem muda o ranking ([[doc-bridge ADR-0020 - Revisão de edições no vault gerado]]).
> - Relações `memory-supports` só com entidades de conhecimento ligadas ([[doc-bridge ADR-0019 - Fonte de memória e evidência de entidade]]).

O que não foi confirmado pertence a [[Dúvidas abertas]]; capacidades condicionais ou sem chamador encontrado vão para [[Capacidades não usadas]].
