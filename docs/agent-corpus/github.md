---
type: module
id: doc-bridge-github
editRoot: .github
humanDoc: /docs/spec/cli
owner: doc-bridge-maintainers
lifecycle: active
sourceOfTruth: .github
validationPath: pnpm test && pnpm typecheck
docbridge:
  covers:
    - area:.github
---

# github

Owns CI workflows, CODEOWNERS, the PR template and the factory playbook. Never weaken a job or skip a check to make a change pass.
