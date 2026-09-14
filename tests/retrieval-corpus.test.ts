import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, describe, expect, it, vi } from 'vitest'

import { applyConfigDefaults } from '../src/config/defaults.js'
import { DocBridgeConfigV1Schema, type DocBridgeConfigV1 } from '../src/config/schema.js'
import { discoverRepository } from '../src/discovery/repository.js'
import { buildDocBridgeIndex } from '../src/index-builder/build-index.js'
import { sha256NormalizedV1 } from '../src/index-builder/content-hash.js'
import {
  CORPUS_PROJECTION_VERSION,
  indexConfigurationHash,
  isProjectedEntry,
  repositoryInputs,
} from '../src/index-builder/project-corpus.js'
import type { DocBridgeIndexV1 } from '../src/schemas/doc-bridge-index.js'
import { IndexStaleError, loadFreshDocBridgeIndex } from '../src/query/load-index.js'
import { searchIndex } from '../src/query/search.js'
import {
  SEARCH_LEXICON_VERSION,
  expandSearchToken,
  foldAccents,
  isSearchStopword,
  searchTokens,
  singularizeSearchToken,
} from '../src/query/text.js'
import { bm25Idf, bm25Search, buildBm25Index } from '../src/retrieval/bm25.js'
import { DEFAULT_SEARCH_WEIGHTS, resolveSearchWeights } from '../src/retrieval/weights.js'

const repositoryRoot = process.cwd()

// The repository-level tests scan and project this whole repository; the first one pays for it.
vi.setConfig({ testTimeout: 30_000 })

const repositoryConfig = (): DocBridgeConfigV1 =>
  applyConfigDefaults(
    DocBridgeConfigV1Schema.parse(
      // The repository dogfoods its own configuration, which is the corpus these tests measure.
      JSON.parse(readFileSync(join(repositoryRoot, 'doc-bridge.config.json'), 'utf8')) as unknown,
    ),
  )

/** The repository's own index, built once per file: a scan and a projection of everything here. */
let cachedRepositoryIndex: DocBridgeIndexV1 | undefined
const repositoryIndex = (): DocBridgeIndexV1 =>
  (cachedRepositoryIndex ??= buildDocBridgeIndex({ root: repositoryRoot, config: repositoryConfig(), write: false }).index)

const temporary: string[] = []

afterEach(() => {
  for (const directory of temporary) rmSync(directory, { recursive: true, force: true })
  temporary.length = 0
})

/** A minimal repository whose documentation is written in Portuguese. */
const portugueseFixture = (): { readonly root: string; readonly config: DocBridgeConfigV1 } => {
  const root = mkdtempSync(join(tmpdir(), 'doc-bridge-pt-'))
  temporary.push(root)
  mkdirSync(join(root, 'docs/for-agents'), { recursive: true })
  mkdirSync(join(root, 'docs/guias'), { recursive: true })
  mkdirSync(join(root, 'src'), { recursive: true })
  writeFileSync(join(root, 'package.json'), JSON.stringify({ name: 'projeto-pt', version: '0.0.0' }), 'utf8')
  writeFileSync(
    join(root, 'docs/for-agents/INDEX.md'),
    '# Índice para agentes\n\nComece aqui para encontrar o pacote responsável.\n',
    'utf8',
  )
  writeFileSync(
    join(root, 'docs/guias/reconciliacao.md'),
    '# Reconciliação\n\nComo a reconciliação compara a documentação com o código observado.\n',
    'utf8',
  )
  writeFileSync(
    join(root, 'docs/guias/implantacao.md'),
    '# Implantação\n\nComo publicar o pacote e rodar as verificações antes do lançamento.\n',
    'utf8',
  )
  writeFileSync(
    join(root, 'src/reconciliar.ts'),
    'export const compararDocumentacao = (): string => "ok"\n',
    'utf8',
  )
  const config = applyConfigDefaults(
    DocBridgeConfigV1Schema.parse({
      schemaVersion: 1,
      corpus: { agent: { root: 'docs/for-agents', index: 'docs/for-agents/INDEX.md' } },
    }),
  )
  return { root, config }
}

describe('field-weighted BM25', () => {
  const weights = { title: 4, body: 1 }

  it('gives a term present in every record almost no weight, and never a negative one', () => {
    expect(bm25Idf(1_000, 1_000)).toBeLessThan(0.01)
    expect(bm25Idf(1_000, 1_000)).toBeGreaterThanOrEqual(0)
    expect(bm25Idf(1_000, 1)).toBeGreaterThan(bm25Idf(1_000, 500))
    expect(bm25Idf(1_000, 500)).toBeGreaterThan(bm25Idf(1_000, 1_000))

    // "gate" is in both records and cannot separate them; "alpha" is in one and decides.
    const index = buildBm25Index(
      [
        { ref: 'a', fields: { title: 'alpha gate', body: 'gate' } },
        { ref: 'b', fields: { title: 'beta gate', body: 'gate' } },
      ],
      weights,
    )
    const [first, second] = bm25Search(index, ['gate'])
    expect(first?.score).toBe(second?.score)
    expect(bm25Search(index, ['alpha']).map((hit) => hit.ref)).toEqual(['a'])
    expect(bm25Search(index, ['alpha'])[0]?.score).toBeGreaterThan(first?.score ?? 0)
  })

  it('prefers the short title over the long body for the same term', () => {
    const index = buildBm25Index(
      [
        { ref: 'titled', fields: { title: 'reconciliation', body: 'unrelated prose' } },
        { ref: 'buried', fields: { title: 'unrelated heading', body: `reconciliation ${'filler '.repeat(200)}` } },
        { ref: 'other', fields: { title: 'nothing', body: 'nothing at all' } },
      ],
      weights,
    )
    expect(bm25Search(index, ['reconciliation']).map((hit) => hit.ref)).toEqual(['titled', 'buried'])
  })

  it('reports which field matched and orders ties by ref', () => {
    const index = buildBm25Index(
      [
        { ref: 'b', fields: { title: 'gate runner', body: 'x' } },
        { ref: 'a', fields: { title: 'gate runner', body: 'x' } },
        { ref: 'c', fields: { title: 'nothing', body: 'nothing' } },
      ],
      weights,
    )
    const hits = bm25Search(index, ['gate'])
    expect(hits.map((hit) => hit.ref)).toEqual(['a', 'b'])
    expect(hits[0]?.matched).toEqual({ title: ['gate'] })
    expect(bm25Search(index, ['gate'])).toEqual(hits)
  })

  it('ignores a field that carries no weight', () => {
    const index = buildBm25Index([{ ref: 'a', fields: { title: 'alpha', body: 'secret' } }], { title: 1 })
    expect(bm25Search(index, ['secret'])).toEqual([])
    expect(bm25Search(index, ['alpha']).map((hit) => hit.ref)).toEqual(['a'])
  })

  it('resolves configured weights over the defaults and ignores unknown fields', () => {
    expect(resolveSearchWeights()).toBe(DEFAULT_SEARCH_WEIGHTS)
    expect(resolveSearchWeights({ body: 9, nonsense: 5 })).toMatchObject({
      ...DEFAULT_SEARCH_WEIGHTS,
      body: 9,
    })
    expect(resolveSearchWeights({ nonsense: 5 })).not.toHaveProperty('nonsense')
  })
})

describe('search lexicon', () => {
  it('drops words that carry no signal, in both supported languages', () => {
    expect(searchTokens('and')).toEqual([])
    expect(searchTokens('and the of that')).toEqual([])
    expect(searchTokens('de para com que')).toEqual([])
    expect(isSearchStopword('não')).toBe(true)
    expect(isSearchStopword('reconciliation')).toBe(false)
  })

  it('expands an identifier and a path into their parts', () => {
    expect(expandSearchToken('reconcileKnowledge')).toEqual(['reconcileknowledge', 'reconcile', 'knowledge'])
    expect(expandSearchToken('src/mcp/server')).toEqual(['src/mcp/server', 'src', 'mcp', 'server'])
    expect(searchTokens('src/mcp/server.ts')).toContain('src/mcp/server')
  })

  it('folds accents and collapses plurals on both sides of the index', () => {
    expect(foldAccents('reconciliação')).toBe('reconciliacao')
    expect(searchTokens('Reconciliação')).toEqual(searchTokens('reconciliacao'))
    expect(singularizeSearchToken('schemas')).toBe('schema')
    expect(singularizeSearchToken('dependencies')).toBe('dependency')
    expect(singularizeSearchToken('classes')).toBe('class')
    expect(singularizeSearchToken('status')).toBe('status')
    expect(searchTokens('schema')).toEqual(searchTokens('schemas'))
  })

  it('indexes CJK text by character and bigram, since it carries no spaces', () => {
    expect(searchTokens('認証')).toContain('認証')
    expect(searchTokens('認証と認可の境界')).toContain('認証')
    expect(searchTokens('認')).toEqual(['認'])
  })
})

describe('repository corpus projection', () => {
  // Discovery parses every source file in the repository; that is the point of the comparison.
  it('projects every document the discovery snapshot observed', () => {
    const snapshot = discoverRepository({ root: repositoryRoot, config: repositoryConfig() })
    const index = repositoryIndex()
    const indexed = new Set(index.knowledge.map((entry) => entry.path))

    const documents = snapshot.entities.filter((entity) => entity.kind === 'document')
    const missing = documents.filter((entity) => !indexed.has(entity.path ?? ''))
    expect(documents.length).toBeGreaterThan(50)
    expect(missing.map((entity) => entity.path)).toEqual([])

    const modules = snapshot.entities.filter((entity) => entity.kind === 'module')
    expect(modules.filter((entity) => !indexed.has(entity.path ?? ''))).toEqual([])
  }, 30_000)

  it('gives every projected entry a content hash and tags, and a module its symbols', () => {
    const index = repositoryIndex()
    const entries = index.knowledge.filter(isProjectedEntry)
    expect(entries.length).toBeGreaterThan(100)
    expect(entries.every((entry) => /^[a-f0-9]{64}$/.test(entry.contentHash ?? ''))).toBe(true)
    expect(entries.every((entry) => (entry.tags ?? []).length > 0)).toBe(true)

    const reconcile = entries.find((entry) => entry.path === 'src/reconciliation/reconcile.ts')
    expect(reconcile?.symbols).toContain('reconcileKnowledge')
    expect(reconcile?.tags).toContain('module')

    const document = entries.find((entry) => entry.path === 'docs/bench/README.md')
    expect(document?.type).toBe('document')
    expect(document?.tags).toContain('human')
    // Body text lives once, in the projection; the legacy record carries none.
    expect(document?.body).toBeUndefined()
    expect(index.projection?.entries.find((entry) => entry.path === 'docs/bench/README.md')?.fields.body.length).toBeGreaterThan(0)
  })

  it('hashes the same inputs identically and notices a changed file', () => {
    const { root, config } = portugueseFixture()
    const first = repositoryInputs(root, config)
    expect(repositoryInputs(root, config)).toEqual(first)
    expect(first.projectionVersion).toBe(CORPUS_PROJECTION_VERSION)
    expect(first.fileCount).toBeGreaterThan(3)

    writeFileSync(join(root, 'docs/guias/reconciliacao.md'), '# Outro título\n\nOutro corpo.\n', 'utf8')
    expect(repositoryInputs(root, config).hash).not.toBe(first.hash)
  })

  it('fingerprints only the configuration the index is derived from', () => {
    const config = repositoryConfig()
    expect(indexConfigurationHash({ ...config, gates: { preset: 'strict' } })).toBe(indexConfigurationHash(config))
    expect(
      indexConfigurationHash({
        ...config,
        corpus: { ...config.corpus, agent: { ...config.corpus.agent, root: 'docs/elsewhere' } },
      }),
    ).not.toBe(indexConfigurationHash(config))
  })
})

describe('index metadata', () => {
  it('records the lexicon version, and changing it changes the artifact hash', () => {
    const { root, config } = portugueseFixture()
    const index = buildDocBridgeIndex({ root, config, write: false }).index
    expect(index.retrieval?.lexiconVersion).toBe(SEARCH_LEXICON_VERSION)
    expect(index.inputs?.hash).toMatch(/^[a-f0-9]{64}$/)

    // The hash is taken over exactly this payload, so a different lexicon version is a different
    // artifact rather than the same artifact ranked by different rules.
    const payload = {
      schemaVersion: 1,
      knowledge: index.knowledge,
      handoffs: index.handoffs,
      lookup: index.lookup,
      retrieval: index.retrieval,
      inputs: index.inputs,
      projection: index.projection?.contentHash,
    }
    expect(sha256NormalizedV1(payload)).toBe(index.contentHash)
    expect(
      sha256NormalizedV1({
        ...payload,
        retrieval: { ...index.retrieval, lexiconVersion: SEARCH_LEXICON_VERSION + 1 },
      }),
    ).not.toBe(index.contentHash)
  })

  it('stays schema-compatible when the projection is switched off', () => {
    const { root, config } = portugueseFixture()
    const plain = buildDocBridgeIndex({
      root,
      config: { ...config, retrieval: { corpus: { enabled: false } } },
      write: false,
    }).index
    expect(plain.inputs).toBeUndefined()
    expect(plain.knowledge.some(isProjectedEntry)).toBe(false)
    expect(plain.knowledge.length).toBeGreaterThan(0)
  })

  it('verifies freshness from the recorded inputs, and rejects a changed repository', () => {
    const { root, config } = portugueseFixture()
    buildDocBridgeIndex({ root, config })
    expect(loadFreshDocBridgeIndex(root, config).inputs?.fileCount).toBeGreaterThan(3)

    writeFileSync(join(root, 'docs/guias/implantacao.md'), '# Implantação\n\nOutro corpo.\n', 'utf8')
    expect(() => loadFreshDocBridgeIndex(root, config)).toThrow(IndexStaleError)
  })
})

describe('ranking', () => {
  it('returns nothing for a query made only of stopwords', () => {
    const index = repositoryIndex()
    expect(searchIndex(index, 'and')).toEqual([])
    expect(searchIndex(index, 'how to the of')).toEqual([])
  })

  it('resolves an exported symbol to the module that defines it', () => {
    const index = repositoryIndex()
    expect(searchIndex(index, 'reconcileKnowledge')[0]?.id).toBe('module:src/reconciliation/reconcile.ts')
    expect(searchIndex(index, 'buildDocBridgeIndex')[0]?.id).toBe('module:src/index-builder/build-index.ts')
  })

  it('resolves a repository path to that file or its area', () => {
    const index = repositoryIndex()
    expect(searchIndex(index, 'src/mcp/server.ts')[0]?.id).toBe('module:src/mcp/server.ts')
    expect(searchIndex(index, 'src/query/search.ts')[0]?.path).toBe('src/query/search.ts')
  })

  it('ranks a Portuguese query by the same rules as an English one', () => {
    const { root, config } = portugueseFixture()
    const index = buildDocBridgeIndex({ root, config, write: false }).index

    expect(searchIndex(index, 'reconciliação')[0]?.path).toBe('docs/guias/reconciliacao.md')
    // Written with accents, queried without them: the same record, ranked the same way.
    expect(searchIndex(index, 'reconciliacao')[0]?.path).toBe('docs/guias/reconciliacao.md')
    expect(searchIndex(index, 'compararDocumentacao')[0]?.path).toBe('src/reconciliar.ts')
    expect(searchIndex(index, 'como publicar o pacote')[0]?.path).toBe('docs/guias/implantacao.md')
    expect(searchIndex(index, 'de para com')).toEqual([])
  })

  it('lets configured weights change the ranking without a code change', () => {
    const { root, config } = portugueseFixture()
    const index = buildDocBridgeIndex({ root, config, write: false }).index
    const retuned = buildDocBridgeIndex({
      root,
      config: { ...config, retrieval: { weights: { body: 60, title: 0, id: 0, path: 0 } } },
      write: false,
    }).index

    expect(retuned.retrieval?.weights).toMatchObject({ body: 60, title: 0 })
    expect(retuned.contentHash).not.toBe(index.contentHash)
    expect(searchIndex(retuned, 'reconciliação').map((match) => match.score)).not.toEqual(
      searchIndex(index, 'reconciliação').map((match) => match.score),
    )
  })

  it('keeps the intent heuristics as a prior rather than a filter', () => {
    const { root, config } = portugueseFixture()
    const routed = {
      ...config,
      routing: {
        options: {
          intents: [{ id: 'encontrar-pacote', title: 'Encontrar o pacote responsável', paths: ['docs/for-agents/INDEX.md'] }],
          changes: [{ id: 'publicar', title: 'Publicar uma nova versão do pacote', startHere: 'docs/guias/implantacao.md' }],
        },
      },
    } satisfies DocBridgeConfigV1
    const index = buildDocBridgeIndex({ root, config: routed, write: false }).index

    expect(searchIndex(index, 'encontrar o pacote responsável')[0]).toMatchObject({
      type: 'intent',
      id: 'encontrar-pacote',
    })

    // With change intent the route leads.
    expect(searchIndex(index, 'editar a versão do pacote publicada')[0]).toMatchObject({
      type: 'change',
      id: 'publicar',
    })

    /*
     * Without it the route is demoted, not removed: the old rule dropped a change route from the
     * results entirely unless the query expressed change intent, which hid the right answer when
     * nothing else matched. These two queries match the same words; the second only adds a verb
     * that appears nowhere in the corpus, so the whole difference in score is the prior.
     */
    const demoted = searchIndex(index, 'versão publicada').find((match) => match.id === 'publicar')
    const favoured = searchIndex(index, 'atualizar versão publicada').find((match) => match.id === 'publicar')
    expect(demoted?.score).toBeGreaterThan(0)
    expect(favoured?.score).toBeGreaterThan((demoted?.score ?? 0) * 2)
  })

  it('spends no context on a query nothing answers', () => {
    const index = repositoryIndex()
    expect(searchIndex(index, 'zxqvnomatch987654321')).toEqual([])
  })
})
