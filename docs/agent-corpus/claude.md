---
type: module
id: doc-bridge-claude
editRoot: .claude
humanDoc: /docs/spec/cli
owner: doc-bridge-maintainers
lifecycle: active
sourceOfTruth: .claude
validationPath: pnpm test && pnpm typecheck
docbridge:
  covers:
    - area:.claude
---

# claude

Owns the project rules Claude Code reads under `.claude/rules`, for CI and security conduct.
