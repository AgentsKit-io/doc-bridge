---
tipo: adr
repo: doc-bridge
camada: ferramenta
visibilidade: publico
status: aceito
substituido-por: [ADR-0017]
verificado-em: 2026-10-16
commits:
  "doc-bridge": f8824f1
metodo: "leitura do ADR e conferência estática da implementação citada; nada foi executado; auditado em 2026-10-16 (auditoria v2: referências e afirmações reconferidas contra o código)"
fontes:
  - docs/adr/0016-callable-compatibility-evidence.md
  - src/discovery/facts/signature-compatibility.ts
  - src/diff/change-set.ts
tags: [adr, repo/doc-bridge, camada/ferramenta]
---

# doc-bridge ADR-0016 - Evidência de compatibilidade de chamáveis

> [!tldr] Em linguagem comum
> Quando a assinatura de uma função muda de um jeito que não quebra quem já a chama (por exemplo, um parâmetro opcional novo), o Doc Bridge consegue provar isso e deixa de mandar revisar a documentação que só a menciona.

← [[00 Decisões - doc-bridge]]

## Status e datas

Aceito em 2026-10-08 (`docs/adr/0016-callable-compatibility-evidence.md:3-4`). Restrição a contexto local do módulo estreitada por [[doc-bridge ADR-0017 - Compatibilidade com imports locais]].

## A decisão

O extrator de assinaturas guarda evidência de declaração limitada (codec `typescript-callable-v1`); a comparação roda só no diff e só para hashes de assinatura alterados; o núcleo consome o resultado "provadamente compatível" sem interpretar TypeScript; sem imports do repo, execução ou rede (`docs/adr/0016-callable-compatibility-evidence.md:18-25`). Mudanças podem levar `compatibility: compatible`, o que suprime candidatos de changed-reference sem implicar aceitação humana (`docs/adr/0016-callable-compatibility-evidence.md:27-29`).

## Contexto

Hashes de sintaxe detectam mudança mas não provam que chamadas antigas continuam válidas (`docs/adr/0016-callable-compatibility-evidence.md:11-14`).

## Consequências

Até 16 KiB de prova por chamável; nenhum checker roda na indexação; compatibilidade intencionalmente incompleta (`docs/adr/0016-callable-compatibility-evidence.md:35-39`). Implementação: `compatibleSignature` (`src/discovery/facts/signature-compatibility.ts:15`) usado pelo diff (`src/diff/change-set.ts:35-43`).

## Pacotes afetados

[[doc-bridge-divergencia]], [[doc-bridge-indexacao]].

## Substitui / substituído por

Parcialmente substituído por ADR-0017.

## Fonte

`docs/adr/0016-callable-compatibility-evidence.md`
