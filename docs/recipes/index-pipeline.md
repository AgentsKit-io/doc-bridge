# Index pipeline recipes

Keep `.doc-bridge/index.json` fresh during development and in CI.

## Watch mode (local dev)

```bash
ak-docs index --watch
```

Watches `docs/for-agents/` (and human corpus dirs when configured). Rebuilds on `.md`, `.mdx`, `.json`, `.yaml` changes.

Pair with MCP in Cursor — agents always resolve against a live index.

## Pre-commit hook

`.husky/pre-commit` or `.git/hooks/pre-commit`:

```bash
#!/bin/sh
ak-docs index
ak-docs gate run index-freshness || {
  echo "doc-bridge index is stale — run: ak-docs index"
  exit 1
}
```

Or only index agent docs when they change:

```bash
#!/bin/sh
if git diff --cached --name-only | grep -Eq 'docs/for-agents/|doc-bridge\.config'; then
  ak-docs index
fi
```

## Turborepo task

`turbo.json`:

```json
{
  "tasks": {
    "ak-docs:index": {
      "inputs": ["docs/for-agents/**", "doc-bridge.config.*"],
      "outputs": [".doc-bridge/index.json", "llms.txt", ".doc-bridge/capabilities.json"]
    },
    "build": {
      "dependsOn": ["ak-docs:index"]
    }
  }
}
```

Root `package.json`:

```json
{
  "scripts": {
    "ak-docs:index": "ak-docs index",
    "ak-docs:gate": "ak-docs gate run"
  }
}
```

## CI (GitHub Action)

```yaml
- uses: AgentsKit-io/doc-bridge@v1.1.0
```

Or manual:

```yaml
- run: npm i -g @agentskit/doc-bridge && ak-docs index && ak-docs gate run
```

## Coverage badge in README

```bash
ak-docs doctor --badge
# paste markdown into README

# or persist for CI:
ak-docs doctor --write-badge
pnpm coverage:badge
```

Paste the shields.io line from `.doc-bridge/coverage-badge.json` → `markdown` field.
