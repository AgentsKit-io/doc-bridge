import { describe, expect, it } from 'vitest'

import {
  DEFAULT_COMMUNITY_SEED,
  DEFAULT_PROXIMITY_DEPTH,
  GRAPH_ANALYZER_VERSION,
  IMPORT_EDGE_KINDS,
  areaSuggestionCoverage,
  areaSuggestions,
  buildKnowledgeGraph,
  canonicality,
  centrality,
  importCycles,
  proximity,
  seededRandom,
} from '../src/graph/build.js'
import { createDocBridgeGraphMemory, type GraphMemory } from '../src/graph/memory.js'
import { evaluateRules } from '../src/rules/engine.js'
import { reconcileKnowledge } from '../src/reconciliation/reconcile.js'
import type { DiscoverySnapshotV1, Evidence, KnowledgeEntity, KnowledgeRelation } from '../src/schemas/knowledge.js'

const evidence = (path: string, line = 1): Evidence => ({ source: 'code', path, lineStart: line, lineEnd: line })

const moduleEntity = (path: string): KnowledgeEntity => ({
  id: `module:${path}`,
  kind: 'module',
  name: path.split('/').pop() ?? path,
  path,
  provenance: 'observed',
  evidence: [evidence(path)],
})

const documentEntity = (path: string): KnowledgeEntity => ({
  id: `document:${path}`,
  kind: 'document',
  name: path.split('/').pop() ?? path,
  path,
  provenance: 'observed',
  evidence: [{ source: 'documentation', path, lineStart: 1, lineEnd: 1 }],
})

const relation = (from: string, kind: string, to: string, path = 'src/a.ts'): KnowledgeRelation => ({
  id: `relation:${from}:${kind}:${to}`,
  kind,
  from,
  to,
  provenance: 'observed',
  evidence: [evidence(path)],
})

/**
 * A fixture with known answers.
 *
 * Imports: a → b → c → d, plus a → d. So b and c each sit on the a→d path through them, while a
 * is a source and d a sink: betweenness must rank b and c above zero and leave a and d at zero.
 * Documentation: index links to both guides, and each guide covers a module — so the index is the
 * canonical entry point under PageRank, however little it says.
 */
const fixture = (): Pick<DiscoverySnapshotV1, 'entities' | 'relations'> => ({
  entities: [
    moduleEntity('src/a.ts'),
    moduleEntity('src/b.ts'),
    moduleEntity('src/c.ts'),
    moduleEntity('src/d.ts'),
    documentEntity('docs/index.md'),
    documentEntity('docs/one.md'),
    documentEntity('docs/two.md'),
  ],
  relations: [
    relation('module:src/a.ts', 'imports', 'module:src/b.ts', 'src/a.ts'),
    relation('module:src/b.ts', 'imports', 'module:src/c.ts', 'src/b.ts'),
    relation('module:src/c.ts', 'imports', 'module:src/d.ts', 'src/c.ts'),
    relation('module:src/a.ts', 'imports', 'module:src/d.ts', 'src/a.ts'),
    relation('document:docs/index.md', 'links-to', 'document:docs/one.md', 'docs/index.md'),
    relation('document:docs/index.md', 'links-to', 'document:docs/two.md', 'docs/index.md'),
    relation('document:docs/one.md', 'covers', 'module:src/a.ts', 'docs/one.md'),
    relation('document:docs/two.md', 'covers', 'module:src/d.ts', 'docs/two.md'),
  ],
})

const shuffled = (snapshot: Pick<DiscoverySnapshotV1, 'entities' | 'relations'>): Pick<DiscoverySnapshotV1, 'entities' | 'relations'> => ({
  entities: [...snapshot.entities].reverse(),
  relations: [...snapshot.relations].slice(3).concat([...snapshot.relations].slice(0, 3)),
})

const snapshotFrom = (
  parts: Pick<DiscoverySnapshotV1, 'entities' | 'relations'>,
): DiscoverySnapshotV1 => ({
  type: 'discovery-snapshot',
  schemaVersion: 1,
  contentHash: 'a'.repeat(64),
  contentHashAlgo: 'sha256-normalized-v1',
  project: { name: 'fixture', root: '.' },
  sourceRevision: 'fixture',
  sourceRevisionKind: 'content',
  configurationHash: 'b'.repeat(64),
  pipelineVersion: '1.4.0',
  analyzerVersions: { repository: '1.2.0' },
  entities: parts.entities,
  relations: parts.relations,
  coverage: [],
})

describe('graph construction', () => {
  it('keeps only the requested relation kinds and drops external endpoints', () => {
    const snapshot = {
      entities: [moduleEntity('src/a.ts')],
      relations: [
        relation('module:src/a.ts', 'imports', 'module:src/b.ts'),
        relation('module:src/a.ts', 'imports', 'external:left-pad'),
        relation('module:src/a.ts', 'covers', 'module:src/b.ts'),
        relation('module:src/a.ts', 'imports', 'module:src/a.ts'),
      ],
    }
    const graph = buildKnowledgeGraph(snapshot, { kinds: IMPORT_EDGE_KINDS })
    expect(graph.order).toBe(2)
    expect(graph.size).toBe(1)

    // External libraries are not project architecture, until a caller says they are.
    expect(buildKnowledgeGraph(snapshot, { kinds: IMPORT_EDGE_KINDS, includeExternal: true }).order).toBe(3)
  })
})

describe('graph signals', () => {
  it('ranks a documentation entry point above the pages it links to', () => {
    const scores = canonicality(fixture())
    const index = scores.get('document:docs/index.md') ?? 0
    const leaf = scores.get('document:docs/one.md') ?? 0
    const covered = scores.get('module:src/a.ts') ?? 0

    // Nothing links to the index, so its rank comes only from the damping factor; the pages it
    // points at, and the modules those cover, accumulate from it.
    expect(covered).toBeGreaterThan(leaf)
    expect(leaf).toBeGreaterThan(index)
    expect([...scores.values()].reduce((total, value) => total + value, 0)).toBeCloseTo(1, 3)
  })

  it('puts betweenness on the modules that paths run through, and zero on the ends', () => {
    const scores = centrality(fixture())
    expect(scores.get('module:src/b.ts')).toBeGreaterThan(0)
    expect(scores.get('module:src/c.ts')).toBeGreaterThan(0)
    expect(scores.get('module:src/a.ts')).toBe(0)
    expect(scores.get('module:src/d.ts')).toBe(0)
    expect(scores.get('module:src/b.ts')).toBe(scores.get('module:src/c.ts'))
  })

  it('measures proximity in hops, nearest first, and stops at the bound', () => {
    const near = proximity(fixture(), 'module:src/a.ts')
    expect(near.get('module:src/b.ts')).toBe(1)
    expect(near.get('module:src/d.ts')).toBe(1)
    expect(near.get('module:src/c.ts')).toBe(2)
    expect([...near.values()]).toEqual([...near.values()].sort((left, right) => left - right))

    expect(proximity(fixture(), 'module:src/a.ts', { maxDepth: 1 }).has('module:src/c.ts')).toBe(false)
    expect(proximity(fixture(), 'module:nowhere.ts').size).toBe(0)
    expect(DEFAULT_PROXIMITY_DEPTH).toBe(3)
  })

  it('finds a cycle and names every edge that forms it', () => {
    const cyclic = {
      entities: [moduleEntity('src/a.ts'), moduleEntity('src/b.ts'), moduleEntity('src/c.ts')],
      relations: [
        relation('module:src/a.ts', 'imports', 'module:src/b.ts', 'src/a.ts'),
        relation('module:src/b.ts', 'imports', 'module:src/c.ts', 'src/b.ts'),
        relation('module:src/c.ts', 'imports', 'module:src/a.ts', 'src/c.ts'),
      ],
    }
    const cycles = importCycles(cyclic)
    expect(cycles).toHaveLength(1)
    expect(cycles[0]?.nodes).toEqual(['module:src/a.ts', 'module:src/b.ts', 'module:src/c.ts'])
    expect(cycles[0]?.relationIds).toHaveLength(3)
    expect(cycles[0]?.evidence.map((item) => item.path)).toEqual(['src/a.ts', 'src/b.ts', 'src/c.ts'])

    expect(importCycles(fixture())).toEqual([])
  })

  it('is reproducible, including after the input order is shuffled', () => {
    const one = fixture()
    const other = shuffled(one)

    expect(centrality(other)).toEqual(centrality(one))
    expect(canonicality(other)).toEqual(canonicality(one))
    expect(proximity(other, 'module:src/a.ts')).toEqual(proximity(one, 'module:src/a.ts'))
    expect(importCycles(other)).toEqual(importCycles(one))
  })
})

describe('community suggestions', () => {
  /** Two clusters of three, joined by a single edge: a clustering has something to find. */
  const clustered = (): Pick<DiscoverySnapshotV1, 'entities' | 'relations'> => {
    const left = ['src/left/one.ts', 'src/left/two.ts', 'src/left/three.ts']
    const right = ['src/right/one.ts', 'src/right/two.ts', 'src/right/three.ts']
    const within = (paths: readonly string[]): KnowledgeRelation[] =>
      paths.flatMap((from) => paths.filter((to) => to !== from).map((to) => relation(`module:${from}`, 'imports', `module:${to}`, from)))
    return {
      entities: [...left, ...right].map(moduleEntity),
      relations: [
        ...within(left),
        ...within(right),
        relation('module:src/left/one.ts', 'imports', 'module:src/right/one.ts', 'src/left/one.ts'),
      ],
    }
  }

  it('produces the same communities for the same seed', () => {
    const snapshot = clustered()
    const first = areaSuggestions(snapshot)
    const again = areaSuggestions(snapshot)
    expect(first).toEqual(again)
    expect(first.map((suggestion) => suggestion.label).sort()).toEqual(['src/left', 'src/right'])
    expect(areaSuggestions(shuffled(snapshot))).toEqual(first)
    expect(DEFAULT_COMMUNITY_SEED).toBe(20_260_401)
  })

  it('is a coverage note and never an area entity', () => {
    const snapshot = clustered()
    const coverage = areaSuggestionCoverage(snapshot)
    expect(coverage.length).toBeGreaterThan(0)
    expect(coverage.every((entry) => entry.analyzer === 'graph' && entry.analyzerVersion === GRAPH_ANALYZER_VERSION)).toBe(true)
    expect(coverage.every((entry) => entry.scope.startsWith('area-suggestion:'))).toBe(true)
    expect(coverage.every((entry) => entry.status === 'not-analyzed')).toBe(true)
    expect(coverage[0]?.evidence?.length).toBeGreaterThan(0)

    // A directory that is already an area needs no suggestion.
    const withArea = {
      ...snapshot,
      entities: [
        ...snapshot.entities,
        { id: 'area:src/left', kind: 'area', name: 'left', path: 'src/left', provenance: 'observed' as const, evidence: [] },
      ],
    }
    expect(areaSuggestionCoverage(withArea).map((entry) => entry.scope)).toEqual(['area-suggestion:src/right'])
  })

  it('draws from a seeded generator, so nothing depends on Math.random', () => {
    const first = seededRandom(7)
    const second = seededRandom(7)
    const values = [first(), first(), first()]
    expect(values).toEqual([second(), second(), second()])
    expect(values.every((value) => value >= 0 && value < 1)).toBe(true)
    expect(seededRandom(8)()).not.toBe(seededRandom(7)())
  })
})

describe('cycles as a diagnostic', () => {
  it('reports each edge of the cycle with its evidence', () => {
    const cyclic = snapshotFrom({
      entities: [moduleEntity('src/a.ts'), moduleEntity('src/b.ts')],
      relations: [
        relation('module:src/a.ts', 'imports', 'module:src/b.ts', 'src/a.ts'),
        relation('module:src/b.ts', 'imports', 'module:src/a.ts', 'src/b.ts'),
      ],
    })
    const report = reconcileKnowledge(cyclic, { ...cyclic, relations: [] })
    const cycle = report.diagnostics.find((item) => item.code === 'IMPORT_CYCLE')

    expect(cycle).toMatchObject({ status: 'unresolved', severity: 'warn' })
    expect(cycle?.message).toContain('module:src/a.ts → module:src/b.ts')
    expect(cycle?.evidence.map((item) => item.path)).toEqual(['src/a.ts', 'src/b.ts'])
    expect(cycle?.relationIds).toHaveLength(2)

    expect(
      reconcileKnowledge(cyclic, { ...cyclic, relations: [] }, { reportImportCycles: false }).diagnostics.filter(
        (item) => item.code === 'IMPORT_CYCLE',
      ),
    ).toEqual([])
  })

  it('reaches the rules engine as a centrality concern', () => {
    const cyclic = snapshotFrom({
      entities: [moduleEntity('src/a.ts'), moduleEntity('src/b.ts')],
      relations: [
        relation('module:src/a.ts', 'imports', 'module:src/b.ts', 'src/a.ts'),
        relation('module:src/b.ts', 'imports', 'module:src/a.ts', 'src/b.ts'),
      ],
    })
    const report = reconcileKnowledge(cyclic, { ...cyclic, relations: [] })
    const result = evaluateRules(report, { preset: 'recommended' })
    expect(result.findings.some((finding) => finding.sourceDiagnosticCode === 'IMPORT_CYCLE')).toBe(true)
  })
})

describe('centrality risk in the rules engine', () => {
  const report = (): Parameters<typeof evaluateRules>[0] => {
    const snapshot = snapshotFrom(fixture())
    return reconcileKnowledge(snapshot, { ...snapshot, relations: [] }, { requiredRelationKinds: [] })
  }

  it('reports nothing without a graph, rather than guessing from findings', () => {
    expect(evaluateRules(report(), { preset: 'strict' }).findings.filter((finding) => finding.ruleId === 'centrality-risk')).toEqual([])
  })

  it('flags the most central entities by betweenness', () => {
    const scores = centrality(fixture())
    const result = evaluateRules(report(), {
      preset: 'recommended',
      centrality: scores,
      warningThresholds: { 'centrality-risk': 1 },
    })
    const flagged = result.findings.filter((finding) => finding.ruleId === 'centrality-risk')

    expect(flagged).toHaveLength(1)
    expect(flagged[0]?.entityIds?.[0]).toBe('module:src/b.ts')
    expect(flagged[0]?.message).toContain('review signal, not a runtime availability claim')
  })

  it('reads a threshold below one as a minimum betweenness', () => {
    const result = evaluateRules(report(), {
      preset: 'recommended',
      centrality: new Map([['module:a', 0.4], ['module:b', 0.05]]),
      warningThresholds: { 'centrality-risk': 0.1 },
    })
    expect(result.findings.filter((finding) => finding.ruleId === 'centrality-risk').map((finding) => finding.entityIds?.[0])).toEqual([
      'module:a',
    ])
  })
})

describe('graph memory', () => {
  const memory = (): GraphMemory => createDocBridgeGraphMemory(fixture())

  it('answers getNode, findEdges and neighbors over the projected graph', async () => {
    const graph = memory()

    const node = await graph.getNode('module:src/b.ts')
    expect(node).toMatchObject({ id: 'module:src/b.ts', kind: 'module' })
    expect(node?.properties).toMatchObject({ path: 'src/b.ts', provenance: 'observed', evidenceCount: 1 })
    expect(await graph.getNode('module:nowhere.ts')).toBeNull()

    const imports = await graph.findEdges({ label: 'imports', from: 'module:src/a.ts' })
    expect(imports.map((edge) => edge.to).sort()).toEqual(['module:src/b.ts', 'module:src/d.ts'])
    expect(await graph.findEdges({ label: 'covers' })).toHaveLength(2)

    expect((await graph.neighbors('module:src/a.ts')).map((item) => item.id)).toEqual([
      'document:docs/one.md',
      'module:src/b.ts',
      'module:src/d.ts',
    ])
    expect((await graph.neighbors('module:src/a.ts', { label: 'imports' })).map((item) => item.id)).toEqual([
      'module:src/b.ts',
      'module:src/d.ts',
    ])
    expect((await graph.neighbors('module:src/a.ts', { depth: 2 })).map((item) => item.id)).toContain('document:docs/index.md')

    expect((await graph.findNodes({ kind: 'document' })).map((item) => item.id)).toEqual([
      'document:docs/index.md',
      'document:docs/one.md',
      'document:docs/two.md',
    ])
  })

  it('layers an overlay over the observation, and keeps writes out of it', async () => {
    const graph = createDocBridgeGraphMemory(fixture(), {
      entities: [{ id: 'module:src/e.ts', kind: 'module', name: 'e.ts', path: 'src/e.ts', provenance: 'proposed', evidence: [] }],
      relations: [relation('module:src/d.ts', 'imports', 'module:src/e.ts', 'src/d.ts')],
    })
    expect((await graph.getNode('module:src/e.ts'))?.properties).toMatchObject({ provenance: 'proposed' })
    expect((await graph.neighbors('module:src/d.ts')).map((item) => item.id)).toContain('module:src/e.ts')

    await graph.upsertNode({ id: 'note:one', kind: 'note', properties: { text: 'looked here' } })
    expect((await graph.getNode('note:one'))?.kind).toBe('note')
    expect((await graph.getNode('note:one'))?.createdAt).toBeTruthy()

    await graph.deleteNode('module:src/b.ts')
    expect(await graph.getNode('module:src/b.ts')).toBeNull()
    // Masking a node hides the edges that would otherwise dangle.
    expect(await graph.findEdges({ to: 'module:src/b.ts' })).toEqual([])

    // Clearing drops the working layer, never the projection.
    await graph.clear?.()
    expect(await graph.getNode('note:one')).toBeNull()
    expect(await graph.getNode('module:src/b.ts')).toMatchObject({ id: 'module:src/b.ts' })
  })

  it('satisfies the ecosystem contract it mirrors', async () => {
    const core = (await import('@agentskit/memory')) as unknown as {
      readonly createInMemoryGraph: () => GraphMemory
    }
    const reference = core.createInMemoryGraph()
    const projected = memory()

    // Same call surface, in both directions.
    for (const method of ['upsertNode', 'upsertEdge', 'getNode', 'findNodes', 'findEdges', 'neighbors', 'deleteNode', 'deleteEdge', 'clear'] as const) {
      expect(typeof projected[method]).toBe('function')
      expect(typeof reference[method]).toBe('function')
    }

    // And the same answers when the reference is loaded with the same graph.
    for (const entity of fixture().entities) {
      await reference.upsertNode({ id: entity.id, kind: entity.kind, properties: {} })
    }
    for (const item of fixture().relations) {
      await reference.upsertEdge({ id: item.id, label: item.kind, from: item.from, to: item.to })
    }
    const sorted = (nodes: readonly { readonly id: string }[]): string[] => nodes.map((node) => node.id).sort()
    expect(sorted(await projected.neighbors('module:src/a.ts', { depth: 2 }))).toEqual(
      sorted(await reference.neighbors('module:src/a.ts', { depth: 2 })),
    )
    expect(sorted(await projected.findEdges({ label: 'imports' }))).toEqual(sorted(await reference.findEdges({ label: 'imports' })))
  })
})
