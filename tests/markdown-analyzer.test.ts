import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, describe, expect, it } from 'vitest'

import { parseDocumentationDeclarations } from '../src/discovery/documentation.js'
import { discoverRepository } from '../src/discovery/repository.js'
import {
  MARKDOWN_ANALYZER_VERSION,
  MARKDOWN_RELATION_CAP,
  analyzeMarkdownDocument,
  declaredAudience,
  parseMarkdownDocument,
} from '../src/discovery/markdown.js'
import { FUZZY_RESOLUTION_THRESHOLD, createFuzzyCandidateIndex, fuzzyLengthWindow, fuzzyMatchList, jaroWinkler, resolveFuzzyReference } from '../src/lib/fuzzy-match.js'
import type { KnowledgeEntity } from '../src/schemas/knowledge.js'

const temporary: string[] = []

afterEach(() => {
  for (const directory of temporary) rmSync(directory, { recursive: true, force: true })
  temporary.length = 0
})

const write = (root: string, path: string, content: string): void => {
  const target = join(root, path)
  mkdirSync(join(target, '..'), { recursive: true })
  writeFileSync(target, content, 'utf8')
}

/** Three documents and four modules: enough to tell a resolved reference from a guess. */
const fixture = (): string => {
  const root = mkdtempSync(join(tmpdir(), 'doc-bridge-markdown-'))
  temporary.push(root)
  writeFileSync(join(root, 'package.json'), JSON.stringify({ name: 'fixture', version: '0.0.0' }), 'utf8')

  write(root, 'src/reconcile.ts', 'export const reconcileKnowledge = (): number => 1\n')
  write(root, 'src/search.ts', 'export const searchIndex = (): number => 2\nexport const shared = (): number => 3\n')
  write(root, 'src/mirror.ts', 'export const shared = (): number => 4\n')
  write(root, 'src/index.ts', "export { reconcileKnowledge } from './reconcile.js'\nexport { searchIndex } from './search.js'\n")

  write(
    root,
    'docs/overview.md',
    [
      '---',
      'title: Overview',
      'audience: human',
      'owner: platform',
      'lifecycle: stable',
      'tier: tier-0',
      '---',
      '',
      '# Overview',
      '',
      'How the fixture fits together, in one paragraph of prose.',
      '',
      '## Reading order',
      '',
      'Start with [the guide](./guide.md), then read [reconciliation](reconcile.md).',
      '',
      'The entry point is `src/index.ts` and the ranker lives in `src/search.ts`.',
    ].join('\n'),
  )

  write(
    root,
    'docs/guide.md',
    [
      '# Guide',
      '',
      'Call `reconcileKnowledge` to compare documentation with code. It is not `shared`.',
      '',
      'The `fixture` package owns both.',
    ].join('\n'),
  )

  write(
    root,
    'docs/reconcile.md',
    ['# Reconciliation', '', 'Back to [the overview](./overview.md).'].join('\n'),
  )

  return root
}

const relationIds = (relations: readonly { readonly id: string }[]): string[] => relations.map((relation) => relation.id).sort()

describe('markdown analyzer', () => {
  it('turns links, paths and exported names into evidence-backed relations', () => {
    const snapshot = discoverRepository({ root: fixture() })
    const markdown = snapshot.relations.filter((relation) => ['links-to', 'mentions', 'mentions-symbol'].includes(relation.kind))

    expect(relationIds(markdown)).toEqual([
      'relation:document:docs/guide.md:mentions-symbol:module:src/reconcile.ts',
      'relation:document:docs/guide.md:mentions:package:fixture',
      'relation:document:docs/overview.md:links-to:document:docs/guide.md',
      'relation:document:docs/overview.md:links-to:document:docs/reconcile.md',
      'relation:document:docs/overview.md:mentions:module:src/index.ts',
      'relation:document:docs/overview.md:mentions:module:src/search.ts',
      'relation:document:docs/reconcile.md:links-to:document:docs/overview.md',
    ])

    const link = markdown.find((relation) => relation.id.endsWith('links-to:document:docs/guide.md'))
    expect(link).toMatchObject({ provenance: 'observed' })
    expect(link?.evidence[0]).toEqual({ source: 'documentation', path: 'docs/overview.md', lineStart: 15, lineEnd: 15 })

    const symbol = markdown.find((relation) => relation.kind === 'mentions-symbol')
    expect(symbol?.evidence[0]).toEqual({ source: 'documentation', path: 'docs/guide.md', lineStart: 3, lineEnd: 3 })
  })

  it('resolves a symbol exported by one module and reports an ambiguous one', () => {
    const snapshot = discoverRepository({ root: fixture() })

    // `reconcileKnowledge` is declared once and re-exported by the barrel: the definition wins.
    expect(snapshot.relations.filter((relation) => relation.kind === 'mentions-symbol').map((relation) => relation.to)).toEqual([
      'module:src/reconcile.ts',
    ])

    // `shared` is declared by two modules, so the reference resolves to neither.
    const fromDocuments = snapshot.relations.filter((relation) => relation.from.startsWith('document:'))
    expect(fromDocuments.some((relation) => relation.to === 'module:src/mirror.ts')).toBe(false)
    const note = snapshot.coverage.find((entry) => entry.scope.startsWith('mentions-symbol:docs/guide.md:shared'))
    expect(note).toMatchObject({ analyzer: 'markdown', status: 'partial' })
    expect(note?.reason).toContain('exported by 2 modules')
    expect(note?.evidence?.[0]).toMatchObject({ path: 'docs/guide.md', lineStart: 3 })
  })

  it('reads the document itself: title, headings, summary, word count and a content hash', () => {
    const snapshot = discoverRepository({ root: fixture() })
    const overview = snapshot.entities.find((entity) => entity.id === 'document:docs/overview.md')

    expect(overview?.metadata).toMatchObject({
      classification: 'human',
      title: 'Overview',
      summary: 'How the fixture fits together, in one paragraph of prose.',
      frontmatter: { audience: 'human', owner: 'platform', lifecycle: 'stable', tier: 'tier-0' },
    })
    expect((overview?.metadata?.headings as readonly { text: string }[]).map((heading) => heading.text)).toEqual([
      'Overview',
      'Reading order',
    ])
    expect(overview?.metadata?.wordCount).toBeGreaterThan(10)
    expect(overview?.evidence[0]?.contentHash).toMatch(/^[a-f0-9]{64}$/)
  })

  it('records the analyzer alongside the others', () => {
    const snapshot = discoverRepository({ root: fixture() })
    expect(snapshot.analyzerVersions.markdown).toBe(MARKDOWN_ANALYZER_VERSION)
    expect(snapshot.coverage.find((entry) => entry.scope === 'documentation-relations')).toMatchObject({
      analyzer: 'markdown',
      status: 'complete',
      analyzerVersion: MARKDOWN_ANALYZER_VERSION,
    })
  })

  it('produces the same snapshot twice', () => {
    const root = fixture()
    expect(discoverRepository({ root }).contentHash).toBe(discoverRepository({ root }).contentHash)
  })

  it('lets frontmatter override the path heuristic, and only when it names an audience', () => {
    expect(declaredAudience({ audience: 'Agent' })).toBe('agent')
    expect(declaredAudience({ type: 'archive' })).toBe('archive')
    // `type: package` is a document kind, not a reader; it must not become the audience.
    expect(declaredAudience({ type: 'package' })).toBeUndefined()
    expect(declaredAudience({})).toBeUndefined()

    const root = fixture()
    write(root, 'docs/internal.md', '---\naudience: agent\ntype: package\n---\n\n# Internal\n')
    const snapshot = discoverRepository({ root })
    const internal = snapshot.entities.find((entity) => entity.id === 'document:docs/internal.md')
    expect(internal?.metadata).toMatchObject({ classification: 'agent', frontmatter: { audience: 'agent', type: 'package' } })
  })

  it('skips a generated region when collecting mentions', () => {
    const root = fixture()
    write(
      root,
      'docs/generated.md',
      [
        '# Generated',
        '',
        'Hand-written prose mentions `src/reconcile.ts`.',
        '',
        '<!-- doc-bridge:generated hash=abc123 -->',
        '',
        'Generated prose mentions `src/search.ts` and [the guide](./guide.md).',
        '',
        '<!-- /doc-bridge:generated -->',
        '',
        'Hand-written prose again mentions `src/index.ts`.',
      ].join('\n'),
    )
    const snapshot = discoverRepository({ root })
    const generated = snapshot.entities.find((entity) => entity.id === 'document:docs/generated.md')
    expect(generated?.metadata?.generatedRegions).toEqual([{ lineStart: 5, lineEnd: 9, hash: 'abc123' }])

    const from = snapshot.relations.filter((relation) => relation.from === 'document:docs/generated.md').map((relation) => relation.to)
    expect(from).toContain('module:src/reconcile.ts')
    expect(from).toContain('module:src/index.ts')
    // Doc Bridge must not read its own output back in as evidence about the repository.
    expect(from).not.toContain('module:src/search.ts')
    expect(from).not.toContain('document:docs/guide.md')
  })

  it('caps relations per document and says so on the entity', () => {
    const root = fixture()
    const mentions = Array.from({ length: 8 }, (_, index) => `- \`src/generated-${index}.ts\``)
    for (let index = 0; index < 8; index += 1) write(root, `src/generated-${index}.ts`, `export const value${index} = ${index}\n`)
    write(root, 'docs/many.md', ['# Many', '', ...mentions].join('\n'))

    const snapshot = discoverRepository({ root })
    const document = snapshot.entities.find((entity) => entity.id === 'document:docs/many.md')
    expect(document?.metadata?.evidenceTruncated).toBeUndefined()

    const parsed = parseMarkdownDocument('docs/many.md', ['# Many', '', ...mentions].join('\n'))
    const capped = analyzeMarkdownDocument(parsed, 'document:docs/many.md', {
      documents: new Map(),
      modules: new Map(Array.from({ length: 8 }, (_, index) => [`src/generated-${index}.ts`, `module:src/generated-${index}.ts`])),
      packages: new Map(),
      symbols: new Map(),
      relationCap: 3,
    })
    expect(capped.relations).toHaveLength(3)
    expect(capped.truncated).toBe(true)
    expect(capped.notes.at(-1)?.reason).toContain('more than 3 entities')
  })

  it('marks a document whose references outgrew the cap', () => {
    const root = fixture()
    const targets = Array.from({ length: MARKDOWN_RELATION_CAP + 6 }, (_, index) => index)
    for (const index of targets) write(root, `src/many-${index}.ts`, `export const value${index} = ${index}\n`)
    write(root, 'docs/index-page.md', ['# Index', '', ...targets.map((index) => `- \`src/many-${index}.ts\``)].join('\n'))

    const snapshot = discoverRepository({ root })
    const document = snapshot.entities.find((entity) => entity.id === 'document:docs/index-page.md')
    expect(document?.metadata?.evidenceTruncated).toBe(true)
    expect(
      snapshot.relations.filter((relation) => relation.from === 'document:docs/index-page.md'),
    ).toHaveLength(MARKDOWN_RELATION_CAP)
    expect(snapshot.coverage.find((entry) => entry.scope === 'relations:docs/index-page.md')).toMatchObject({
      analyzer: 'markdown',
      status: 'partial',
    })
  }, 30_000)

  it('resolves a near-miss only when it is unambiguous', () => {
    const parsed = parseMarkdownDocument('docs/typo.md', '# Typo\n\nSee `src/reconcil.ts` for the comparison.\n')
    const unique = analyzeMarkdownDocument(parsed, 'document:docs/typo.md', {
      documents: new Map(),
      modules: new Map([['src/reconcile.ts', 'module:src/reconcile.ts']]),
      packages: new Map(),
      symbols: new Map(),
    })
    expect(unique.relations).toHaveLength(1)
    expect(unique.relations[0]).toMatchObject({
      kind: 'mentions',
      to: 'module:src/reconcile.ts',
      metadata: { confidence: 'fuzzy' },
    })

    // Two candidates that are both close enough: a guess would be worse than a gap.
    const ambiguous = analyzeMarkdownDocument(parsed, 'document:docs/typo.md', {
      documents: new Map(),
      modules: new Map([
        ['src/reconcile.ts', 'module:src/reconcile.ts'],
        ['src/reconciles.ts', 'module:src/reconciles.ts'],
      ]),
      packages: new Map(),
      symbols: new Map(),
    })
    expect(ambiguous.relations).toEqual([])
  })
})

describe('fuzzy matching', () => {
  it('matches the ecosystem implementation it mirrors', async () => {
    const core = (await import('@agentskit/core/fuzzy-match')) as {
      readonly jaroWinkler: typeof jaroWinkler
      readonly fuzzyMatchList: typeof fuzzyMatchList
    }
    const pairs: readonly [string, string][] = [
      ['reconcileKnowledge', 'reconcileKnowledge'],
      ['src/reconcil.ts', 'src/reconcile.ts'],
      ['searchIndex', 'searchIndexes'],
      ['alpha', 'omega'],
      ['  Mixed   Case  ', 'mixed case'],
      ['', 'anything'],
    ]
    for (const [left, right] of pairs) {
      expect(jaroWinkler(left, right)).toBeCloseTo(core.jaroWinkler(left, right), 12)
    }

    const candidates = ['src/reconcile.ts', 'src/reconciles.ts', 'src/search.ts']
    expect(fuzzyMatchList('src/reconcil.ts', candidates, { threshold: 0.9 })).toEqual(
      core.fuzzyMatchList('src/reconcil.ts', candidates, { threshold: 0.9 }),
    )
  })

  it('answers identically whether the universe is a list or an index', () => {
    /*
     * The index exists to skip candidates that cannot reach the threshold, and it is only allowed to
     * skip those: the length window and the shared-character bound are both upper bounds on Jaro, so
     * a candidate they drop could not have matched. This asserts that, over a universe large enough
     * for the filter to actually bite, at four thresholds, including the ties the prefilter reorders
     * buckets for.
     */
    let seed = 0x2f6e2b1
    const next = (limit: number): number => {
      seed = (seed * 1_103_515_245 + 12_345) & 0x7fffffff
      return seed % limit
    }
    const words = ['reconcile', 'knowledge', 'search', 'index', 'render', 'discovery', 'overlay', 'parity', 'doctor', 'bench', 'study', 'agent']
    const universe: string[] = []
    for (let count = 0; count < 600; count += 1) {
      const parts = 1 + next(3)
      const segments: string[] = []
      for (let part = 0; part < parts; part += 1) segments.push(words[next(words.length)] ?? 'x')
      universe.push(`src/${segments.join('-')}${next(4) === 0 ? '' : String(next(40))}.ts`)
    }
    /* Duplicates on purpose: identical candidates score identically, which is the tie case. */
    universe.push(...universe.slice(0, 40))
    /*
     * Whitespace, case and non-ASCII: the similarity compares normalized strings, so a bound built
     * on the raw ones would skip a padded candidate that matches.
     */
    universe.push('  src/RENDER   engine.ts  ', 'SRC/Render-Engine.ts', 'src/renderização.ts', 'src/rendering.ts', '   ', '')
    const index = createFuzzyCandidateIndex(universe)

    const queries = [
      ...universe.slice(0, 12).map((value) => value.replace('e', '')),
      'src/reconcil-knowledg.ts',
      'src/SEARCH-INDEX.ts',
      'nothing-remotely-alike',
      'src/a.ts',
      '  src/render engine.ts ',
      'SRC/RENDER-ENGINE.TS',
      'src/renderizaçao.ts',
      '',
    ]
    for (const threshold of [0.6, 0.8, 0.92, 0.97]) {
      for (const query of queries) {
        expect(fuzzyMatchList(query, index, { threshold, topK: 8 })).toEqual(
          fuzzyMatchList(query, universe, { threshold, topK: 8 }),
        )
      }
    }
  })

  it('bounds the lengths a candidate can have, and stops bounding below 0.6', () => {
    /* At 0.92 the window is 0.6x to 1.67x the query's length. */
    const window = fuzzyLengthWindow(10, 0.92)
    expect(window.min).toBeCloseTo(6, 9)
    expect(window.max).toBeCloseTo(16.6667, 4)
    /* At 0.6 the inequality constrains nothing: a low threshold has to scan the whole universe. */
    expect(fuzzyLengthWindow(10, 0.6)).toEqual({ min: 0, max: Number.POSITIVE_INFINITY })
  })

  it('requires a high score and a single candidate', () => {
    expect(FUZZY_RESOLUTION_THRESHOLD).toBe(0.92)
    expect(resolveFuzzyReference('src/reconcil.ts', ['src/reconcile.ts'])?.candidate).toBe('src/reconcile.ts')
    expect(resolveFuzzyReference('src/reconcil.ts', ['src/reconcile.ts', 'src/reconciles.ts'])).toBeUndefined()
    expect(resolveFuzzyReference('nothing-alike', ['src/reconcile.ts'])).toBeUndefined()
  })
})

describe('docbridge declarations on YAML', () => {
  const snapshot = (): { readonly entities: readonly KnowledgeEntity[] } => ({
    entities: [
      { id: 'package:fixture', kind: 'package', name: 'fixture', path: '.', provenance: 'observed', evidence: [] },
      { id: 'module:src/index.ts', kind: 'module', name: 'index.ts', path: 'src/index.ts', provenance: 'observed', evidence: [] },
    ],
  })

  it('accepts YAML the hand-written subset could not read', () => {
    const result = parseDocumentationDeclarations(
      {
        path: 'docs/yaml.md',
        content: [
          '---',
          'docbridge:',
          '  covers: ["package:fixture", \'module:src/index.ts\']',
          '  relations:',
          '    - { from: package:fixture, to: module:src/index.ts, kind: exposes, detection: static }',
          '---',
          '# Flow styles',
        ].join('\n'),
      },
      { snapshot: snapshot() },
    )

    expect(result.diagnostics).toEqual([])
    expect(result.relations).toHaveLength(3)
    expect(result.relations).toContainEqual(
      expect.objectContaining({ kind: 'exposes', from: 'package:fixture', to: 'module:src/index.ts' }),
    )
  })

  it('reports a precise field error for a schema-invalid block, and keeps what is valid', () => {
    const result = parseDocumentationDeclarations(
      {
        path: 'docs/schema.md',
        content: [
          '---',
          'docbridge:',
          '  covers:',
          '    - package:fixture',
          '  relations:',
          '    - from: package:fixture',
          '      to: module:src/index.ts',
          '      kind: exposes',
          '      detection: static',
          '      note: not a relation field',
          '---',
          '# Schema',
        ].join('\n'),
      },
      { snapshot: snapshot() },
    )

    const unknown = result.diagnostics.find((item) => item.code === 'DOCBRIDGE_FIELD_UNKNOWN')
    expect(unknown?.message).toContain('docbridge.relations.0')
    expect(unknown?.message).toContain('note')
    expect(unknown?.evidence).toMatchObject({ path: 'docs/schema.md', lineStart: 6 })
    // The declaration the author did get right is still recorded.
    expect(result.relations).toContainEqual(expect.objectContaining({ kind: 'exposes', to: 'module:src/index.ts' }))
    expect(result.relations).toContainEqual(expect.objectContaining({ kind: 'covers', to: 'package:fixture' }))
  })

  it('falls back to the line scanner when YAML cannot read the block', () => {
    // A duplicate key is a YAML error; the scanner is what can still name the field.
    const duplicate = parseDocumentationDeclarations(
      {
        path: 'docs/duplicate.md',
        content: [
          '---',
          'docbridge:',
          '  relations:',
          '    - from: package:fixture',
          '      from: package:fixture',
          '      to: module:src/index.ts',
          '      kind: exposes',
          '      detection: static',
          '---',
          '# Duplicate',
        ].join('\n'),
      },
      { snapshot: snapshot() },
    )
    expect(duplicate.diagnostics.map((item) => item.code)).toContain('DOCBRIDGE_FIELD_DUPLICATE')
    expect(duplicate.relations).toContainEqual(expect.objectContaining({ kind: 'exposes' }))
  })

  it('treats an empty block as empty, not malformed', () => {
    const result = parseDocumentationDeclarations(
      { path: 'docs/empty.md', content: ['---', 'docbridge:', '---', '# Empty'].join('\n') },
      { snapshot: snapshot() },
    )
    expect(result.diagnostics.map((item) => item.code)).toEqual(['DOCBRIDGE_CONTENT_MISSING'])
  })

  it('reports a scalar block as malformed rather than guessing', () => {
    const result = parseDocumentationDeclarations(
      { path: 'docs/scalar.md', content: ['---', 'docbridge: package:fixture', '---', '# Scalar'].join('\n') },
      { snapshot: snapshot() },
    )
    expect(result.diagnostics.map((item) => item.code)).toContain('DOCBRIDGE_BLOCK_MALFORMED')
    expect(result.relations).toEqual([])
  })
})
