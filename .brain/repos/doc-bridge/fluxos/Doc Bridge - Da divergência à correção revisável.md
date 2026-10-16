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
  - "doc-bridge/src/diff/change-set.ts"
  - "doc-bridge/src/fixes/regions.ts"
tags: [repo/doc-bridge, fluxo]
---

# Doc Bridge - Da divergência à correção revisável

> [!tldr] Em linguagem comum
> Duas versões do mesmo projeto são comparadas; o resultado aponta risco e prepara uma mudança que ainda passa por revisão.

← [[00 Hub - doc-bridge]]

## O que acontece

1. Capturar snapshots de base e head com a mesma identidade de projeto.
2. Comparar símbolos, referências e aspectos suportados; findings carregam evidência e incerteza, não um selo de verdade semântica.
3. Preparar edits por região e revalidar hashes, revisão e configuração; isso invalida aprovação antiga.
4. Aprovação humana vinculada ao conteúdo ou fronteira explícita de branch de revisão permite a aplicação no modo correspondente.
5. Encerrar remediação exige aceitação humana e gates atuais; relatório ou proposta isolada não encerra o trabalho.

## Quem atua aqui

| Peça | Papel |
|---|---|
| [[doc-bridge-divergencia]] | Compara e controla a proposta |
| [[engine-runner]] | Consumidor Layer 1 em Alexandria |

> [!info]- Detalhe técnico
> - `doc-bridge/src/diff/change-set.ts:1`.
> - `doc-bridge/src/fixes/regions.ts:99`.
> - `doc-bridge/src/fixes/regions.ts:114`.
> - `doc-bridge/src/fixes/regions.ts:120`.
> - `doc-bridge/src/fixes/regions.ts:137`.
