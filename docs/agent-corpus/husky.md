---
type: module
id: doc-bridge-husky
editRoot: .husky
humanDoc: /docs/spec/cli
owner: doc-bridge-maintainers
lifecycle: active
sourceOfTruth: .husky
validationPath: pnpm test && pnpm typecheck
docbridge:
  covers:
    - area:.husky
---

# husky

Owns the git hooks; `.husky/pre-push` runs the same typecheck CI runs.
