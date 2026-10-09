---
title: Studio sample exports
description: Pinned public repository graphs and a small synthetic interaction fixture.
owner: maintainers
lifecycle: active
sourceOfTruth: docs/schemas/studio-graph-v1.md
validationPath: pnpm vitest run tests/studio.test.ts --maxWorkers=2
---

# Studio sample exports

These files implement [StudioGraphV1](../../schemas/studio-graph-v1.md) for the
[design brief](../studio-brief.md). Real exports use actual indexed repository
content, with decision/concept/change extraction explicitly enabled. They are
bounded views, not complete repository maps. Neither real sample was supplied
findings or proposals, so its empty inbox is **not-analyzed**, not evidence of
no drift. `synthetic.json` supplies all nine kinds, seven UI edge kinds, three
reference findings (including updated-in-this-change), and seven proposal states.
Its metrics and evidence are synthetic and must never authorize an action.

| File | Public source | Source SHA | Acquisition |
| --- | --- | --- | --- |
| `doc-bridge.json` | [doc-bridge](https://github.com/AgentsKit-io/doc-bridge) | `6291c1d2de185f56cfb11c1a116f2e7e327d5435` | Tracked-source archive of this revision; no git history in the archive. |
| `agentskit.json` | [AgentsKit](https://github.com/AgentsKit-io/agentskit) | `cff4ba9b36a393d9d226bd2b6a64152120990a95` | Fresh shallow clone of public main; only shallow history is available. |
| `synthetic.json` | Synthetic | Not applicable | Authored compact interaction fixture. |

Engine: `@agentskit/doc-bridge` version `1.15.0-next.0`, revision
`6291c1d2de185f56cfb11c1a116f2e7e327d5435`. Package labels use manifest names;
`packages/sandbox` is labeled `@agentskit/sandbox`. The synthetic contract is unchanged.

Each pretty-printed file is below 2,000,000 bytes. `STUDIO_LIMITS` caps 800 nodes,
300 documents, 2,000 edges and 100 entries per inbox collection; inspect the
embedded omitted counts, metric scopes and original entity extraction coverage.
Public sample presentation additionally omits provider integration, third-party
product, tracker-number and retired import-name references. Their removed nodes/edges are included in omitted counts;
centrality and degree are recomputed over the remaining graph. These are display
subsets of actual exports, without invented nodes or relations.
The shallow monorepo clone's emitted change mentions a tracker number and is
omitted by this policy; its public display therefore contains seven node kinds.
The doc-bridge archive contains eight. Missing timestamps and graph metrics are deliberate. Do not turn omissions into
zero metrics or imply that the current graph contains historical removed targets.

## Reproduce the real projections

Build the engine (`pnpm build`) and use public source acquisition. For the
monorepo, always start with a fresh clone rather than a developer checkout:

```bash
git clone --depth 1 --branch main https://github.com/AgentsKit-io/agentskit.git .doc-bridge/studio-source
```

For this pinned fixture, ensure the source clone is at the recorded SHA;
if main has advanced, fetch that exact SHA with depth 1 and check it out detached.
For the doc-bridge fixture, export tracked bytes of the recorded revision with
`git archive`, extracting into a separate folder without a `.git` directory.
Do not install dependencies or execute scripts from either source corpus.

From the engine checkout, use the existing source repository configuration and
explicitly enable knowledge entities with a 20-commit history window:

```js
import { mkdirSync, writeFileSync } from 'node:fs'
import {
  applyConfigDefaults, buildDocBridgeIndex, loadConfig,
} from './dist/index.js'

const root = '.doc-bridge/studio-source'
const loaded = loadConfig({ cwd: root })
const config = applyConfigDefaults({
  ...loaded.config,
  project: { ...loaded.config.project, root: '..' },
  index: {
    ...loaded.config.index,
    outFile: '.doc-bridge/studio-index.json',
    knowledgeEntities: { enabled: true, maxCommits: 20 },
  },
})
mkdirSync(`${root}/.doc-bridge`, { recursive: true })
writeFileSync(`${root}/.doc-bridge/studio.config.json`, JSON.stringify(config))
buildDocBridgeIndex({ root, config, write: true })
```

Export through the documented CLI, supplying the source SHA (the output must not
already exist):

```bash
node bin/ak-docs.js studio export --config .doc-bridge/studio-source/.doc-bridge/studio.config.json --revision cff4ba9b36a393d9d226bd2b6a64152120990a95 --output .doc-bridge/studio-sample.json --json
```

Change root and revision to the doc-bridge archive for that sample. The separate
ignored index avoids changing a source repository's existing index. Before
publishing sample data, remove provider integration, third-party product,
tracker-number and retired import-name references according to the public sample policy above, update emitted/
omitted counts and recompute degree/centrality. The commands create a raw local
export; committed design fixtures include that additional display filtering. Runtime
export itself does not fetch sources. Source selection, configuration, public presentation exclusions and engine
revision must all match to reproduce bytes; the schema and limits still apply
when the upstream source or engine evolves. Use the committed files for stable
design work and fresh outputs to test new data. Source documents may have long
paths and labels; render them as text with wrapping, never as executable markup.
