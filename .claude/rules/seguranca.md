# Regras de segurança

Cada regra diz como é verificada.

- **Nenhum segredo no repositório.** Código, docs, fixtures e exemplos usam valores sintéticos óbvios ou gerados no teste. Verifica: gitleaks (`.gitleaks.toml`) no job `security` do `ci-standard.yml`, em todo run, mesmo só de docs.
- **Segredo nunca em log, PR, issue ou commit.** Não imprima variáveis de ambiente, tokens nem URLs com senha; referencie o segredo pelo nome (1Password / GitHub env), nunca pelo valor. Verifica: revisão; o `--redact` do gitleaks protege o log do próprio scan.
- **Dependência de produção sem vulnerabilidade alta ou crítica.** Verifica: `npm audit --omit=dev --audit-level=high` (ou `pnpm audit --prod --audit-level high`) no job `security`.
- **Repo privado não vaza para repo público.** Antes de copiar qualquer coisa para outro repo, confira `gh api repos/<org>/<repo> --jq .visibility`; se for `public`, não copie (ver a seção de confidencialidade do AGENTS.md). Verifica: revisão.
- **Ações de terceiros fixadas.** `uses:` de ação de terceiros (fora de `actions/*` e das orgs NoxCodeSolutions/AgentsKit-io) vai fixada por SHA de commit, com a versão em comentário. Binário baixado no CI é conferido por sha256 (ex.: gitleaks). Verifica: revisão do workflow.
