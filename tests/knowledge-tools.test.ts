import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'

import { afterEach, describe, expect, it } from 'vitest'
import { z } from 'zod'

import { approximateCounter, compileBudget, type BudgetMessage } from '../src/budget/compile.js'
import { applyBudget, type BudgetedSection } from '../src/budget/sections.js'
import { runCli } from '../src/cli/program.js'
import { applyConfigDefaults } from '../src/config/defaults.js'
import { DocBridgeConfigV1Schema, type DocBridgeConfigV1 } from '../src/config/schema.js'
import { applyDocumentationDeclarations } from '../src/discovery/documentation.js'
import { discoverRepository } from '../src/discovery/repository.js'
import { findingsFromDiagnostics, SEVERITY_ORDER, type Finding } from '../src/findings/report.js'
import { buildDocBridgeIndex } from '../src/index-builder/build-index.js'
import { sha256NormalizedV1 } from '../src/index-builder/content-hash.js'
import { budgetedHandoff, knowledgeLookup, knowledgeSearch, formatKnowledgeLookupText, formatKnowledgeSearchText } from '../src/mcp/knowledge.js'
import { handleMcpRequest, MCP_TOOLS } from '../src/mcp/server.js'
import { runQuery } from '../src/query/query.js'
import { searchIndex } from '../src/query/search.js'
import { reconcileKnowledge } from '../src/reconciliation/reconcile.js'
import { formatRetrievedDocuments, type RetrievedDocument } from '../src/retriever/doc-bridge-retriever.js'
import { AgentHandoffV1Schema } from '../src/schemas/agent-handoff.js'
import { BUDGET_SECTION_ORDER, BudgetReportSchema } from '../src/schemas/budget.js'
import type { DocBridgeIndexV1 } from '../src/schemas/doc-bridge-index.js'
import type { ReconciliationReportV1 } from '../src/schemas/knowledge.js'
import { runWorkflow } from '../src/workflow/engine.js'

const temporary: string[] = []
const originalCwd = process.cwd()

afterEach(() => {
  process.chdir(originalCwd)
  for (const directory of temporary) rmSync(directory, { recursive: true, force: true })
  temporary.length = 0
})

const write = (root: string, path: string, content: string): void => {
  const target = join(root, path)
  mkdirSync(dirname(target), { recursive: true })
  writeFileSync(target, content, 'utf8')
}

const captureStdout = (fn: () => number | undefined): { code: number | undefined; out: string } => {
  const original = process.stdout.write
  let out = ''
  process.stdout.write = ((chunk: string | Uint8Array) => {
    out += String(chunk)
    return true
  }) as typeof process.stdout.write
  try {
    return { code: fn(), out }
  } finally {
    process.stdout.write = original
  }
}

const rawConfig = {
  schemaVersion: 1,
  corpus: { agent: { root: 'docs/for-agents', index: 'docs/for-agents/INDEX.md' } },
  routing: {
    options: {
      ownership: {
        'fixture-query': { path: 'src/query', purpose: 'Query layer', checks: ['pnpm test --filter query'], agentDoc: 'docs/for-agents/query.md' },
      },
    },
  },
}

/**
 * One package with two areas: an ownership record on `src/query` with a sidecar that covers it,
 * a guide that mentions the ranking module, a hub that links to the guide, and an import from
 * one area into the other so the handoff has a `related` row and the lookup a neighbourhood.
 */
const fixture = (): { readonly root: string; readonly config: DocBridgeConfigV1 } => {
  const root = mkdtempSync(join(tmpdir(), 'doc-bridge-knowledge-'))
  temporary.push(root)
  writeFileSync(join(root, 'package.json'), JSON.stringify({ name: 'fixture', version: '0.0.0', scripts: { test: 'vitest run' } }), 'utf8')
  write(root, 'doc-bridge.config.json', JSON.stringify(rawConfig, null, 2))
  write(root, 'src/query/search.ts', "import { rank } from '../ranking/bm25.js'\nexport const searchIndex = (): number => rank()\n")
  write(root, 'src/query/parse.ts', 'export const parseQuery = (): number => 1\n')
  write(root, 'src/ranking/bm25.ts', 'export const rank = (): number => 2\n')
  write(root, 'docs/for-agents/INDEX.md', '# Agent index\n\nStart with [query](./query.md) and the [ranking guide](../ranking.md).\n')
  write(
    root,
    'docs/for-agents/query.md',
    '---\nid: fixture-query\neditRoot: src/query\n---\n# Query\n\nDeterministic search over the index. Exports `searchIndex`. The query layer parses a term, ranks the projection and returns matches with evidence; it never reads the repository itself, which is why every result carries the content hash the projection recorded.\n',
  )
  write(root, 'docs/ranking.md', '# Ranking\n\nScores come from `src/ranking/bm25.ts`, which exports `rank`. The ranking is BM25 over the projected fields with graph proximity on top.\n')
  write(root, 'docs/mention.md', '# Mention\n\nA passing mention of `src/query` and nothing more.\n')
  write(root, 'AGENTS.md', '# Agents\n\nRead the agent index first.\n')
  return { root, config: applyConfigDefaults(DocBridgeConfigV1Schema.parse(rawConfig)) }
}

/** Run the collect, normalize and reconcile stages so a reconciliation report exists for the lookup. */
const reconcile = (root: string, config: DocBridgeConfigV1): ReconciliationReportV1 => {
  const observed = discoverRepository({ root, config })
  const declared = applyDocumentationDeclarations(observed, [
    { path: 'docs/for-agents/query.md', content: '---\nid: fixture-query\neditRoot: src/query\n---\n# Query\n' },
    { path: 'docs/ranking.md', content: '# Ranking\n\nScores come from `src/ranking/bm25.ts`.\n' },
  ]).snapshot
  const report = reconcileKnowledge(observed, declared, { scope: 'area' })
  const stage = (name: 'collect' | 'normalize' | 'reconcile', handler: (input: unknown) => unknown) =>
    runWorkflow({ root, sourceRevision: observed.sourceRevision, configurationHash: sha256NormalizedV1(config), stage: name, handlers: { [name]: ({ input }) => handler(input) } })
  stage('collect', () => observed)
  stage('normalize', (input) => input)
  stage('reconcile', () => report)
  return report
}

type Ctx = { root: string; config: DocBridgeConfigV1; loadIndex: () => DocBridgeIndexV1 }

const call = (ctx: Ctx, name: string, args: Record<string, unknown> = {}): unknown => {
  const response = handleMcpRequest(ctx, { method: 'tools/call', params: { name, arguments: args } }) as { content: { text: string }[] }
  return JSON.parse(response.content[0]?.text ?? '{}') as unknown
}

const callText = (ctx: Ctx, name: string, args: Record<string, unknown> = {}): string =>
  (handleMcpRequest(ctx, { method: 'tools/call', params: { name, arguments: args } }) as { content: { text: string }[] }).content[0]?.text ?? ''

const prepared = (): { root: string; config: DocBridgeConfigV1; index: DocBridgeIndexV1; ctx: Ctx; report: ReconciliationReportV1 } => {
  const { root, config } = fixture()
  const index = buildDocBridgeIndex({ root, config, write: true }).index
  const report = reconcile(root, config)
  return { root, config, index, ctx: { root, config, loadIndex: () => index }, report }
}

describe('knowledge.lookup', () => {
  it('returns entity, neighbours by relation kind, covering and mentioning documents, handoff, open diagnostics and evidence in one response', () => {
    const { ctx, report } = prepared()
    const response = call(ctx, 'knowledge.lookup', { id: 'area:src/query' }) as ReturnType<typeof knowledgeLookup>

    expect(response.type).toBe('knowledge-lookup')
    expect(response.entity).toMatchObject({ id: 'area:src/query', kind: 'area', path: 'src/query', ownershipId: 'fixture-query', confidence: 'observed' })
    expect(response.entity.contentHash).toMatch(/^[a-f0-9]{64}$/)

    // Neighbours are grouped by the relation that reached them, hierarchy included.
    expect(Object.keys(response.neighbours)).toEqual([...Object.keys(response.neighbours)].sort())
    expect(response.neighbours.contains?.map((item) => item.id)).toEqual(expect.arrayContaining(['module:src/query/search.ts', 'module:src/query/parse.ts']))
    expect(response.neighbours.covers?.[0]).toMatchObject({ id: 'document:docs/for-agents/query.md', direction: 'inbound', distance: 1 })
    for (const list of Object.values(response.neighbours)) for (const item of list) expect(item.distance).toBe(1)

    expect(response.documents.covering.map((item) => item.path)).toEqual(['docs/for-agents/query.md'])
    expect(response.documents.mentioning.map((item) => item.path)).toEqual(['docs/mention.md'])

    // The handoff is the one handoff.resolve returns for the same entity.
    expect(response.handoff).toEqual(call(ctx, 'handoff.resolve', { id: 'fixture-query' }))
    expect(response.handoff.related?.some((row) => row.id === 'area:src/ranking' && row.direction === 'imports')).toBe(true)

    // Diagnostics come from the latest reconciliation report and only the open ones that name the entity.
    expect(response.diagnostics.reportHash).toBe(report.contentHash)
    expect(response.diagnostics.open.length).toBeGreaterThan(0)
    for (const diagnostic of response.diagnostics.open) {
      expect(diagnostic.status).not.toBe('confirmed')
      expect(diagnostic.entityIds?.includes('area:src/query') || diagnostic.evidence.some((item) => item.path === 'src/query')).toBe(true)
    }

    // Evidence: the entity itself, then the documents about it, each with the opening of its body.
    expect(response.evidence[0]).toMatchObject({ source: 'derived', path: 'src/query', contentHash: response.entity.contentHash, context: 'area area:src/query' })
    expect(response.evidence.map((item) => item.path)).toEqual(['src/query', 'docs/for-agents/query.md', 'docs/mention.md'])
    expect(response.evidence[1]?.excerpt).toContain('Deterministic search over the index')
    expect(response.evidence[1]?.excerpt?.length).toBeLessThanOrEqual(241)
    expect(response.budget).toBeUndefined()
  })

  it('resolves by path, by ownership id and by alias, and walks further with depth', () => {
    const { ctx, index, config, root } = prepared()
    const byPath = knowledgeLookup(index, config, { path: 'src/query/' }, { root })
    const byOwnership = knowledgeLookup(index, config, { id: 'fixture-query' }, { root })
    expect(byPath.entity.id).toBe('area:src/query')
    expect(byOwnership.entity.id).toBe('area:src/query')

    const deep = call(ctx, 'knowledge.lookup', { id: 'module:src/query/search.ts', depth: 2 }) as ReturnType<typeof knowledgeLookup>
    const distances = Object.values(deep.neighbours).flat().map((item) => item.distance)
    expect(deep.depth).toBe(2)
    expect(Math.max(...distances)).toBe(2)
    // The ranking module is one import away; the guide that mentions it is reached through it.
    expect(deep.neighbours.imports?.[0]).toMatchObject({ id: 'module:src/ranking/bm25.ts', direction: 'outbound', distance: 1 })
    expect(Object.values(deep.neighbours).flat().find((item) => item.id === 'document:docs/ranking.md')).toMatchObject({ distance: 2, via: 'module:src/ranking/bm25.ts' })

    expect(() => call(ctx, 'knowledge.lookup', {})).toThrow('knowledge.lookup requires id or path')
    expect(() => call(ctx, 'knowledge.lookup', { id: 'nope' })).toThrow('Unknown entity "nope"')
    expect(() => call(ctx, 'knowledge.lookup', { id: 'x', depth: 9 })).toThrow('invalid arguments')
  })

  it('fits a small budget and reports tokens.total, fits and the dropped sections in the declared order', () => {
    const { ctx } = prepared()
    const unbounded = call(ctx, 'knowledge.lookup', { id: 'area:src/query' }) as ReturnType<typeof knowledgeLookup>
    // A budget that keeps the core and the summaries and nothing else: small, but not impossible.
    const probe = BudgetReportSchema.parse((call(ctx, 'knowledge.lookup', { id: 'area:src/query', budgetTokens: 1 }) as ReturnType<typeof knowledgeLookup>).budget)
    const budgetTokens = probe.tokens.core + (probe.tokens.sections.summaries ?? 0) + 4
    const response = call(ctx, 'knowledge.lookup', { id: 'area:src/query', budgetTokens }) as ReturnType<typeof knowledgeLookup>
    const budget = BudgetReportSchema.parse(response.budget)

    expect(Object.values(probe.tokens.sections).reduce((total, value) => total + value, probe.tokens.core)).toBeGreaterThan(budgetTokens)
    expect(budget.fits).toBe(true)
    expect(budget.tokens.total).toBeLessThanOrEqual(budgetTokens)
    expect(budget.tokens.budget).toBe(budgetTokens)
    expect(budget.kept).toEqual(['summaries'])
    expect(budget.tokenMethod).toBe('approximate')
    expect(budget.order).toEqual([...BUDGET_SECTION_ORDER])
    expect(budget.dropped.length).toBeGreaterThan(0)
    expect(budget.dropped).toEqual(BUDGET_SECTION_ORDER.slice(0, budget.dropped.length))
    expect([...budget.dropped, ...budget.kept]).toEqual(Object.keys(budget.tokens.sections))

    // What was dropped is gone from the payload; what was kept is unchanged.
    if (budget.dropped.includes('evidenceExcerpts')) expect(response.evidence.every((item) => item.excerpt === undefined)).toBe(true)
    if (budget.dropped.includes('related')) expect(response.handoff.related).toBeUndefined()
    if (budget.dropped.includes('neighbours')) expect(response.neighbours).toEqual({})
    if (budget.kept.includes('summaries')) expect(response.entity.summary).toBe(unbounded.entity.summary)

    // The same budget over the same payload is the same report.
    expect(call(ctx, 'knowledge.lookup', { id: 'area:src/query', budgetTokens })).toEqual(response)
  })

  it('never removes evidence paths or hashes before lower-priority sections, whatever the budget', () => {
    const { index, config, root } = prepared()
    const unbounded = knowledgeLookup(index, config, { id: 'area:src/query' }, { root })
    const identity = (items: typeof unbounded.evidence) => items.map(({ excerpt: _excerpt, ...item }) => item)
    let previousDropped = 0
    for (const budgetTokens of [4_000, 1_500, 900, 700, 500, 300, 120, 40]) {
      const response = knowledgeLookup(index, config, { id: 'area:src/query', budgetTokens }, { root })
      const budget = BudgetReportSchema.parse(response.budget)
      // Dropping is a prefix of the declared order: excerpts go before related, related before neighbours, neighbours before summaries.
      expect(budget.dropped).toEqual(BUDGET_SECTION_ORDER.slice(0, budget.dropped.length))
      expect(budget.dropped.length).toBeGreaterThanOrEqual(previousDropped)
      previousDropped = budget.dropped.length
      // Evidence identity, the handoff fields an agent acts on and the diagnostics survive every budget.
      expect(identity(response.evidence)).toEqual(identity(unbounded.evidence))
      expect(response.handoff.startHere).toBe(unbounded.handoff.startHere)
      expect(response.handoff.editRoots).toEqual(unbounded.handoff.editRoots)
      expect(response.handoff.checks).toEqual(unbounded.handoff.checks)
      expect(response.diagnostics).toEqual(unbounded.diagnostics)
      expect(response.entity.contentHash).toBe(unbounded.entity.contentHash)
      // `fits` is honest: false exactly when the core alone exceeds the budget.
      expect(budget.fits).toBe(budget.tokens.total <= budgetTokens)
      if (!budget.fits) expect(budget.dropped).toEqual([...BUDGET_SECTION_ORDER].filter((name) => name in budget.tokens.sections))
    }
  })

  it('renders the same payload as prose through formatRetrievedDocuments', () => {
    const { ctx } = prepared()
    const text = callText(ctx, 'knowledge.lookup', { id: 'area:src/query', budgetTokens: 700, format: 'text' })
    expect(text).toContain('Budget: ')
    expect(text).toContain('[1]\nSource: src/query\n')
    expect(text).toContain('startHere: docs/for-agents/query.md')
    expect(text).toContain('docs/for-agents/query.md @')
    const response = call(ctx, 'knowledge.lookup', { id: 'area:src/query', budgetTokens: 700 }) as ReturnType<typeof knowledgeLookup>
    expect(text).toBe(formatKnowledgeLookupText(response))
  })
})

describe('knowledge.search', () => {
  it('accepts kinds, limit, explain and budgetTokens', () => {
    const { ctx } = prepared()
    const plain = call(ctx, 'knowledge.search', { query: 'ranking' }) as ReturnType<typeof knowledgeSearch>
    expect(plain.type).toBe('knowledge-search')
    expect(plain.count).toBeGreaterThan(1)
    expect(plain.results[0]?.explain).toBeUndefined()

    const modules = call(ctx, 'knowledge.search', { query: 'ranking', kinds: ['module'], limit: 1, explain: true }) as ReturnType<typeof knowledgeSearch>
    expect(modules.kinds).toEqual(['module'])
    expect(modules.results).toHaveLength(1)
    expect(modules.results[0]).toMatchObject({ kind: 'module', entityId: 'module:src/ranking/bm25.ts', explain: expect.objectContaining({ components: expect.any(Object) }) })

    const budgeted = call(ctx, 'knowledge.search', { query: 'ranking', budgetTokens: 60 }) as ReturnType<typeof knowledgeSearch>
    const budget = BudgetReportSchema.parse(budgeted.budget)
    expect(budget.dropped).toEqual(BUDGET_SECTION_ORDER.filter((name) => name in budget.tokens.sections))
    expect(budgeted.results.every((result) => result.excerpt === undefined && result.summary === undefined)).toBe(true)
    // Search has no related areas and no neighbourhood: those sections are absent, never reported dropped.
    expect(budget.tokens.sections.related).toBeUndefined()
    expect(budget.tokens.sections.neighbours).toBeUndefined()

    expect(() => call(ctx, 'knowledge.search', { query: 'x', kinds: ['nope'] })).toThrow('invalid arguments')
    expect(() => call(ctx, 'knowledge.search', { query: 'x', budgetTokens: 0 })).toThrow('invalid arguments')
    expect(callText(ctx, 'knowledge.search', { query: 'ranking', format: 'text' })).toBe(formatKnowledgeSearchText(call(ctx, 'knowledge.search', { query: 'ranking' }) as ReturnType<typeof knowledgeSearch>))
  })

  it('returns the results the CLI prints for the same query and index', () => {
    const { root, ctx, index } = prepared()
    process.chdir(root)
    const cli = captureStdout(() => runCli(['search', 'ranking', 'bm25', '--json']))
    expect(cli.code).toBe(0)
    const printed = JSON.parse(cli.out) as { term: string; count: number; matches: unknown[] }
    const mcp = call(ctx, 'knowledge.search', { query: 'ranking bm25' }) as ReturnType<typeof knowledgeSearch>

    expect(mcp.count).toBe(printed.count)
    expect(mcp.results.map(({ title: _title, excerpt: _excerpt, ...match }) => match)).toEqual(printed.matches)
    expect(printed.matches).toEqual(searchIndex(index, 'ranking bm25', 20))

    const explained = captureStdout(() => runCli(['search', 'ranking', 'bm25', '--json', '--explain']))
    const mcpExplained = call(ctx, 'knowledge.search', { query: 'ranking bm25', explain: true }) as ReturnType<typeof knowledgeSearch>
    expect(mcpExplained.results.map(({ title: _title, excerpt: _excerpt, ...match }) => match)).toEqual((JSON.parse(explained.out) as { matches: unknown[] }).matches)
  })
})

describe('existing MCP tools', () => {
  it('keeps every pre-existing tool name resolving with a compatible payload', () => {
    const { ctx, index, config, root } = prepared()
    const before = ['handoff.resolve', 'doc.search', 'doc.get', 'gate.status', 'retriever.query', 'memory.classify', 'memory.promoteDraft', 'registry.topology', 'docbridge.snapshot', 'docbridge.report', 'docbridge.diagnostics', 'docbridge.relations', 'docbridge.run', 'docbridge.proposals']
    const names = MCP_TOOLS.map((tool) => tool.name)
    for (const name of before) expect(names).toContain(name)
    expect(names.slice(-2)).toEqual(['knowledge.search', 'knowledge.lookup'])

    // handoff.resolve without a budget is byte-for-byte what runQuery returns, with no budget field.
    const handoff = call(ctx, 'handoff.resolve', { id: 'fixture-query' })
    expect(handoff).toEqual(runQuery(index, config, { kind: 'ownership', id: 'fixture-query', agent: true }, { root }))
    expect(AgentHandoffV1Schema.parse(handoff)).not.toHaveProperty('budget')
    // doc.search is still the plain match list.
    expect(call(ctx, 'doc.search', { term: 'ranking' })).toEqual(searchIndex(index, 'ranking', 20))
    // docbridge.diagnostics keeps its shape unless a format is asked for.
    expect(call(ctx, 'docbridge.diagnostics')).toMatchObject({ reportHash: expect.any(String), diagnostics: expect.any(Array) })
  })

  it('gives handoff.resolve an optional budgetTokens that keeps the handoff a valid handoff', () => {
    const { ctx, index } = prepared()
    const unbounded = call(ctx, 'handoff.resolve', { id: 'fixture-query' }) as ReturnType<typeof runQuery>
    const bounded = call(ctx, 'handoff.resolve', { id: 'fixture-query', budgetTokens: 150 }) as ReturnType<typeof budgetedHandoff>
    const parsed = AgentHandoffV1Schema.parse(bounded)
    const budget = BudgetReportSchema.parse(parsed.budget)
    expect(budget.dropped).toContain('related')
    expect(parsed.related).toBeUndefined()
    expect(parsed.startHere).toBe((unbounded as { startHere: string }).startHere)
    expect(parsed.evidence).toEqual((unbounded as { evidence: unknown }).evidence)
    expect(bounded).toEqual(budgetedHandoff(index, unbounded as Parameters<typeof budgetedHandoff>[1], 150))
    expect(() => call(ctx, 'handoff.resolve', { id: 'fixture-query', budgetTokens: -1 })).toThrow('invalid arguments')
  })

  it('emits canonical findings from docbridge.diagnostics with format finding', () => {
    const { ctx, report } = prepared()
    const response = call(ctx, 'docbridge.diagnostics', { format: 'finding' }) as { reportHash: string; findings: Finding[] }
    expect(response.reportHash).toBe(report.contentHash)
    expect(response.findings).toEqual(findingsFromDiagnostics(report.diagnostics))
    const filtered = call(ctx, 'docbridge.diagnostics', { format: 'finding', status: 'undocumented' }) as { findings: Finding[] }
    expect(filtered.findings.length).toBeGreaterThan(0)
    expect(filtered.findings.every((finding) => finding.category === 'undocumented')).toBe(true)
  })
})

describe('the budget mirrors @agentskit/core', () => {
  it('agrees with the real compileBudget on every token count, dropped message and fits', async () => {
    const core = await import('@agentskit/core')
    const messages: BudgetMessage[] = ['a'.repeat(400), 'b'.repeat(120), 'c'.repeat(64), 'd'.repeat(700), 'core'].map((content) => ({ role: 'user', content }))
    for (const budget of [5_000, 400, 250, 210, 100, 3]) {
      const ours = compileBudget({ budget, messages, keepRecent: 1 })
      const theirs = await core.compileBudget({
        budget,
        keepRecent: 1,
        messages: messages.map((message, position) => ({ id: `m${position}`, role: 'user' as const, content: message.content, status: 'complete' as const, createdAt: new Date(0) })),
      })
      expect(ours.tokens).toEqual(theirs.tokens)
      expect(ours.fits).toBe(theirs.fits)
      expect(ours.strategy).toBe(theirs.strategy)
      expect(ours.dropped.map((message) => message.content)).toEqual(theirs.dropped.map((message) => message.content))
      expect(ours.messages.map((message) => message.content)).toEqual(theirs.messages.map((message) => message.content))
    }
    expect(approximateCounter.count(messages)).toBe(core.approximateCounter.count(messages.map((message) => ({ role: 'user' as const, content: message.content }))))
    expect(() => compileBudget({ budget: 10, messages, reserveForOutput: 10 })).toThrow('Budget must exceed reserveForOutput')
  })

  it('reports a section-by-section budget over any payload, in the declared order', () => {
    type Payload = { readonly core: string; readonly related?: string[]; readonly summaries?: string[]; readonly excerpts?: string[] }
    const payload: Payload = { core: 'keep', related: ['r'.repeat(80)], summaries: ['s'.repeat(80)], excerpts: ['e'.repeat(80)] }
    const sections: BudgetedSection<Payload>[] = [
      { name: 'summaries', content: payload.summaries, strip: ({ summaries: _s, ...rest }) => rest },
      { name: 'evidenceExcerpts', content: payload.excerpts, strip: ({ excerpts: _e, ...rest }) => rest },
      { name: 'related', content: payload.related, strip: ({ related: _r, ...rest }) => rest },
      { name: 'neighbours', content: [], strip: (value) => value },
    ]
    const generous = applyBudget(payload, sections, 10_000)
    expect(generous.payload).toEqual(payload)
    expect(generous.budget).toMatchObject({ fits: true, dropped: [], kept: ['evidenceExcerpts', 'related', 'summaries'] })
    expect(generous.budget.tokens.sections.neighbours).toBeUndefined()

    // Each section costs 23 tokens and the core 6: at 40 two sections must go, in the declared order.
    const tight = applyBudget(payload, sections, 40)
    expect(tight.budget.dropped).toEqual(['evidenceExcerpts', 'related'])
    expect(tight.payload).toEqual({ core: 'keep', summaries: payload.summaries })
    expect(tight.budget.tokens.total).toBeLessThanOrEqual(40)

    const impossible = applyBudget(payload, sections, 4)
    expect(impossible.budget).toMatchObject({ fits: false, dropped: ['evidenceExcerpts', 'related', 'summaries'], kept: [] })
    expect(impossible.payload).toEqual({ core: 'keep' })
    expect(impossible.budget.tokens.total).toBe(impossible.budget.tokens.core)
  })

  it('renders documents exactly as the real formatRetrievedDocuments does', async () => {
    const core = await import('@agentskit/core')
    const documents: RetrievedDocument[] = [
      { id: 'a', content: 'First\n\nwith two paragraphs', source: 'docs/a.md' },
      { id: 'b', content: 'No source' },
    ]
    expect(formatRetrievedDocuments(documents)).toBe(core.formatRetrievedDocuments(documents as Parameters<typeof core.formatRetrievedDocuments>[0]))
    expect(formatRetrievedDocuments([])).toBe(core.formatRetrievedDocuments([]))
  })
})

describe('canonical findings', () => {
  const FindingSchema = z
    .object({
      id: z.string().min(1),
      severity: z.enum(SEVERITY_ORDER),
      title: z.string().min(1),
      detail: z.string().min(1),
      category: z.string().optional(),
      location: z.string().optional(),
      confidence: z.number().min(0).max(1).optional(),
      remediation: z.string().optional(),
      ref: z.string().optional(),
      metadata: z.record(z.string(), z.unknown()).optional(),
    })
    .strict()

  it('emits values from ak-docs check --format finding that validate against the ecosystem Finding shape', async () => {
    const { root } = prepared()
    process.chdir(root)
    const result = captureStdout(() => runCli(['check', '--json', '--format', 'finding']))
    expect(result.code).toBe(0)
    const output = JSON.parse(result.out) as { ok: boolean; format: string; reportHash: string; findings: Finding[] }
    expect(output.format).toBe('finding')
    expect(output.findings.length).toBeGreaterThan(0)
    const real = await import('@agentskit/core/finding')
    expect([...SEVERITY_ORDER]).toEqual([...real.SEVERITY_ORDER])
    for (const finding of output.findings) {
      expect(FindingSchema.parse(finding)).toEqual(finding)
      expect(real.SEVERITY_ORDER).toContain(finding.severity)
      // Assignable to the real type: a drift in the mirror fails to compile here.
      const canonical: import('@agentskit/core/finding').Finding = finding
      expect(canonical.id).toBe(finding.id)
    }
    // Most severe first, stable within a severity.
    const ranks = output.findings.map((finding) => real.SEVERITY_ORDER.indexOf(finding.severity))
    expect(ranks).toEqual([...ranks].sort((a, b) => a - b))
    // Same run, same findings, regardless of the format asked for.
    const plain = JSON.parse(captureStdout(() => runCli(['check', '--json'])).out) as { diagnostics: Parameters<typeof findingsFromDiagnostics>[0] }
    expect(output.findings).toEqual(findingsFromDiagnostics(plain.diagnostics))
    expect(captureStdout(() => runCli(['check', '--json', '--format', 'nope'])).code).toBe(2)
  })

  it('maps internal severities and statuses without inventing a critical one', () => {
    const evidence = [{ source: 'code' as const, path: 'src/a.ts', lineStart: 3 }]
    const findings = findingsFromDiagnostics([
      { id: 'd-info', code: 'DOCBRIDGE_COVERAGE_GAP', status: 'not-analyzed', severity: 'info', message: 'Not analyzed.', evidence: [] },
      { id: 'd-error', code: 'RELATION_UNDOCUMENTED', status: 'undocumented', severity: 'error', message: 'Undocumented.', evidence, entityIds: ['area:src'], remediation: 'Document it.' },
      { id: 'd-warn', code: 'DECLARED_RELATION_STALE', status: 'stale-or-unverified', severity: 'warn', message: 'Stale.', evidence },
    ])
    expect(findings.map((finding) => [finding.id, finding.severity])).toEqual([['d-error', 'high'], ['d-warn', 'medium'], ['d-info', 'low']])
    expect(findings[0]).toMatchObject({ title: 'Relation undocumented', location: 'src/a.ts:3', confidence: 0.9, remediation: 'Document it.', ref: 'RELATION_UNDOCUMENTED', category: 'undocumented', metadata: { code: 'RELATION_UNDOCUMENTED', entityIds: ['area:src'] } })
    expect(findings[2]).not.toHaveProperty('location')
    expect(findings.every((finding) => finding.severity !== 'critical')).toBe(true)
  })
})
