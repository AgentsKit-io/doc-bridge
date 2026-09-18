---
type: module
id: doc-bridge-safety
editRoot: src/safety
humanDoc: /docs/spec/config-v1
owner: doc-bridge-maintainers
lifecycle: active
sourceOfTruth: src/safety
validationPath: pnpm test && node bin/ak-docs.js index
docbridge:
  covers:
    - area:src/safety
---

# Safety

Owns safe file discovery and secret detection. The `safeWalkFiles` function walks a repository
with resource limits (file count, byte size, memory, time) and respects exclusion globs from
`safety.exclude` in config or `DEFAULT_SAFETY_EXCLUDES` — paths matching `.git`, `node_modules`,
dist, build, coverage directories, and patterns for `.env`, `.pem`, `.key`, and secret-like names.
`redactSecrets` detects and redacts patterns for API keys (Stripe, GitHub, AWS) and
credentials (password, token, api-key style). Symbolic links are skipped; containment checks
prevent escapes via symlink resolution.
