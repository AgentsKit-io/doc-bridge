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
  - "doc-bridge/src/index-builder/build-index.ts"
  - "doc-bridge/src/query/load-index.ts"
  - "doc-bridge/src/query/handoff.ts"
  - "doc-bridge/src/mcp/server.ts"
tags: [repo/doc-bridge, fluxo]
---

# Doc Bridge - Do repositório ao handoff

> [!tldr] Em linguagem comum
> O projeto vira um mapa; quando alguém pergunta onde atuar, recebe caminhos e verificações ligados à documentação.

← [[00 Hub - doc-bridge]]

## O que acontece

1. A CLI carrega configuração e limites do projeto.
2. A descoberta lê fontes e os adaptadores ligam documentos humanos ao corpus de agentes.
3. O build materializa índice, handoffs e capabilities; consulta exige as condições de frescor do índice.
4. CLI ou MCP resolve o alvo e devolve `startHere`, `readBeforeEditing`, `editRoots`, `checks` e `humanDoc`; executar as checks continua responsabilidade do consumidor.

## Quem atua aqui

| Peça | Papel |
|---|---|
| [[doc-bridge-indexacao]] | Descobre e materializa |
| [[doc-bridge-consulta-mcp]] | Resolve o alvo |

> [!info]- Detalhe técnico
> - `doc-bridge/src/index-builder/build-index.ts:169`.
> - `doc-bridge/src/query/load-index.ts:1`.
> - `doc-bridge/src/query/handoff.ts:19`.
> - `doc-bridge/src/mcp/server.ts:56`.
