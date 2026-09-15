---
title: DocBridgeIndex v1
description: Schema reference for the deterministic Doc Bridge repository index.
---

# DocBridgeIndex v1

Zod schema: `DocBridgeIndexV1Schema` in `@agentskit/doc-bridge`.

Portable JSON Schema export: `DocBridgeIndexV1JsonSchema`.

## Shape

```json
{
  "schemaVersion": 1,
  "contentHash": "df701207f5f3663d3e0a5d0e257c7ce1b8f2898ef8e1ea1fe91d5289ec74bb3c",
  "contentHashAlgo": "sha256-normalized-v1",
  "generatedAt": "2026-07-09T00:00:00.000Z",
  "project": { "name": "my-project", "root": "." },
  "knowledge": [
    {
      "id": "auth",
      "type": "agent-doc",
      "title": "Authentication",
      "path": "docs/for-agents/auth.md",
      "description": "Auth ownership and edit workflow."
    },
    {
      "id": "document:docs/auth.md",
      "type": "document",
      "title": "Authentication",
      "path": "docs/auth.md",
      "description": "How sign-in works.",
      "tags": ["document", "human"],
      "contentHash": "2c26b46b68ffc68ff99b453c1d30413413422d706483bfa0f98a5e886266e7ae"
    },
    {
      "id": "module:packages/auth/src/session.ts",
      "type": "module",
      "title": "session.ts",
      "path": "packages/auth/src/session.ts",
      "symbols": ["createSession", "revokeSession"],
      "tags": ["module", "ts", "src"],
      "contentHash": "fcde2b2edba56bf408601fb721fe9b5c338d10ee429ea04fae5511b68fbf8fb9"
    }
  ],
  "handoffs": {
    "auth": {
      "type": "agent-handoff",
      "schemaVersion": 1,
      "source": ".doc-bridge/index.json",
      "target": { "type": "package", "id": "auth", "path": "packages/auth" },
      "startHere": "docs/for-agents/auth.md",
      "readBeforeEditing": ["docs/for-agents/auth.md", "AGENTS.md"],
      "editRoots": ["packages/auth"],
      "checks": ["npm test -- auth"],
      "notes": ["Authentication package"]
    }
  },
  "lookup": {
    "packages": ["auth"],
    "ownership": {
      "auth": {
        "id": "auth",
        "path": "packages/auth",
        "checks": ["npm test -- auth"],
        "agentDoc": "docs/for-agents/auth.md"
      }
    }
  },
  "inputs": {
    "hash": "9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08",
    "fileCount": 318,
    "projectionVersion": 1
  },
  "retrieval": {
    "lexiconVersion": 1,
    "weights": { "id": 8, "symbols": 7, "title": 6, "path": 4, "tags": 3, "description": 2, "body": 1 },
    "params": { "k1": 1.2, "b": 0.75 }
  }
}
```

## Entry kinds

`knowledge` holds two kinds of record, and ranking treats them differently.

**Curated** entries (`type: "agent-doc"`) come from the agent corpus a human wrote. They are what
`llms.txt` lists, and ranking favours them slightly, because they were authored to be the answer
to a question.

**Projected** entries (`type: "document"` or `"module"`) are every documentation file and source
module the [discovery snapshot](../knowledge-engine-runbook.md) observed, projected from it rather
than scanned again, so the two cannot disagree about what exists. A module carries its exported
`symbols`; both carry the `contentHash` of the file they were projected from, so a single stale
entry is detectable without rebuilding. Body text is not here: it lives once, in the projection.
`retrieval.corpus.enabled: false` omits them.

## Projection

`projection` is the [retrieval index](../spec/retrieval-index-v1.md): what search ranks. It holds
every snapshot entity — documents, modules, areas, packages — and the routes the configuration
declares, each with the text the ranker indexes, its graph position, its content hash, provenance
and confidence. It is a pure function of the snapshot, the accepted overlay and the configuration,
and its `contentHash` is over those three inputs. `knowledge[]` above stays in step with it for
readers that predate it.

## Freshness

`inputs` fingerprints the repository the index was built from: every input file and its content
hash, plus the configuration sections the index derives from, hashed together. Query surfaces
verify freshness by re-hashing those inputs rather than rebuilding the index, which is what keeps
a search cheap on a large repository. `retrieval.lexiconVersion` is checked too, because a changed
stopword list changes ranking without changing a single file.

An index written before `inputs` existed is still validated, by the full rebuild-and-compare it
always used.

## Content Hash

`contentHashAlgo` is `sha256-normalized-v1`.

The hash input is deterministic JSON containing only:

- `schemaVersion`
- `knowledge`
- `handoffs`
- `lookup`
- `retrieval`
- `inputs` (when the corpus projection is enabled)

`generatedAt` is not part of the hash input. When the hash is unchanged, `ak-docs index` preserves the existing `generatedAt` so regenerated `index.json` bytes stay stable.

## Validation

```ts
import { parseDocBridgeIndex } from '@agentskit/doc-bridge'

const index = parseDocBridgeIndex(JSON.parse(raw))
```
