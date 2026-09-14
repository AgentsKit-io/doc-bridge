import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'

import { afterEach, describe, expect, it, vi } from 'vitest'

import { applyConfigDefaults } from '../src/config/defaults.js'
import { DocBridgeConfigV1Schema, type DocBridgeConfigV1 } from '../src/config/schema.js'
import { applyDocumentationDeclarations } from '../src/discovery/documentation.js'
import { discoverRepository } from '../src/discovery/repository.js'
import { buildDocBridgeIndex } from '../src/index-builder/build-index.js'
import { handoffForEntity } from '../src/query/handoff.js'
import { IndexStaleError, loadFreshDocBridgeIndex } from '../src/query/load-index.js'
import { runQuery } from '../src/query/query.js'
import { searchIndex } from '../src/query/search.js'
import { projectRetrievalIndex, weakerConfidence } from '../src/retrieval/project.js'
import { rankRetrieval } from '../src/retrieval/rank.js'
import { createDocBridgeRetriever, retrieveDocBridgeDocuments, type Retriever } from '../src/retriever/doc-bridge-retriever.js'
import { AgentHandoffV1Schema, normalizeAgentHandoff } from '../src/schemas/agent-handoff.js'
import { DocBridgeIndexV1Schema, type DocBridgeIndexV1 } from '../src/schemas/doc-bridge-index.js'
import type { DiscoverySnapshotV1 } from '../src/schemas/knowledge.js'
import { RetrievalIndexV1Schema } from '../src/schemas/retrieval-index.js'

// The repository-level tests scan and project this whole repository; the first one pays for it.
vi.setConfig({ testTimeout: 30_000 })

const repositoryRoot = process.cwd()
const temporary: string[] = []

afterEach(() => {
  for (const directory of temporary) rmSync(directory, { recursive: true, force: true })
  temporary.length = 0
})

const write = (root: string, path: string, content: string): void => {
  const target = join(root, path)
  mkdirSync(dirname(target), { recursive: true })
  writeFileSync(target, content, 'utf8')
}

const repositoryConfig = (): DocBridgeConfigV1 =>
  applyConfigDefaults(DocBridgeConfigV1Schema.parse(JSON.parse(readFileSync(join(repositoryRoot, 'doc-bridge.config.json'), 'utf8')) as unknown))

let cachedRepositoryIndex: DocBridgeIndexV1 | undefined
const repositoryIndex = (): DocBridgeIndexV1 =>
  (cachedRepositoryIndex ??= buildDocBridgeIndex({ root: repositoryRoot, config: repositoryConfig(), write: false }).index)

/**
 * One package with two areas, an ownership record on one of them, a sidecar that covers it, a
 * guide that merely mentions a module in the other, and a hub that links to the guide.
 */
const fixture = (): { readonly root: string; readonly config: DocBridgeConfigV1 } => {
  const root = mkdtempSync(join(tmpdir(), 'doc-bridge-projection-'))
  temporary.push(root)
  writeFileSync(join(root, 'package.json'), JSON.stringify({ name: 'fixture', version: '0.0.0', scripts: { test: 'vitest run' } }), 'utf8')
  write(root, 'src/query/search.ts', "import { rank } from '../ranking/bm25.js'\nexport const searchIndex = (): number => rank()\n")
  write(root, 'src/query/parse.ts', 'export const parseQuery = (): number => 1\n')
  write(root, 'src/ranking/bm25.ts', 'export const rank = (): number => 2\n')
  write(root, 'docs/for-agents/INDEX.md', '# Agent index\n\nStart with [query](./query.md) and the [ranking guide](../ranking.md).\n')
  write(root, 'docs/for-agents/query.md', '---\nid: fixture-query\neditRoot: src/query\n---\n# Query\n\nDeterministic search over the index. Exports `searchIndex`.\n')
  write(root, 'docs/ranking.md', '# Ranking\n\nScores come from `src/ranking/bm25.ts`, which exports `rank`.\n')
  write(root, 'docs/mention.md', '# Mention\n\nA passing mention of `src/query` and nothing more.\n')
  write(root, 'AGENTS.md', '# Agents\n\nRead the agent index first.\n')
  const config = applyConfigDefaults(
    DocBridgeConfigV1Schema.parse({
      schemaVersion: 1,
      corpus: { agent: { root: 'docs/for-agents', index: 'docs/for-agents/INDEX.md' } },
      routing: {
        options: {
          ownership: {
            'fixture-query': { path: 'src/query', purpose: 'Query layer', checks: ['pnpm test --filter query'], agentDoc: 'docs/for-agents/query.md' },
          },
        },
      },
    }),
  )
  return { root, config }
}

describe('the projection is a function of the snapshot', () => {
  it('produces identical content hashes from the same snapshot, overlay and configuration', () => {
    const { root, config } = fixture()
    const snapshot = discoverRepository({ root, config })
    const first = projectRetrievalIndex({ snapshot, config })
    const second = projectRetrievalIndex({ snapshot, config })

    expect(second.contentHash).toBe(first.contentHash)
    expect(second).toEqual(first)
    expect(RetrievalIndexV1Schema.parse(first)).toEqual(first)
    // The hash is over the three inputs: a different overlay is a different projection.
    expect(projectRetrievalIndex({ snapshot, config, overlay: { hash: 'f'.repeat(64) } }).contentHash).not.toBe(first.contentHash)
    expect(projectRetrievalIndex({ snapshot, config: { ...config, retrieval: { weights: { body: 9 } } } }).contentHash).not.toBe(first.contentHash)
  })

  it('projects every observed entity of the repository, as a set', () => {
    const index = repositoryIndex()
    const snapshot = discoverRepository({ root: repositoryRoot, config: repositoryConfig() })
    const projectable = new Set(
      snapshot.entities
        .filter((entity) => entity.provenance === 'observed' && ['document', 'module', 'area', 'package'].includes(entity.kind) && entity.path)
        .map((entity) => entity.id),
    )
    const projected = new Set(index.projection?.entries.filter((entry) => entry.provenance === 'observed').map((entry) => entry.id))

    expect([...projectable].filter((id) => !projected.has(id))).toEqual([])
    expect([...projected].filter((id) => !projectable.has(id))).toEqual([])
    expect(projectable.size).toBeGreaterThan(300)
  })

  it('carries the entity content hash, and hydrates a body only when it still matches', () => {
    const { root, config } = fixture()
    const snapshot = discoverRepository({ root, config })
    const document = snapshot.entities.find((entity) => entity.id === 'document:docs/ranking.md')
    const withBody = projectRetrievalIndex({ snapshot, config, readDocument: (path) => readFileSync(join(root, path), 'utf8') })
    const entry = withBody.entries.find((item) => item.id === 'document:docs/ranking.md')
    expect(entry?.contentHash).toBe(document?.evidence[0]?.contentHash)
    expect(entry?.fields.body).toContain('Scores come from')

    // A file that changed since the scan is not this entity's body.
    const drifted = projectRetrievalIndex({ snapshot, config, readDocument: () => '# Something else entirely\n' })
    expect(drifted.entries.find((item) => item.id === 'document:docs/ranking.md')?.fields.body).toBe('')
  })

  it('keeps the legacy knowledge list in step with the projection, without bodies', () => {
    const { root, config } = fixture()
    const index = buildDocBridgeIndex({ root, config, write: false }).index
    const projectedPaths = new Set(index.projection?.entries.filter((entry) => entry.kind === 'document' || entry.kind === 'module').map((entry) => entry.path))
    for (const entry of index.knowledge) {
      expect(projectedPaths.has(entry.path), entry.path).toBe(true)
      expect(entry.body).toBeUndefined()
    }
    expect(DocBridgeIndexV1Schema.parse(index)).toEqual(index)
  })
})

describe('explainable ranking', () => {
  it('answers the workflow question within the top three, and says why', () => {
    const index = repositoryIndex()
    const matches = searchIndex(index, 'workflow transitions persisted', 3, { explain: true })
    const targets = matches.flatMap((match) => [match.id, match.path])

    expect(targets.some((target) => target === 'module:src/workflow/engine.ts' || target === 'docs/knowledge-engine-runbook.md')).toBe(true)
    for (const match of matches) {
      expect(match.explain?.terms).toEqual(['workflow', 'transition', 'persisted'])
      expect(Object.keys(match.explain?.components ?? {})).toEqual(
        expect.arrayContaining(['lexical', 'exactId', 'exactPath', 'exactSymbol', 'graphProximity', 'canonicality', 'audienceFit', 'acceptedAgentSignals']),
      )
      expect(Object.values(match.explain?.matched ?? {}).flat().length).toBeGreaterThan(0)
    }
  })

  it('does not change the ranking when asked to explain', () => {
    const index = repositoryIndex()
    for (const query of ['reconcileKnowledge', 'how does the gate detect a stale index', 'src/mcp/server.ts', 'who owns the mcp stdio server']) {
      const plain = searchIndex(index, query)
      const explained = searchIndex(index, query, 20, { explain: true })
      expect(explained.map(({ explain: _explain, ...rest }) => rest)).toEqual(plain)
      expect(explained.every((match) => match.explain)).toBe(true)
    }
  })

  it('gives every result evidence, provenance and a confidence', () => {
    const index = repositoryIndex()
    for (const match of searchIndex(index, 'documentation audit')) {
      // Evidence points at the entity the result stands for, which for an ownership record is its unit.
      expect(match.evidence?.[0]?.path).toBe(index.projection?.entries.find((entry) => entry.id === match.entityId)?.path)
      expect(match.evidence?.[0]?.contentHash).toMatch(/^[a-f0-9]{64}$/)
      expect(['observed', 'declared', 'proposed']).toContain(match.provenance)
      expect(['observed', 'declared', 'fuzzy', 'proposed']).toContain(match.confidence)
    }
  })

  it('reports confidence as the weaker of the entry and the relation that surfaced it', () => {
    const { root, config } = fixture()
    const observed = discoverRepository({ root, config })
    // A fuzzy mention: the reference resolved by similarity, and the edge says so.
    const snapshot: DiscoverySnapshotV1 = {
      ...observed,
      relations: [
        ...observed.relations,
        {
          id: 'relation:fuzzy',
          kind: 'mentions',
          from: 'document:docs/mention.md',
          to: 'module:src/ranking/bm25.ts',
          provenance: 'observed',
          evidence: [{ source: 'documentation', path: 'docs/mention.md', lineStart: 3 }],
          metadata: { confidence: 'fuzzy' },
        },
      ],
    }
    const projection = projectRetrievalIndex({ snapshot, config, readDocument: (path) => readFileSync(join(root, path), 'utf8') })
    // Floor 0: the neighbourhood, not just the answer, so the surfaced module is visible.
    const ranked = rankRetrieval(projection, 'passing mention', { floor: 0 })
    const surfaced = ranked.find((item) => item.entry.id === 'module:src/ranking/bm25.ts')

    expect(ranked[0]?.entry.id).toBe('document:docs/mention.md')
    expect(surfaced?.explanation.surfacedBy).toMatchObject({ kind: 'mentions', id: 'document:docs/mention.md', confidence: 'fuzzy', hops: 1 })
    expect(surfaced?.explanation.components.lexical).toBe(0)
    expect(surfaced?.entry.confidence).toBe('observed')
    expect(surfaced?.confidence).toBe('fuzzy')
    // With the default floor the weak neighbour is dropped: retrieval spends nothing on it.
    expect(rankRetrieval(projection, 'passing mention').some((item) => item.entry.id === 'module:src/ranking/bm25.ts')).toBe(false)
    // A direct lexical match keeps its own confidence, however it was also reached.
    const direct = rankRetrieval(projection, 'passing mention rank', { floor: 0 }).find((item) => item.entry.id === 'module:src/ranking/bm25.ts')
    expect(direct?.explanation.components.lexical).toBeGreaterThan(0)
    expect(direct?.confidence).toBe('observed')
    expect(weakerConfidence('observed', 'declared')).toBe('declared')
    expect(weakerConfidence('proposed', 'fuzzy')).toBe('proposed')
  })

  it('still resolves identifiers, paths and non-ASCII text over the projection', () => {
    const { root, config } = fixture()
    write(root, 'docs/autenticacao.md', '# Autenticação\n\nAutenticação e autorização do sistema. 認証と認可の境界を確認する。\n')
    const index = buildDocBridgeIndex({ root, config, write: false }).index

    expect(searchIndex(index, 'searchIndex')[0]?.id).toBe('module:src/query/search.ts')
    expect(searchIndex(index, 'src/ranking/bm25.ts')[0]?.id).toBe('module:src/ranking/bm25.ts')
    expect(searchIndex(index, 'fixture-query')[0]).toMatchObject({ type: 'ownership', id: 'fixture-query' })
    expect(searchIndex(index, 'autenticação')[0]?.path).toBe('docs/autenticacao.md')
    expect(searchIndex(index, '認証')[0]?.path).toBe('docs/autenticacao.md')
    // A substring-only decoy earns nothing: `parse` is not `parseQuery`'s answer to "pars".
    expect(searchIndex(index, 'zzzz')).toEqual([])
  })
})

describe('handoffs for any entity', () => {
  it('answers for a package, an area, a module and a document', () => {
    const { root, config } = fixture()
    const index = buildDocBridgeIndex({ root, config, write: false }).index

    const pkg = handoffForEntity(index, 'package:fixture', config, { root })
    expect(pkg.target).toMatchObject({ type: 'package', id: 'package:fixture', path: '.' })
    expect(AgentHandoffV1Schema.parse(pkg)).toEqual(pkg)

    const area = handoffForEntity(index, 'area:src/query', config, { root })
    expect(area.target).toMatchObject({ type: 'area', id: 'fixture-query', path: 'src/query' })
    expect(area.editRoots).toEqual(['src/query'])
    expect(area.startHere).toBe('docs/for-agents/query.md')

    const module = handoffForEntity(index, 'module:src/ranking/bm25.ts', config, { root })
    expect(module.target).toMatchObject({ type: 'module', id: 'module:src/ranking/bm25.ts' })
    expect(module.editRoots).toEqual(['src/ranking'])
    expect(module.explain?.editRoots).toEqual(['contained by area area:src/ranking'])
    expect(module.startHere).toBe('docs/ranking.md')

    const document = handoffForEntity(index, 'document:docs/ranking.md', config, { root })
    expect(document.target).toMatchObject({ type: 'document', id: 'document:docs/ranking.md', path: 'docs/ranking.md' })
    expect(document.startHere).toBe('docs/ranking.md')
    expect(document.editRoots).toEqual(['docs/ranking.md'])

    // The same answers by ownership id, by alias and by path.
    expect(handoffForEntity(index, 'fixture-query', config).target.id).toBe('fixture-query')
    expect(handoffForEntity(index, 'src/query', config).target.id).toBe('fixture-query')
    expect(() => handoffForEntity(index, 'nothing-here', config)).toThrow('Unknown entity')
  })

  it('reports where its checks came from', () => {
    const { root, config } = fixture()
    const index = buildDocBridgeIndex({ root, config, write: false }).index

    const owned = handoffForEntity(index, 'fixture-query', config, { root })
    expect(owned.checks).toEqual(['pnpm test --filter query'])
    expect(owned.metadata?.checksSource).toBe('ownership')
    expect(owned.explain?.checks).toEqual(['routing.options.ownership.fixture-query.checks'])

    const unowned = handoffForEntity(index, 'module:src/ranking/bm25.ts', config, { root })
    expect(unowned.metadata?.checksSource).toBe('default')
    expect(unowned.checks.length).toBeGreaterThan(0)

    const rootless = handoffForEntity(index, 'module:src/ranking/bm25.ts', config)
    expect(rootless.checks).toEqual([])
    expect(rootless.explain?.checks?.[0]).toContain('no project root')
  })

  it('explains startHere by the relation that produced it: covers beats mentions', () => {
    const { root, config } = fixture()
    // A document that declares coverage of the ranking area, next to the one that only mentions it.
    write(root, 'docs/ranking-owner.md', '---\ndocbridge:\n  covers:\n    - src/ranking\n---\n# Ranking owner\n\nOwns ranking.\n')
    write(root, 'docs/mention.md', '# Mention\n\nA passing mention of `src/ranking` and of `src/query`.\n')
    const index = buildDocBridgeIndex({ root, config, write: false }).index

    const area = handoffForEntity(index, 'area:src/ranking', config, { root })
    expect(area.startHere).toBe('docs/ranking-owner.md')
    expect(area.explain?.startHere).toEqual(['covers area:src/ranking'])
    expect(area.readBeforeEditing).toContain('docs/mention.md')
    expect(area.explain?.readBeforeEditing?.some((reason) => reason.includes('mentions area:src/ranking'))).toBe(true)
    expect(area.readBeforeEditing.at(-1)).toBe('AGENTS.md')
    expect(area.evidence?.[0]).toMatchObject({ source: 'derived', path: 'src/ranking' })
  })

  it('lists the areas a unit imports and is imported by, with the import that proves it', () => {
    const { root, config } = fixture()
    const index = buildDocBridgeIndex({ root, config, write: false }).index

    const query = handoffForEntity(index, 'area:src/query', config)
    expect(query.related).toEqual([{ id: 'area:src/ranking', path: 'src/ranking', direction: 'imports', strength: 1, evidence: ['src/query/search.ts → src/ranking/bm25.ts'] }])
    const ranking = handoffForEntity(index, 'area:src/ranking', config)
    expect(ranking.related?.[0]).toMatchObject({ id: 'area:src/query', direction: 'imported-by', strength: 1 })
  })

  it('keeps the query surface and the handoff schema byte-compatible', () => {
    const { root, config } = fixture()
    const index = buildDocBridgeIndex({ root, config, write: false }).index
    const viaQuery = runQuery(index, config, { kind: 'ownership', id: 'fixture-query', agent: true }, { root })
    expect(viaQuery).toEqual(handoffForEntity(index, 'fixture-query', config, { root }))

    // A handoff written before `related`, `explain`, `evidence` and `metadata` existed still parses.
    const legacy = {
      type: 'agent-handoff',
      source: '.doc-bridge/index.json',
      target: { type: 'package', id: 'auth' },
      startHere: 'docs/for-agents/auth.md',
      readBeforeEditing: ['AGENTS.md'],
      editRoots: ['src/auth'],
      checks: ['npm test'],
      notes: [],
    }
    expect(normalizeAgentHandoff(legacy)).toMatchObject({ ...legacy, schemaVersion: 1 })
    // And one built from an index without a projection still answers from the ownership record.
    const withoutProjection = { ...index, projection: undefined }
    expect(handoffForEntity(withoutProjection, 'fixture-query', config).target).toMatchObject({ type: 'package', id: 'fixture-query', path: 'src/query' })
  })
})

describe('the retriever speaks the ecosystem contract', () => {
  it('is accepted by the real hybrid retriever and formatter without an adapter', async () => {
    const { root, config } = fixture()
    const index = buildDocBridgeIndex({ root, config, write: false }).index
    const retriever = createDocBridgeRetriever(index, { limit: 4 })

    const rag = (await import('@agentskit/rag')) as unknown as { readonly createHybridRetriever: (base: Retriever, options?: { readonly topK?: number }) => Retriever }
    const core = (await import('@agentskit/core')) as unknown as {
      readonly formatRetrievedDocuments: (documents: readonly { readonly id: string; readonly content: string }[]) => string
    }
    type CoreRetriever = import('@agentskit/core').Retriever
    // Assignability against the real contract, checked by the compiler.
    const asCore: CoreRetriever = retriever
    expect(asCore).toBe(retriever)

    const hybrid = rag.createHybridRetriever(retriever, { topK: 2 })
    const documents = await hybrid.retrieve({ query: 'ranking bm25', messages: [] })
    expect(documents.length).toBeGreaterThan(0)
    expect(documents[0]?.metadata).toMatchObject({ kind: expect.any(String), path: expect.any(String), confidence: expect.any(String) })
    expect(core.formatRetrievedDocuments(documents)).toContain(documents[0]?.content.split('\n')[0] ?? '')

    // The original calling convention still works.
    expect(retriever.retrieve('ranking', { limit: 1 })).toHaveLength(1)
    const direct = retrieveDocBridgeDocuments(index, 'ranking')
    expect(direct[0]?.metadata?.explain).toBeDefined()
    expect(direct[0]?.metadata?.evidence).toBeDefined()
  })
})

describe('freshness and boundaries', () => {
  it('rejects the index after a configuration change that alters the projection', () => {
    const { root, config } = fixture()
    buildDocBridgeIndex({ root, config, write: true })
    expect(loadFreshDocBridgeIndex(root, config).projection).toBeDefined()
    expect(() => loadFreshDocBridgeIndex(root, { ...config, retrieval: { weights: { body: 7 } } })).toThrow(IndexStaleError)
  })

  it('reaches nothing under src/agents from search, query or the projection', () => {
    const roots = ['src/query/search.ts', 'src/query/query.ts', 'src/query/handoff.ts', 'src/retrieval/project.ts', 'src/retrieval/rank.ts']
    const seen = new Set<string>()
    const queue = roots.map((path) => resolve(repositoryRoot, path))
    while (queue.length) {
      const file = queue.pop() as string
      if (seen.has(file)) continue
      seen.add(file)
      const source = readFileSync(file, 'utf8')
      for (const match of source.matchAll(/^(?:import|export)[^\n]*?\sfrom\s+'(\.{1,2}\/[^']+)'/gm)) {
        queue.push(resolve(dirname(file), (match[1] as string).replace(/\.js$/, '.ts')))
      }
    }
    const reached = [...seen].map((file) => file.slice(repositoryRoot.length + 1))
    expect(reached.filter((file) => file.startsWith('src/agents/'))).toEqual([])
    expect(reached).toContain('src/retrieval/bm25.ts')
  })
})
