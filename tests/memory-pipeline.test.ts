import { mkdtempSync, mkdirSync, writeFileSync, rmSync, symlinkSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createHash } from 'node:crypto'
import { afterEach, describe, expect, it } from 'vitest'

import { classifyMemoryCandidates, draftMemoryPromotion, linkMemoryToEntities } from '../src/memory/pipeline.js'
import { ingestMemoryCandidates, ingestAgentMemory, ingestCursorRules } from '../src/memory/ingest.js'
import { DocBridgeConfigV1Schema } from '../src/config/schema.js'
import { KnowledgeEntitiesV1Schema, type KnowledgeEntitiesV1 } from '../src/schemas/knowledge-entity.js'
import { canCreateSymlinks } from './helpers/symlink-support.js'
import type { MemoryCandidateV1 } from '../src/schemas/memory-candidate.js'
import type { DocBridgeIndexV1 } from '../src/schemas/doc-bridge-index.js'

const candidate = (id: string, fact: string): MemoryCandidateV1 => ({
  schemaVersion: 1,
  id,
  source: 'manual',
  fact,
  suggestedType: 'project',
  confidence: 0.8,
  references: [],
})

const index: DocBridgeIndexV1 = {
  schemaVersion: 1,
  contentHash: 'a'.repeat(64),
  contentHashAlgo: 'sha256-normalized-v1',
  knowledge: [
    {
      id: 'sidecar',
      type: 'package',
      title: 'Sidecar',
      path: 'docs/for-agents/packages/sidecar.md',
      description: 'Package sidecar owns transport.',
    },
  ],
}

describe('memory pipeline', () => {
  it('uses configured rule directories without reading conventional rules', () => {
    const root = mkdtempSync(join(tmpdir(), 'doc-bridge-memory-config-'))
    try {
      mkdirSync(join(root, '.cursor/rules'), { recursive: true })
      mkdirSync(join(root, 'notes/rules'), { recursive: true })
      writeFileSync(join(root, '.cursor/rules/default.md'), '# Default\nIgnored')
      writeFileSync(join(root, 'notes/rules/configured.md'), '# Configured\nSelected')
      const candidates = ingestMemoryCandidates(root, { memory: { adapters: ['cursor-rules'], rulesDir: 'notes/rules' } })
      expect(candidates.map(candidate => candidate.rawPath)).toEqual(['notes/rules/configured.md'])
      expect(ingestCursorRules(root, 'notes/rules')).toEqual(candidates)
      expect(() => ingestMemoryCandidates(root, { memory: { adapters: ['cursor-rules'], rulesDir: '../outside' } })).toThrow('inside the repository')
    } finally { rmSync(root, { recursive: true, force: true }) }
  })

  it('classifies memory candidates into doc routes', () => {
    const result = classifyMemoryCandidates(
      [
        candidate('agent', 'package sidecar owns transport boundaries'),
        candidate('human', 'Add a user-facing guide for setup'),
        candidate('playbook', 'This is a reusable playbook pattern'),
        candidate('discard', 'scratch noise discard'),
      ],
      index,
    )

    expect(result.map((item) => item.route)).toEqual(['agent', 'human', 'playbook', 'discard'])
    expect(result[0]?.target).toBe('sidecar')
    expect(result[0]?.duplicateOf).toBe('docs/for-agents/packages/sidecar.md')
  })

  it('blocks promotion drafts when safety scan finds secrets', () => {
    const classifications = classifyMemoryCandidates(
      [candidate('secret', 'api_key=12345 should never be documented')],
      index,
    )
    const draft = draftMemoryPromotion(classifications)

    expect(draft.ok).toBe(false)
    expect(draft.findings[0]).toMatchObject({ kind: 'secret', candidateId: 'secret' })
    expect(draft.body).toContain('blocked')
  })

  it('blocks promotion drafts for bare token shapes from the shared secret list', () => {
    const token = 'xo' + 'xb-' + '1234567890-'.repeat(4)
    const draft = draftMemoryPromotion(classifyMemoryCandidates([candidate('slack', `the bot uses ${token} in staging`)], index))

    expect(draft.ok).toBe(false)
    expect(draft.findings[0]).toMatchObject({ kind: 'secret', candidateId: 'slack' })
  })
})

const roots: string[] = []
afterEach(() => roots.splice(0).forEach(root => rmSync(root, { recursive: true, force: true })))
const memoryRoot = () => {
  const root = mkdtempSync(join(tmpdir(), 'doc-bridge-memory-'))
  roots.push(root)
  return root
}
const section: KnowledgeEntitiesV1 = {
  schemaVersion: 1,
  entities: ['decision', 'concept', 'change'].map((kind, i) => ({
    schemaVersion: 1 as const, id: `entity-${i}`, kind: kind as 'decision' | 'concept' | 'change', name: `Entity ${i}`,
    aliases: i === 1 ? ['Exact Alias'] : [],
    evidence: [{ kind: 'document-region', path: `docs/entity-${i}.md`, lineStart: 1, lineEnd: 2, regionHash: 'a'.repeat(64) }], links: [],
  })), coverage: [],
}

describe('configured deterministic memory', () => {
  it('retains default bytes and honors ordered directories/adapters without duplicate sources', () => {
    const root = memoryRoot()
    for (const dir of ['.agent-memory', '.cursor/rules', 'notes/one', 'notes/two']) {
      mkdirSync(join(root, dir), { recursive: true })
      writeFileSync(join(root, dir, 'fact.md'), '# Note\n\nA useful fact.\n')
    }
    expect(JSON.stringify(ingestMemoryCandidates(root))).toBe(JSON.stringify([...ingestAgentMemory(root), ...ingestCursorRules(root)]))
    const config = DocBridgeConfigV1Schema.parse({ schemaVersion: 1, corpus: { agent: { root: 'docs' } }, intelligence: { memory: { ingestDir: ['notes/one', 'notes/two', 'notes/one'], adapters: ['playbook-memory'] } } })
    const items = ingestMemoryCandidates(root, config.intelligence)
    expect(items.map(item => item.rawPath)).toEqual(['notes/one/fact.md', 'notes/two/fact.md'])
    expect(items.every(item => item.source === 'agent-memory')).toBe(true)
    expect(ingestMemoryCandidates(root, { memory: { ingestDir: ['notes/one', 'notes/two'] } }).map(item => item.rawPath)).toEqual(['notes/one/fact.md', 'notes/two/fact.md', '.cursor/rules/fact.md'])
    expect(ingestMemoryCandidates(root, { memory: { ingestDir: 'notes/two', adapters: ['cursor-rules'] } })[0]).toMatchObject({ source: 'cursor', rawPath: '.cursor/rules/fact.md', confidence: 0.6 })
    expect(ingestMemoryCandidates(root, { memory: { enabled: false } })).toEqual([])
    expect(ingestMemoryCandidates(root, { memory: { adapters: [] } })).toEqual([])
  })

  it('preserves default serialized paths through contained directory symlinks', () => {
    if (!canCreateSymlinks()) return
    const root = memoryRoot()
    mkdirSync(join(root, 'notes'))
    writeFileSync(join(root, 'notes/fact.md'), '# Note\n\nA useful fact.\n')
    symlinkSync(join(root, 'notes'), join(root, '.agent-memory'), 'dir')
    expect(JSON.stringify(ingestMemoryCandidates(root))).toBe(JSON.stringify([{
      schemaVersion: 1, id: 'fact', source: 'agent-memory', rawPath: '.agent-memory/fact.md', fact: 'A useful fact.', suggestedType: 'project', confidence: 0.7, references: [],
    }]))
  })

  it('fails clearly for unsupported adapters, escapes, symlink escapes and oversized files', () => {
    const root = memoryRoot()
    for (const adapter of ['session-export', 'bootstrap-delta']) expect(() => DocBridgeConfigV1Schema.parse({ schemaVersion: 1, corpus: { agent: { root: 'docs' } }, intelligence: { memory: { adapters: [adapter] } } })).toThrow()
    for (const adapter of ['session-export', 'bootstrap-delta'] as const) expect(() => ingestMemoryCandidates(root, { memory: { adapters: [adapter as 'playbook-memory'] } })).toThrow(`Unsupported deterministic memory adapter: ${adapter}`)
    expect(() => ingestMemoryCandidates(root, { memory: { ingestDir: '../outside' } })).toThrow('inside the repository')
    if (canCreateSymlinks()) {
      const outside = memoryRoot()
      symlinkSync(outside, join(root, 'escape'), 'dir')
      expect(() => ingestMemoryCandidates(root, { memory: { ingestDir: 'escape' } })).toThrow('inside the repository')
    }
    mkdirSync(join(root, 'notes'))
    writeFileSync(join(root, 'notes/large.md'), 'x'.repeat(4 * 1024 * 1024 + 1))
    expect(() => ingestMemoryCandidates(root, { memory: { ingestDir: 'notes' } })).toThrow('byte limit')
  })

  it('links exact ids, aliases and paths for all entity kinds with sealed evidence', () => {
    const candidates = [candidate('id', 'Follow `entity-0`.'), candidate('alias', 'Use `Exact Alias`.'), { ...candidate('path', 'Related change.'), rawPath: 'notes/change.md', references: ['docs/entity-2.md'] }]
    const relations = linkMemoryToEntities(candidates, section)
    expect(relations.map(item => [item.candidateId, item.target, item.evidence.kind])).toEqual([['alias', 'entity-1', 'alias'], ['id', 'entity-0', 'id'], ['path', 'entity-2', 'path']])
    expect(relations.find(item => item.candidateId === 'path')!.evidence).toEqual({ kind: 'path', value: 'docs/entity-2.md', rawPath: 'notes/change.md', factHash: createHash('sha256').update('Related change.').digest('hex') })
    expect(KnowledgeEntitiesV1Schema.parse({ ...section, memoryRelations: relations }).memoryRelations).toEqual(relations)
    expect(KnowledgeEntitiesV1Schema.safeParse({ ...section, memoryRelations: [{ ...relations[0], target: 'missing' }] }).success).toBe(false)
    expect(classifyMemoryCandidates(candidates, { ...index, knowledgeEntities: section })[0]!.entityRelations).toHaveLength(1)
    expect(classifyMemoryCandidates(candidates, index)[0]).not.toHaveProperty('entityRelations')
  })

  it('parses malformed bracket-heavy facts without losing exact inline evidence', () => {
    for (const prefix of ['['.repeat(7900), '[](!'.repeat(1900)]) {
      const relations = linkMemoryToEntities([candidate('brackets', `${prefix} \`Exact Alias\``)], section)
      expect(relations).toHaveLength(1)
      expect(relations[0]).toMatchObject({ target: 'entity-1', evidence: { kind: 'alias', value: 'Exact Alias' } })
    }
    expect(linkMemoryToEntities([candidate('link', 'Follow [decision](docs/entity-0.md).')], section)[0]).toMatchObject({ target: 'entity-0', evidence: { kind: 'path', value: 'docs/entity-0.md' } })
  })

  it('fails rather than silently truncating relation limits', () => {
    expect(() => linkMemoryToEntities(Array.from({ length: 10_001 }, (_, i) => candidate(`memory-${i}`, 'entity-0')), section)).toThrow('relation limit')
  })

  it('omits ambiguous, fuzzy, discarded and unsafe matches', () => {
    const ambiguous = structuredClone(section)
    ambiguous.entities[0]!.aliases = ['Exact Alias']
    ambiguous.entities[0]!.evidence = ambiguous.entities[1]!.evidence
    expect(linkMemoryToEntities([
      candidate('ambiguous', 'Use `Exact Alias` and `docs/entity-1.md`.'),
      candidate('fuzzy', 'Use `exact alias` or `entity-01`.'),
      candidate('discard', 'discard `entity-0`'),
      candidate('unsafe', 'api_key=12345 for `entity-0`'),
    ], ambiguous)).toEqual([])
  })
})
