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
  - docs/adr/0009-study-provider-cli-adapter.md
  - src/study/provider-cli.ts
  - src/study/runner.ts
tags: [adr, repo/doc-bridge, camada/ferramenta]
---

# doc-bridge ADR-0009 - Adaptador CLI de provedores do estudo

> [!tldr] Em linguagem comum
> O estudo chama modelos e agentes por programas de linha de comando configurados, nunca por texto de shell, passando só as variáveis de ambiente permitidas e exigindo uma resposta JSON.

← [[00 Decisões - doc-bridge]]

## Status e datas

Aceito em 2026-08-31 (`docs/adr/0009-study-provider-cli-adapter.md:3-4`).

## A decisão

Executável + lista de argumentos, ambiente em allowlist, limites de entrada/tempo/saída/retentativa, um objeto JSON em stdout e logs em stderr; configuração de provedores endereçada por conteúdo mapeando cada par (modelo, cenário) a um comando; nenhum runtime local embutido (Ollama rejeitado como padrão) (`docs/adr/0009-study-provider-cli-adapter.md:11-19`).

## Contexto

Trocar o provedor real sem mudar executor nem ledger, e auditar acesso de rede por mapeamento (`docs/adr/0009-study-provider-cli-adapter.md:13`).

## Consequências

Falhas (executável ausente, JSON malformado, saída não zero, timeout, limite) viram evidência explícita; credenciais ficam fora dos artefatos (`docs/adr/0009-study-provider-cli-adapter.md:23-25`). Implementação: `createStudyProviderCliConfig`, `validateStudyProviderCommand` (`src/study/provider-cli.ts:61`, `src/study/provider-cli.ts:98`).

> [!question] Dúvida
> O executor herda `process.env` inteiro quando o pedido não traz `envAllowlist` (`src/study/runner.ts:324-325`); a allowlist é obrigatória só por convenção do plano?

## Pacotes afetados

[[doc-bridge-estudo]].

## Substitui / substituído por

Nenhum; reaproveitado por [[doc-bridge ADR-0021 - Execução isolada do estudo mínimo]].

## Fonte

`docs/adr/0009-study-provider-cli-adapter.md`
