#!/usr/bin/env bash
# Checks that need the build, run by the pipeline's build-command.
set -euo pipefail

pnpm build
# Coverage thresholds are enforced here; the pipeline's test stage runs the suite without them.
pnpm coverage
npm pack --dry-run
# Packaged smoke (2-min path + MCP)
pnpm smoke:packaged

# This repository generates its index instead of committing it. Building twice
# verifies deterministic artifact bytes and committed source inputs. The
# committed-index reproducibility gate skips this untracked artifact; docs
# gates still apply. No step claims committed-index freshness.
node bin/ak-docs.js index
first_index=$(mktemp)
trap 'rm -f "$first_index"' EXIT
cp .doc-bridge/index.json "$first_index"
node bin/ak-docs.js index
cmp "$first_index" .doc-bridge/index.json
node --input-type=module <<'NODE'
import { readFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
const tracked = new Set(execFileSync('git', ['ls-files', '-z'], { encoding: 'utf8' }).split('\0'))
const index = JSON.parse(readFileSync('.doc-bridge/index.json', 'utf8'))
const untracked = index.knowledge.filter(entry => !tracked.has(entry.path))
if (untracked.length) throw new Error(`Index includes untracked inputs: ${untracked.map(entry => entry.path).join(', ')}`)
NODE

# Dogfood gate and documentation conformance (generated index)
node bin/ak-docs.js gate run
node bin/ak-docs.js conformance run documentation-standard-v1 --text
node bin/ak-docs.js doctor --text
node bin/ak-docs.js doctor --write-badge
node bin/ak-docs.js doctor --badge

# Public parity gate (fails on a stale or contradictory public claim)
node bin/ak-docs.js parity --text

# Retrieval benchmark gate (fails on a hit@3 regression)
node bin/ak-docs.js bench retrieval docs/bench/retrieval-suite-v1.json \
  --baseline docs/bench/retrieval-baseline-v1.json --exclude 'tests/**' --text

# Ollama smoke (optional)
pnpm smoke:ollama || echo "::warning::optional Ollama smoke failed"
