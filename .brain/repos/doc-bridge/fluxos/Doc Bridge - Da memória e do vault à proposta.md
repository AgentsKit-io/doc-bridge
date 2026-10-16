---
tipo: fluxo
repo: "doc-bridge"
camada: ferramenta
visibilidade: publico
verificado-em: 2026-10-16
commits:
  "doc-bridge": ca2c233
metodo: análise estática; nada foi executado
fontes:
  - "doc-bridge/src/memory/pipeline.ts"
  - "doc-bridge/src/vault/export.ts"
  - "doc-bridge/src/vault/diff.ts"
tags: [repo/doc-bridge, fluxo]
---

# Doc Bridge - Da memória e do vault à proposta

> [!tldr] Em linguagem comum
> Um aprendizado ou uma edição no mapa vira sugestão rastreável, que pode ser aceita ou recusada.

← [[00 Hub - doc-bridge]]

## O que acontece

1. Ingerir e classificar memórias para docs de agente, docs humanas, playbook ou descarte.
2. Conferir segurança e produzir rascunho de promoção.
3. No caminho Obsidian, exportar navegação para pasta ignorada e separada das notas humanas.
4. Ao comparar o vault editado, conferir manifesto e vínculo original; fonte ou configuração diferente deixa a edição sem proposta revalidável.
5. Salvar propostas de enriquecimento pendentes; a decisão e a aplicação são passos explícitos posteriores.

## Quem atua aqui

| Peça | Papel |
|---|---|
| [[doc-bridge-memoria-vault]] | Classifica, exporta e compara |
| [[doc-bridge-consulta-mcp]] | Expõe drafts e propostas |

> [!info]- Detalhe técnico
> - `doc-bridge/src/memory/pipeline.ts:93`.
> - `doc-bridge/src/memory/pipeline.ts:139`.
> - `doc-bridge/src/vault/export.ts:88`.
> - `doc-bridge/src/vault/diff.ts:50`.
> - `doc-bridge/src/vault/diff.ts:63`.
