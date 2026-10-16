---
tipo: pacote
repo: "doc-bridge"
camada: ferramenta
visibilidade: publico
verificado-em: 2026-10-16
commits:
  "doc-bridge": ca2c233
metodo: análise estática; nada foi executado
fontes:
  - "doc-bridge/src/diff/change-set.ts"
  - "doc-bridge/src/audit/documentation.ts"
  - "doc-bridge/src/fixes/regions.ts"
tags: [repo/doc-bridge, pacote]
---

# doc-bridge-divergencia

> [!tldr] Em linguagem comum
> É o conferente: mostra o que mudou no código, quais documentos podem ter ficado errados e uma correção que alguém ainda precisa revisar.

← [[00 Hub - doc-bridge]]

## Papel e contratos

Módulos internos de diff, auditoria, findings, gates e remediação por região. Evidência mecânica e política de revisão são coisas diferentes.

| Pergunta | Resposta |
|---|---|
| O que entrega | `diffSnapshots`, `auditDocumentation` (módulo de auditoria), findings e `create/revalidate/approve/apply/mergeRemediation`. |
| Quem usa | [[engine-runner]], [[doc-bridge-consulta-mcp]], Action e [[Doc Bridge - Da divergência à correção revisável]]. |
| Do que depende | Snapshots, identidade comum de projeto, hashes das regiões, configuração e autenticação de revisão humana. |
| Dados lidos e gravados | Lê duas revisões e documentos; produz ChangeSet/findings/propostas. Aplicação escreve regiões vinculadas à evidência; revalidar limpa aprovação anterior. |

> [!bug] Existe, mas ninguém usa
> A análise mecânica não avalia toda a verdade de texto livre. Sem revisão semântica configurada, esse aspecto permanece não analisado.

> [!info]- Detalhe técnico
> - `doc-bridge/src/diff/change-set.ts:1`.
> - `doc-bridge/src/audit/documentation.ts:1`.
> - `doc-bridge/src/fixes/regions.ts:99`.
> - `doc-bridge/src/fixes/regions.ts:114`.
> - `doc-bridge/src/fixes/regions.ts:120`.
> - `doc-bridge/src/fixes/regions.ts:137`.
