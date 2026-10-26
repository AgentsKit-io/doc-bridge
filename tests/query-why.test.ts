import { describe, expect, it } from 'vitest'
import { bindServiceCapability } from '../src/execution/profile.js'
import type { DocBridgeIndexV1 } from '../src/schemas/doc-bridge-index.js'
import type { KnowledgeEntityV1, MemoryEntityRelationV1 } from '../src/schemas/knowledge-entity.js'
import {
  formatKnowledgeWhyText,
  KnowledgeWhyRequestSchema,
  KnowledgeWhyResponseV1Schema,
  knowledgeWhy,
} from '../src/query/why.js'

const HASH = 'a'.repeat(64)
const SHA = 'b'.repeat(40)
const region = (path: string) => ({ kind: 'document-region' as const, path, lineStart: 1, lineEnd: 2, regionHash: HASH })
const entity = (id: string, over: Partial<KnowledgeEntityV1> = {}): KnowledgeEntityV1 => ({
  schemaVersion: 1, id, kind: 'decision', name: `Name ${id}`, aliases: [], evidence: [region('docs/adr/a.md')], links: [], ...over,
})
const relation = (target: string, candidateId: string, value = 'v'): MemoryEntityRelationV1 => ({
  kind: 'memory-supports', candidateId, target, evidence: { kind: 'id', value, factHash: HASH },
})
const entry = (id: string, path: string, over: Record<string, unknown> = {}) => ({
  id, path, kind: 'code', contentHash: HASH, graph: { coveredBy: [], mentionedBy: [] }, ...over,
})

type Section = { entities: KnowledgeEntityV1[]; memoryRelations?: MemoryEntityRelationV1[]; coverage: unknown[] }
const makeIndex = (section: Section | undefined, entries: unknown[] = []): DocBridgeIndexV1 => ({
  contentHash: HASH,
  ...(section ? { knowledgeEntities: { schemaVersion: 1, ...section } } : {}),
  projection: { entries },
}) as unknown as DocBridgeIndexV1

const codeCoverage = { analyzer: 'entities', scope: 'docs', status: 'complete' as const }
const gitCoverage = { analyzer: 'entities', scope: 'git:first-parent', status: 'complete' as const }

describe('KnowledgeWhyRequestSchema', () => {
  it('applies the default limit and trims the target', () => {
    expect(KnowledgeWhyRequestSchema.parse({ target: '  x  ' })).toEqual({ target: 'x', limit: 20 })
  })

  it.each([
    ['empty target', { target: '' }],
    ['blank target', { target: '   ' }],
    ['oversized target', { target: 'x'.repeat(513) }],
    ['unknown key', { target: 'x', extra: 1 }],
    ['unknown kind', { target: 'x', kind: 'other' }],
    ['zero limit', { target: 'x', limit: 0 }],
    ['limit above 100', { target: 'x', limit: 101 }],
    ['zero budget', { target: 'x', budgetTokens: 0 }],
  ])('rejects %s', (_name, input) => {
    expect(KnowledgeWhyRequestSchema.safeParse(input).success).toBe(false)
  })
})

describe('knowledgeWhy', () => {
  it('throws on an invalid request', () => {
    expect(() => knowledgeWhy(makeIndex({ entities: [], coverage: [] }), { target: '' })).toThrow()
  })

  it('reports guidance when the index has no entity section', () => {
    const response = knowledgeWhy(makeIndex(undefined), { target: 'x' })
    expect(response).toMatchObject({ enabled: false, entities: [], documents: [], coverage: [], truncated: false, source: `index:${HASH}`, target: 'x' })
    expect(response.guidance).toContain('knowledgeEntities.enabled')
    expect(KnowledgeWhyResponseV1Schema.parse(response)).toEqual(response)
  })

  it('adds history coverage for a disabled section under the service flag', () => {
    const response = knowledgeWhy(makeIndex(undefined), { target: 'x' }, true)
    expect(response.coverage).toEqual([expect.objectContaining({ scope: 'git:first-parent', status: 'not-analyzed' })])
  })

  it('attaches a budget report to a disabled response', () => {
    const response = knowledgeWhy(makeIndex(undefined), { target: 'x', budgetTokens: 1000 })
    expect(response.budget?.budgetTokens).toBe(1000)
    expect(KnowledgeWhyResponseV1Schema.safeParse(response).success).toBe(true)
  })

  it('returns nothing for an enabled index with no entities', () => {
    const response = knowledgeWhy(makeIndex({ entities: [], coverage: [codeCoverage] }), { target: 'x' })
    expect(response).toMatchObject({ enabled: true, entities: [], documents: [], truncated: false, coverage: [codeCoverage] })
    expect(response.memoryRelations).toBeUndefined()
  })

  it('tolerates an index without a projection', () => {
    const index = { contentHash: HASH, knowledgeEntities: { schemaVersion: 1, entities: [entity('adr-1')], coverage: [] } } as unknown as DocBridgeIndexV1
    expect(knowledgeWhy(index, { target: 'adr-1' }).entities.map(e => e.id)).toEqual(['adr-1'])
  })

  it('matches by id, name and alias exactly, never fuzzily', () => {
    const index = makeIndex({ entities: [entity('adr-1', { name: 'Use Store', aliases: ['Storage'] }), entity('adr-2')], coverage: [] })
    for (const target of ['adr-1', 'Use Store', 'Storage']) {
      expect(knowledgeWhy(index, { target }).entities.map(e => e.id)).toEqual(['adr-1'])
    }
    expect(knowledgeWhy(index, { target: 'use store' }).entities).toEqual([])
    expect(knowledgeWhy(index, { target: 'adr' }).entities).toEqual([])
  })

  it('matches entities linked to a path, a symbol or an indexed entry', () => {
    const index = makeIndex({
      entities: [
        entity('by-path', { links: [{ kind: 'affected-path', target: 'src/store.ts' }] }),
        entity('by-symbol', { links: [{ kind: 'defines-symbol', target: 'other', symbol: 'Store' }] }),
        entity('by-entry', { links: [{ kind: 'affected-fact', target: 'fact-1' }] }),
        entity('ignored', { links: [{ kind: 'supersedes', target: 'src/store.ts' }] }),
      ],
      coverage: [],
    }, [entry('fact-1', 'src/store.ts', { symbols: ['Store'] })])
    expect(knowledgeWhy(index, { target: 'src/store.ts' }).entities.map(e => e.id)).toEqual(['by-entry', 'by-path'])
    expect(knowledgeWhy(index, { target: 'Store' }).entities.map(e => e.id)).toEqual(['by-entry', 'by-symbol'])
  })

  it('filters by kind and sorts by id', () => {
    const index = makeIndex({ entities: [entity('c', { kind: 'concept', aliases: ['t'] }), entity('b', { aliases: ['t'] }), entity('a', { kind: 'concept', aliases: ['t'] })], coverage: [] })
    expect(knowledgeWhy(index, { target: 't' }).entities.map(e => e.id)).toEqual(['a', 'b', 'c'])
    expect(knowledgeWhy(index, { target: 't', kind: 'concept' }).entities.map(e => e.id)).toEqual(['a', 'c'])
  })

  it('truncates to the limit and flags it', () => {
    const index = makeIndex({ entities: ['a', 'b', 'c'].map(id => entity(id, { aliases: ['t'] })), coverage: [] })
    const response = knowledgeWhy(index, { target: 't', limit: 2 })
    expect(response.entities.map(e => e.id)).toEqual(['a', 'b'])
    expect(response.truncated).toBe(true)
    expect(knowledgeWhy(index, { target: 't', limit: 3 }).truncated).toBe(false)
  })

  it('cites documents that cover or mention the target entry', () => {
    const index = makeIndex({ entities: [], coverage: [] }, [
      entry('code-1', 'src/store.ts', { graph: { coveredBy: ['doc-b'], mentionedBy: ['doc-a'] } }),
      entry('doc-a', 'docs/a.md', { kind: 'document' }),
      entry('doc-b', 'docs/b.md', { kind: 'document' }),
      entry('doc-c', 'docs/c.md', { kind: 'document' }),
    ])
    const response = knowledgeWhy(index, { target: 'src/store.ts' })
    expect(response.documents.map(d => d.id)).toEqual(['doc-a', 'doc-b'])
    expect(response.documents[0]).toEqual({ id: 'doc-a', path: 'docs/a.md', contentHash: HASH, context: 'Indexed citation via src/store.ts' })
    expect(knowledgeWhy(index, { target: 'src/store.ts', limit: 1 })).toMatchObject({ truncated: true })
    expect(knowledgeWhy(index, { target: 'unknown' }).documents).toEqual([])
  })

  it('returns sorted memory relations for matched entities only, limited', () => {
    const index = makeIndex({
      entities: [entity('e1', { aliases: ['t'] }), entity('e2')],
      memoryRelations: [relation('e2', 'z'), relation('e1', 'b', 'y'), relation('e1', 'b', 'x'), relation('e1', 'a')],
      coverage: [],
    })
    const response = knowledgeWhy(index, { target: 't' })
    expect(response.memoryRelations?.map(r => `${r.target}/${r.candidateId}/${r.evidence.value}`)).toEqual(['e1/a/v', 'e1/b/x', 'e1/b/y'])
    const limited = knowledgeWhy(index, { target: 't', limit: 1 })
    expect(limited.memoryRelations).toHaveLength(1)
    expect(limited.truncated).toBe(true)
  })

  it('drops commit-backed entities and history coverage in service mode', () => {
    const section = {
      entities: [entity('doc', { aliases: ['t'] }), entity('commit', { aliases: ['t'], evidence: [{ kind: 'commit', sha: SHA }] })],
      coverage: [codeCoverage, gitCoverage],
    }
    const local = knowledgeWhy(makeIndex(section), { target: 't' })
    expect(local.entities.map(e => e.id)).toEqual(['commit', 'doc'])
    expect(local.coverage).toEqual([codeCoverage, gitCoverage])

    for (const response of [knowledgeWhy(makeIndex(section), { target: 't' }, true), knowledgeWhy(bindServiceCapability(makeIndex(section)), { target: 't' })]) {
      expect(response.entities.map(e => e.id)).toEqual(['doc'])
      expect(response.coverage).toEqual([codeCoverage, expect.objectContaining({ scope: 'git:first-parent', status: 'not-analyzed' })])
    }
  })

  it('attaches a budget report and stays schema-valid', () => {
    const index = makeIndex({ entities: [entity('adr-1')], coverage: [codeCoverage] })
    const response = knowledgeWhy(index, { target: 'adr-1', budgetTokens: 5000 })
    expect(response.budget).toMatchObject({ budgetTokens: 5000, fits: true, tokenMethod: 'approximate' })
    expect(KnowledgeWhyResponseV1Schema.safeParse(response).success).toBe(true)
    expect(knowledgeWhy(index, { target: 'adr-1' }).budget).toBeUndefined()
  })
})

describe('formatKnowledgeWhyText', () => {
  it('prints only the heading for an empty enabled response', () => {
    const response = knowledgeWhy(makeIndex({ entities: [], coverage: [] }), { target: 'x' })
    expect(formatKnowledgeWhyText(response)).toBe('Why: x')
  })

  it('prints guidance for a disabled response', () => {
    const text = formatKnowledgeWhyText(knowledgeWhy(makeIndex(undefined), { target: 'x' }))
    expect(text.split('\n')[0]).toBe('Why: x')
    expect(text).toContain('knowledgeEntities.enabled')
  })

  it('prints entities, memory, citations, coverage, budget and truncation', () => {
    const index = makeIndex({
      entities: [entity('adr-1', { status: 'accepted', aliases: ['t'] }), entity('adr-2', { aliases: ['t'] })],
      memoryRelations: [relation('adr-1', 'cand')],
      coverage: [{ ...codeCoverage, reason: 'because' }],
    }, [
      entry('code-1', 'adr-1', { graph: { coveredBy: ['doc-a'], mentionedBy: [] } }),
      entry('doc-a', 'docs/a.md', { kind: 'document' }),
    ])
    const text = formatKnowledgeWhyText(knowledgeWhy(index, { target: 't', limit: 1, budgetTokens: 5000 }))
    expect(text).toContain('Budget: ')
    expect(text).toContain('decision adr-1: Name adr-1 [accepted]')
    expect(text).toContain('memory-supports cand → adr-1')
    expect(text).toContain('docs: complete — because')
    expect(text).toContain('Results truncated; refine the target or increase the limit.')
    expect(text).not.toContain('adr-2:')
  })

  it('prints a citation line for each cited document', () => {
    const index = makeIndex({ entities: [], coverage: [] }, [
      entry('code-1', 'src/a.ts', { graph: { coveredBy: ['doc-a'], mentionedBy: [] } }),
      entry('doc-a', 'docs/a.md', { kind: 'document' }),
    ])
    expect(formatKnowledgeWhyText(knowledgeWhy(index, { target: 'src/a.ts' }))).toContain('Cited by docs/a.md: ')
  })
})
