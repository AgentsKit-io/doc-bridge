---
tipo: adr
repo: doc-bridge
camada: ferramenta
visibilidade: publico
status: aceito
verificado-em: 2026-10-16
commits:
  "doc-bridge": f8824f1
metodo: "leitura do ADR e conferência estática da implementação citada; nada foi executado; auditado em 2026-10-16 (auditoria v2: referências e afirmações reconferidas contra o código)"
fontes:
  - docs/adr/0020-vault-edit-review.md
  - src/vault/diff.ts
  - src/vault/export.ts
tags: [adr, repo/doc-bridge, camada/ferramenta]
---

# doc-bridge ADR-0020 - Revisão de edições no vault gerado

> [!tldr] Em linguagem comum
> Se alguém edita à mão uma nota do caderno Obsidian que o Doc Bridge gerou, a edição vira uma sugestão pendente ligada ao trecho de origem; aceitar a sugestão nunca altera os documentos de origem automaticamente.

← [[00 Decisões - doc-bridge]]

## Status e datas

Aceito em 2026-10-08, com `authority: human-approved scope` (`docs/adr/0020-vault-edit-review.md:3-5`).

## A decisão

Novo tipo de proposta `vault-edit` no overlay de enriquecimento, com texto original e editado, hashes das duas versões e regiões de origem do export; o baseline é regenerado e precisa bater com o manifesto antes de criar propostas (frontmatter editado não é autoridade); uma proposta por documento-fonte; notas adicionadas/apagadas e vínculos velhos só são relatados (`docs/adr/0020-vault-edit-review.md:20-28`).

## Contexto

O manifesto do vault já guardava hashes exatos e o exportador protegia notas editadas, mas nenhum tipo de proposta representava uma edição arbitrária de nota gerada (`docs/adr/0020-vault-edit-review.md:12-16`).

## Consequências

Leitores estritos antigos do overlay rejeitam o novo tipo; drift de fonte/config exige restaurar baseline ou revisão manual (`docs/adr/0020-vault-edit-review.md:44-51`). Implementação: `diffVault` (`src/vault/diff.ts:27-81`), manifesto `.doc-bridge-vault.json` (`src/vault/export.ts:20`).

## Pacotes afetados

[[doc-bridge-memoria-vault]], [[doc-bridge-enriquecimento]].

## Substitui / substituído por

Nenhum.

## Fonte

`docs/adr/0020-vault-edit-review.md`
