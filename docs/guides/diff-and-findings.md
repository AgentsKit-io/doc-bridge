---
title: Diff and findings
description: Compare snapshots and inspect evidence-backed documentation divergence.
---

# Diff and findings

Compare snapshots and inspect evidence-backed documentation divergence.

## Minimal example

Compare two raw snapshots from the same project. From a built repository checkout,
this example removes a cited export in a temporary signature fixture copy:

```bash
set -e
work=$(mktemp -d)
DOC_BRIDGE_EXAMPLE="$work" node --input-type=module <<'JS'
import { cpSync, readFileSync, writeFileSync } from 'node:fs'
import { discoverRepository } from './dist/index.js'
const work = process.env.DOC_BRIDGE_EXAMPLE
const root = `${work}/repo`
cpSync('tests/fixtures/signature-api', root, { recursive: true })
writeFileSync(`${work}/base.json`, JSON.stringify(discoverRepository({ root })))
const source = readFileSync(`${root}/api.ts`, 'utf8')
writeFileSync(`${root}/api.ts`, source.split('\n').filter(line => !line.startsWith('export const describeThing')).join('\n'))
writeFileSync(`${work}/head.json`, JSON.stringify(discoverRepository({ root })))
JS
node bin/ak-docs.js diff --base "$work/base.json" --head "$work/head.json" --root "$work/repo"
rm -rf "$work"
```

For a real comparison, capture base and head independently from their respective
revisions; supply the matching head checkout with `--root`. The JSON contains
`changeSet`, `impact` and `findings`. Historical and current relations both
contribute review impact. Changed documentation is listed separately and may
still contain a residual divergence.

## Limits

`BROKEN_REFERENCE` requires a removal delta and verified surviving head citation;
missing resolution alone is uncertainty. Incomplete extraction or unavailable,
drifting head text gives `stale-or-unverified`. Competing owners produce
`AMBIGUOUS_REFERENCE`, never an arbitrary owner. Evidence includes bounded base
and verified head locations. Similarity does not prove renames. Unsupported
analysis is coverage, not an empty successful delta. Findings are advisory;
exit zero does not approve a correction.

See [change sets](../spec/change-set-v1.md), [ChangeSetV1](../schemas/change-set-v1.md)
and [CLI](../spec/cli.md#snapshot-diff).
