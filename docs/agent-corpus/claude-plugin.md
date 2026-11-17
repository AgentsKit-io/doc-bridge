---
type: module
id: doc-bridge-claude-plugin
editRoot: .claude-plugin
humanDoc: /docs/spec/cli
owner: doc-bridge-maintainers
lifecycle: active
sourceOfTruth: .claude-plugin
validationPath: pnpm test && pnpm typecheck
docbridge:
  covers:
    - area:.claude-plugin
---

# claude-plugin

Owns the Claude plugin manifest that exposes the handoff resolver. Keep it in step with plugin.json.
