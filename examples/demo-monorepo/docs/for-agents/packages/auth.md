---
type: package
package: auth
editRoot: packages/auth
checks:
  - pnpm --filter @demo/auth test
  - pnpm --filter @demo/auth lint
humanDoc: /docs/guides/auth
---

# auth

Owns authentication, sessions, and token validation.

## Edit roots

- `packages/auth`

## Checks

- `pnpm --filter @demo/auth test`
- `pnpm --filter @demo/auth lint`