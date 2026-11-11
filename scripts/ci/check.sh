#!/usr/bin/env bash
# Static repository checks, run by the pipeline's typecheck-command.
set -euo pipefail

pnpm check:no-legacy-chat-imports
pnpm check:cross-platform
pnpm typecheck
# Verify the immutable snapshot; upstream main activity cannot invalidate a PR.
pnpm check:ecosystem-upstream
pnpm check:marketplace
pnpm test:marketplace
pnpm check:readme-standard
pnpm test:readme-standard
