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
  - "doc-bridge/src/memory/pipeline.ts"
  - "doc-bridge/src/vault/export.ts"
  - "doc-bridge/src/vault/diff.ts"
tags: [repo/doc-bridge, pacote]
---

# doc-bridge-memoria-vault

> [!tldr] Em linguagem comum
> É uma caixa de sugestões: organiza aprendizados dos agentes e mudanças no mapa Obsidian, sem transformá-los automaticamente em verdade do projeto.

← [[00 Hub - doc-bridge]]

## Papel e contratos

Módulo interno para ingestão, classificação, segurança, rascunho e exportação reversível de navegação.

| Pergunta | Resposta |
|---|---|
| O que entrega | Rotas `agent`, `human`, `playbook`, `discard`; `draftMemoryPromotion`, `exportVault`, `diffVault`. |
| Quem usa | [[doc-bridge-indexacao]], [[doc-bridge-consulta-mcp]] e mantenedores; rota playbook relaciona-se a [[00 Hub - agents-playbook]]. |
| Do que depende | Configuração de memórias/vault, descoberta e overlay de enriquecimento. |
| Dados lidos e gravados | Lê memórias locais e regras Cursor configuradas; exporta notas geradas e manifesto de hashes em pasta ignorada, distinta de `docs/notes`. Diff registra propostas pendentes no overlay. |

> [!info]- Detalhe técnico
> - `doc-bridge/src/memory/pipeline.ts:9`.
> - `doc-bridge/src/memory/pipeline.ts:93`.
> - `doc-bridge/src/memory/pipeline.ts:139`.
> - `doc-bridge/src/vault/export.ts:71`.
> - `doc-bridge/src/vault/export.ts:88`.
> - `doc-bridge/src/vault/diff.ts:27`.
> - `doc-bridge/src/vault/diff.ts:63`.
