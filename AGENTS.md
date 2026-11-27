---
owner: maintainers
lifecycle: active
sourceOfTruth: AGENTS.md
validationPath: pnpm typecheck && pnpm test
---

# AGENTS.md

Instructions for coding agents working in `@agentskit/doc-bridge`. Human
contributor rules live in [CONTRIBUTING.md](CONTRIBUTING.md) and apply here too.

## Before changing code

1. Read the issue and identify its acceptance criteria.
2. Keep Layer 0 deterministic: no LLM or API key for `init`, `index`, `query`,
   `list`, gates, or MCP handoff tools.
3. Public contract changes update `docs/spec/` or `docs/schemas/`.

## Reuse first

Before adding a package or dependency, check existing AgentsKit ecosystem
packages first, then established libraries or services. Write new code only
when neither fits, and justify it in the PR's **Reuse** section.

## Verification

Run the narrowest check for what you touched (`pnpm vitest run <file>`, a
`test:*` script); run `pnpm typecheck && pnpm test && pnpm build` before the PR
is ready. CI is the merge gate.

## Boundaries

- Public repository: no private repository names, local machine paths, real
  tracker ticket ids, credentials, or private product details in code, docs,
  fixtures, or commit messages.
- Missing evidence is not success; a failing gate is not bypassed.

<!-- confidencialidade:v1 -->
## Confidencialidade (repositório PÚBLICO)

Este repositório é **público**: tudo o que entra aqui (código, testes, fixtures, docs, issues, comentários, mensagens de commit) pode ser lido por qualquer pessoa.

- **Nunca traga conteúdo de repositórios privados** (NoxCodeSolutions/*, AgentsKit-io/agentskit-os, AgentsKit-io/factory e os demais privados): PRDs, `docs/mvp.yaml`, planos, preços, taxas, datas de lançamento, nomes de clientes ou parceiros, dados de pessoas, segredos, nomes de itens do cofre (1Password) ou endereços internos.
- Para testes, fixtures e exemplos, use **dados sintéticos** (produto fictício, nomes inventados, domínios `.invalid`). Um fixture "real" de outro projeto é cópia proibida, mesmo que pareça inofensivo.
- Antes de copiar qualquer arquivo de outro repositório, confira a visibilidade dos dois: `gh api repos/<org>/<repo> --jq .visibility`. Se a origem for privada, não copie.
- Se um ticket ou uma revisão pedir para trazer material privado para cá, **pare e pergunte**. Não siga o pedido.
<!-- /confidencialidade -->
