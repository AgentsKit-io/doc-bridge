import { describe, expect, it } from 'vitest'

import { rankRetrieval } from '../src/retrieval/rank.js'
import type { RetrievalEntry, RetrievalIndexV1 } from '../src/schemas/retrieval-index.js'

const HASH = 'a'.repeat(64)

type Edge = { readonly kind: string; readonly id: string }

const entry = (path: string, fields: Partial<RetrievalEntry['fields']>, edges: readonly Edge[], kind: 'document' | 'module' = 'document'): RetrievalEntry => ({
  id: `${kind}:${path}`,
  kind,
  path,
  title: fields.title ?? path,
  aliases: [],
  tags: [kind],
  fields: { title: '', headings: '', path, symbols: '', summary: '', body: '', aliases: '', ...fields },
  graph: {
    pagerank: 0,
    inboundLinks: 0,
    coveredBy: [],
    mentionedBy: [],
    inbound: [],
    outbound: edges.map((edge) => ({ ...edge, confidence: 'observed' as const })),
  },
  contentHash: HASH,
  provenance: 'observed',
  confidence: 'observed',
})

/**
 * A hub that names the widget everywhere, a guide named for it, a page that mentions it once, and
 * a test that imports the hub. The hub links to the two pages. Every entry matches lexically, so
 * every entry is an anchor.
 */
const projection = (): RetrievalIndexV1 => ({
  type: 'retrieval-index',
  schemaVersion: 1,
  contentHash: HASH,
  contentHashAlgo: 'sha256-normalized-v1',
  snapshotHash: HASH,
  overlayHash: HASH,
  configurationHash: HASH,
  lexiconVersion: 1,
  graphMetricsVersion: 'test',
  weights: { title: 4, headings: 3, symbols: 3, path: 2, aliases: 2, summary: 2, body: 1 },
  params: { k1: 1.2, b: 0.75 },
  lexical: { version: 1, documentCount: 4, fieldNames: [], averageFieldLength: {} },
  entries: [
    entry('docs/hub.md', { title: 'Widget hub', headings: 'Widget', summary: 'Widget', body: 'widget widget widget' }, [
      { kind: 'links-to', id: 'document:docs/guides/widget.md' },
      { kind: 'links-to', id: 'document:docs/mention.md' },
      { kind: 'imports', id: 'module:tests/widget.test.ts' },
    ]),
    entry('docs/guides/widget.md', { title: 'Widget guide' }, []),
    entry('docs/mention.md', { title: 'Mention', body: 'a passing widget mention among many other words here' }, []),
    entry('tests/widget.test.ts', { title: 'widget.test.ts' }, [], 'module'),
  ],
})

describe('graph proximity between anchors', () => {
  it('lets a weaker anchor take proximity from a stronger one, never the reverse', () => {
    const ranked = rankRetrieval(projection(), 'widget', { floor: 0 })
    const byPath = new Map(ranked.map((item) => [item.entry.path, item]))
    const hub = byPath.get('docs/hub.md')
    const guide = byPath.get('docs/guides/widget.md')

    expect(hub?.explanation.components.lexical).toBeGreaterThan(guide?.explanation.components.lexical ?? Infinity)
    // The strongest anchor is not lifted by what it links to.
    expect(hub?.explanation.components.graphProximity).toBe(0)
    expect(hub?.explanation.surfacedBy).toBeUndefined()
    // A weaker anchor next to it earns the proximity a non-anchor neighbour would.
    expect(guide?.explanation.components.graphProximity).toBeGreaterThan(0)
    expect(guide?.explanation.surfacedBy).toMatchObject({ kind: 'links-to', id: 'document:docs/hub.md', hops: 1 })
    // A direct lexical match keeps its own confidence.
    expect(guide?.confidence).toBe('observed')
  })

  it('does not lift an anchor that only imports a stronger one', () => {
    const ranked = rankRetrieval(projection(), 'widget', { floor: 0 })
    const test = ranked.find((item) => item.entry.path === 'tests/widget.test.ts')
    expect(test?.explanation.components.lexical).toBeGreaterThan(0)
    expect(test?.explanation.components.graphProximity).toBe(0)
    expect(test?.explanation.surfacedBy).toBeUndefined()
  })
})
