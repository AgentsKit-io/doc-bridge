import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { applyConfigDefaults } from '../src/config/defaults.js'
import { DocBridgeConfigV1Schema } from '../src/config/schema.js'
import { buildDocBridgeIndex } from '../src/index-builder/build-index.js'
import { knowledgeWhy, formatKnowledgeWhyText, KnowledgeWhyResponseV1Schema } from '../src/query/why.js'
import { handleMcpRequest } from '../src/mcp/server.js'
import { runCli } from '../src/cli/program.js'

const roots: string[] = []
afterEach(() => { vi.restoreAllMocks(); roots.splice(0).forEach(root => rmSync(root, { recursive: true, force: true })) })
const fixture = (enabled = true, memory = false) => {
  const root = mkdtempSync(join(tmpdir(), 'doc-bridge-query-'))
  roots.push(root)
  mkdirSync(join(root, 'docs', 'adr'), { recursive: true })
  mkdirSync(join(root, 'src'))
  writeFileSync(join(root, 'package.json'), '{"name":"doc-bridge-fixture"}')
  writeFileSync(join(root, 'src', 'store.ts'), 'export function Store() { return 1 }\n')
  writeFileSync(join(root, 'docs', 'adr', 'old.md'), '# Previous\n\nStatus: superseded\n')
  writeFileSync(join(root, 'docs', 'adr', 'store.md'), '---\nstatus: accepted\nsupersedes: old.md\n---\n# Use Store\n\nUse `Store` in `src/store.ts`.\n')
  writeFileSync(join(root, 'docs', 'concept.md'), '---\ntype: concept\naliases: [Store]\n---\n# Storage\n\nStores values.\n')
  writeFileSync(join(root, 'docs', 'guide.md'), '# Guide\n\nSee [store](../src/store.ts).\n')
  writeFileSync(join(root, 'docs', 'CHANGELOG.md'), '# Changelog\n\n## Unreleased\n\n- Update `src/store.ts`.\n')
  if (memory) {
    mkdirSync(join(root, '.agent-memory'))
    writeFileSync(join(root, '.agent-memory', 'store.md'), 'Use `Store` for storage.\n')
  }
  const raw = { schemaVersion: 1, corpus: { agent: { root: 'docs' } }, index: { knowledgeEntities: { enabled }, llmsTxt: { enabled: false }, capabilities: { enabled: false } } }
  const config = applyConfigDefaults(DocBridgeConfigV1Schema.parse(raw))
  const configPath = join(root, 'doc-bridge.config.json')
  writeFileSync(configPath, JSON.stringify(raw))
  const index = buildDocBridgeIndex({ root, config, write: true }).index
  return { root, config, configPath, index }
}
const call = (ctx: ReturnType<typeof fixture>, name: string, args: Record<string, unknown>, service = false) => {
  const response = handleMcpRequest({ ...ctx, loadIndex: () => ctx.index, ...(service ? { profile: 'service' as const } : {}) }, { method: 'tools/call', params: { name, arguments: args } }) as { content: { text: string }[] }
  return JSON.parse(response.content[0]!.text)
}

describe('knowledge rationale acceptance', () => {
  it('returns exact path/symbol/alias observations, evidence, supersession and citations', () => {
    const ctx = fixture()
    const result = knowledgeWhy(ctx.index, { target: 'src/store.ts' })
    expect(KnowledgeWhyResponseV1Schema.safeParse(result).success).toBe(true)
    expect(result.entities.map(entity => entity.kind)).toEqual(expect.arrayContaining(['decision', 'change']))
    const decision = result.entities.find(entity => entity.name === 'Use Store')!
    expect(decision.status).toBe('accepted')
    expect(decision.links.some(link => link.kind === 'supersedes')).toBe(true)
    expect(decision.evidence.some(item => item.kind === 'document-region' && item.regionHash.length === 64)).toBe(true)
    expect(result.documents.some(document => document.path === 'docs/guide.md' && document.contentHash.length === 64)).toBe(true)
    expect(result.documents.find(document => document.path === 'docs/guide.md')!.context).toContain('src/store.ts')
    for (const target of ['Store', 'Storage']) expect(knowledgeWhy(ctx.index, { target }).entities.some(entity => entity.kind === 'concept')).toBe(true)
    expect(knowledgeWhy(ctx.index, { target: 'Stores' }).entities).toEqual([])
    expect(knowledgeWhy(ctx.index, { target: 'Store', limit: 1 }).truncated).toBe(true)
    const budgeted = knowledgeWhy(ctx.index, { target: 'Store', budgetTokens: 1 })
    expect(budgeted.budget?.fits).toBe(false)
    expect(formatKnowledgeWhyText(budgeted)).toContain('fits: no')
    expect(budgeted.entities).toEqual(knowledgeWhy(ctx.index, { target: 'Store' }).entities)
    expect(KnowledgeWhyResponseV1Schema.safeParse(budgeted).success).toBe(true)
  })

  it('surfaces bounded sorted memory evidence through JSON/text and service tools', () => {
    const ctx = fixture()
    expect(knowledgeWhy(ctx.index, { target: 'Store' }).memoryRelations).toBeUndefined()
    const concept = ctx.index.knowledgeEntities!.entities.find(entity => entity.kind === 'concept')!
    const relations = ['path', 'alias', 'id'].map((kind, i) => ({ kind: 'memory-supports' as const, candidateId: `memory-${i}`, target: concept.id, evidence: { kind: kind as 'path' | 'alias' | 'id', value: 'Store', factHash: 'a'.repeat(64) } }))
    ctx.index.knowledgeEntities!.memoryRelations = [...relations].reverse()
    const result = knowledgeWhy(ctx.index, { target: concept.id, kind: 'concept' })
    expect(result.memoryRelations).toEqual(relations)
    expect(KnowledgeWhyResponseV1Schema.parse(result)).toEqual(result)
    expect(formatKnowledgeWhyText(result)).toContain('memory-supports memory-0')
    expect(formatKnowledgeWhyText(result)).toContain('"kind":"path"')
    expect(knowledgeWhy(ctx.index, { target: concept.id, kind: 'concept', limit: 1 })).toMatchObject({ memoryRelations: [relations[0]], truncated: true })
    expect(knowledgeWhy(ctx.index, { target: concept.id, kind: 'concept', budgetTokens: 1 }).memoryRelations).toEqual(relations)
    expect(call(ctx, 'knowledge.concept', { target: concept.id })).toEqual(result)
    expect(call(ctx, 'knowledge.concept', { target: concept.id }, true).memoryRelations).toEqual(relations)
    const text = handleMcpRequest({ ...ctx, loadIndex: () => ctx.index }, { method: 'tools/call', params: { name: 'knowledge.concept', arguments: { target: concept.id, format: 'text' } } }) as { content: { text: string }[] }
    expect(text.content[0]!.text).toContain('memory-supports memory-0')
    concept.evidence = [{ kind: 'commit', sha: 'a'.repeat(40) }]
    expect(call(ctx, 'knowledge.concept', { target: concept.id }, true).memoryRelations).toBeUndefined()
    expect(knowledgeWhy(ctx.index, { target: 'unknown' }).memoryRelations).toBeUndefined()
  })

  it('exercises CLI/MCP parity and typed argument rejection', async () => {
    const ctx = fixture(true, true)
    expect(knowledgeWhy(ctx.index, { target: 'Store' }).memoryRelations).toHaveLength(1)
    for (const [name, kind] of [['knowledge.decision', 'decision'], ['knowledge.concept', 'concept'], ['knowledge.whyChanged', 'change']] as const) {
      expect(call(ctx, name, { target: 'Store' })).toEqual(knowledgeWhy(ctx.index, { target: 'Store', kind }))
      expect(() => call(ctx, name, { target: 'Store', limit: 101 })).toThrow('invalid arguments')
      expect(() => call(ctx, name, { target: 'Store', arbitrary: true })).toThrow('invalid arguments')
    }
    let output = ''
    vi.spyOn(process.stdout, 'write').mockImplementation(chunk => { output += String(chunk); return true })
    expect(await runCli(['why', 'Store', '--json', '--config', ctx.configPath])).toBe(0)
    expect(JSON.parse(output)).toEqual(knowledgeWhy(ctx.index, { target: 'Store' }))
    output = ''
    expect(await runCli(['why', 'Store', '--config', ctx.configPath])).toBe(0)
    expect(output).toContain('memory-supports')
    expect(output).toContain('\"kind\":\"alias\"')
  })

  it('explains disabled entities and denies captured commit history in service', () => {
    const disabled = fixture(false)
    expect(knowledgeWhy(disabled.index, { target: 'Store' })).toMatchObject({ enabled: false, guidance: expect.stringContaining('index.knowledgeEntities.enabled') })
    expect(call(disabled, 'knowledge.decision', { target: 'Store' })).toMatchObject({ enabled: false })
    expect(call(disabled, 'knowledge.decision', { target: 'Store' }, true).coverage).toContainEqual(expect.objectContaining({ scope: 'git:first-parent', status: 'not-analyzed' }))
    const ctx = fixture()
    ctx.index.knowledgeEntities!.entities.push({ schemaVersion: 1, id: 'commit-observation', kind: 'change', name: 'Change Store', aliases: [], evidence: [{ kind: 'commit', sha: 'a'.repeat(40) }], links: [{ kind: 'affected-path', target: 'src/store.ts' }] })
    expect(knowledgeWhy(ctx.index, { target: 'src/store.ts' }).entities.some(entity => entity.id === 'commit-observation')).toBe(true)
    expect(call(ctx, 'knowledge.decision', { target: 'commit-observation' }, true).entities).toEqual([])
    const service = call(ctx, 'knowledge.whyChanged', { target: 'src/store.ts' }, true)
    expect(service.entities.some((entity: { id: string }) => entity.id === 'commit-observation')).toBe(false)
    expect(service.coverage).toContainEqual(expect.objectContaining({ scope: 'git:first-parent', status: 'not-analyzed' }))
  })
})
