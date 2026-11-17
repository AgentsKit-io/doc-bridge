# Regras de CI (padrão de CI, docs/ci-standard.md)

Cada regra diz como é verificada. Se a verificação falhar, corrija o código, não a verificação.

- **Pre-push obrigatório e rápido.** `.husky/pre-push` → `ci-standard/scripts/pre-push.mjs` (oxlint e formato do Biome nos arquivos alterados + `tsc` do TS 7), abaixo de 10 s. Verifica: job `lint` (`test -x .husky/pre-push`). Não use `--no-verify`.
- **Ferramentas do padrão.** `bun install` sobre o lockfile do repo (nunca um `bun.lock` novo), oxlint para lint, Biome só para formatar, vitest, TypeScript 7 (`tsc` nativo). Verifica: job `lint` do `ci-standard.yml`.
- **Cada minuto conta.** Rascunho roda só lint + typecheck; PR pronto roda o afetado (testes e build); mudança só de docs/changelog não sobe job pesado; push na base só semeia o cache; o noturno (só se a base mudou) e a produção rodam tudo. Push novo cancela o run anterior do PR. Todo job tem `timeout-minutes`. Verifica: `ci-standard/test/manifest.test.mjs`.
- **PR roda só o afetado.** Arquivo novo fora de toda regra faz o `plan` falhar: registre-o em `ci-standard/affected.config.json` (`workspaces`, `global` ou `ignore`). Verifica: `ci-standard/scripts/affected.mjs`, passos de prova no job `plan`.
- **Sem job que repita o padrão.** Comando só do produto entra em `extra-lint-command`, `extra-test-command` ou `extra-build-command`; nunca num job `checks` paralelo. Verifica: revisão do `ci.yml` contra a tabela "Sem job duplicado" do `docs/ci-standard.md`.
- **Contrato e e2e sem porta, data, `flock` ou slot fixos.** Porta via `freePort()`, banco via `createTestDatabase()` (um por job), data via `testNow()`/`fakeClock()` com offsets (`ci-standard/scripts/test-env.mjs`). Verifica: `node ci-standard/scripts/no-fixed-ports.mjs` (job `lint`).
- **Cache do Actions: só o branch base grava; PR só restaura.** Nada de `cache:` no `setup-node`; use `.github/actions/setup-deps`. Verifica: `node ci-standard/scripts/cache-guard.mjs` (job `lint`).
- **TypeScript 7 estável.** `typescript` fixado em 7.0.x; nada de `@typescript/native-preview` nem alias npm do TypeScript antigo. Verifica: passo `npx tsc --version` do job `lint`.
- **Não apague nem pule teste para ganhar tempo.** Teste lento ou instável vira ticket; o ganho vem de isolar (porta, banco, data), não de cortar.
