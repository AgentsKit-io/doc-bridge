---
type: module
id: doc-bridge-changelog
editRoot: changelog.d
humanDoc: /docs/spec/cli
owner: doc-bridge-maintainers
lifecycle: active
sourceOfTruth: changelog.d
validationPath: pnpm test && pnpm typecheck
docbridge:
  covers:
    - area:changelog.d
---

# changelog

Owns per-PR changelog fragments. Add one new file per PR whose first line is a conventional line; never bump the version or edit the top of CHANGELOG.md.
