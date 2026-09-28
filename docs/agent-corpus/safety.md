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
`redactSecrets` replaces every match of the exported `SECRET_PATTERNS` list with `[REDACTED]`:
PEM private key blocks, Stripe, Anthropic, OpenAI (legacy and `sk-proj-`), GitHub (`gh[pousr]_`,
`github_pat_`), Slack (`xox*-`, `xapp-`), AWS access key ids (`AKIA`/`ASIA`), Google API keys,
npm tokens, `Bearer` credentials, and `password`/`token`/`secret`/`api-key` assignments.
`containsSecret` is the boolean form used by the memory safety scan. Symbolic links are skipped; containment checks
prevent escapes via symlink resolution.
