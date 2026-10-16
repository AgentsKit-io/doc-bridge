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
  - "doc-bridge/src/query/handoff.ts"
  - "doc-bridge/src/index.ts"
  - "doc-bridge/src/mcp/server.ts"
tags: [repo/doc-bridge, pacote]
---

# doc-bridge-consulta-mcp

> [!tldr] Em linguagem comum
> É o balcão de informações: devolve por onde começar, quais arquivos pertencem à tarefa e quais verificações executar.

← [[00 Hub - doc-bridge]]

## Papel e contratos

Módulo interno com entradas CLI e MCP via stdio; consulta não dá autorização para editar.

| Pergunta | Resposta |
|---|---|
| O que entrega | `runQuery`, `searchIndex`, `handoffForEntity`, `handoff.resolve`, `doc.search/get`, ferramentas de conhecimento e diagnóstico. |
| Quem usa | Agentes de IDE, [[00 Hub - agents-playbook]] e consumidores do pacote; [[doc-bridge-docs]] publica contexto equivalente. |
| Do que depende | [[doc-bridge-indexacao]], índice fresco e configuração de ownership. |
| Dados lidos e gravados | Lê índice e documentos. Exceção de escrita MCP: `docbridge.proposals` pode salvar proposta e decisões de enriquecimento em `.doc-bridge/`; não aplica remediação em código/docs. |

> [!info]- Detalhe técnico
> - `doc-bridge/src/query/handoff.ts:19`.
> - `doc-bridge/src/index.ts:607`.
> - `doc-bridge/src/mcp/server.ts:49`.
> - `doc-bridge/src/mcp/server.ts:175`.
> - `doc-bridge/src/mcp/server.ts:336`.
> - `doc-bridge/src/mcp/server.ts:511`.
