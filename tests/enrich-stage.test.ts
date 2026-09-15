import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'

import { afterEach, describe, expect, it, vi } from 'vitest'

import { createRegistryAgentAdapter, REGISTRY_AGENT_PROTOCOL_V2 } from '../src/agents/registry-adapter.js'
import { runCli } from '../src/cli/program.js'
import { applyConfigDefaults } from '../src/config/defaults.js'
import { DocBridgeConfigV1Schema, type DocBridgeConfigV1 } from '../src/config/schema.js'
import { discoverRepository } from '../src/discovery/repository.js'
import { approvalsDir, listApprovals } from '../src/enrich/approvals.js'
import { createMemoryEnrichmentCache, enrichmentCacheKey } from '../src/enrich/cache.js'
import { batchContextPacks, buildContextPacks, contextPackHash, fitContextPack, type ContextPack } from '../src/enrich/context-pack.js'
import { enrichmentCacheDir, enrichmentOverlayPath, readEnrichmentOverlay } from '../src/enrich/overlay.js'
import { resolveEnrichmentRoles, runEnrichment, type EnrichmentAgent } from '../src/enrich/stage.js'
import { entityContentHash } from '../src/enrich/validate.js'
import { buildDocBridgeIndex } from '../src/index-builder/build-index.js'
import { sha256NormalizedV1 } from '../src/index-builder/content-hash.js'
import { handleMcpRequest } from '../src/mcp/server.js'
import { reconcileKnowledge } from '../src/reconciliation/reconcile.js'
import { searchIndex } from '../src/query/search.js'
import { enrichmentProposalId } from '../src/schemas/enrichment.js'
import type { DiscoverySnapshotV1, ReconciliationReportV1 } from '../src/schemas/knowledge.js'

vi.setConfig({ testTimeout: 30_000 })

const temporary: string[] = []
afterEach(() => {
  for (const directory of temporary) rmSync(directory, { recursive: true, force: true })
  temporary.length = 0
})

const write = (root: string, path: string, content: string): void => {
  mkdirSync(dirname(join(root, path)), { recursive: true })
  writeFileSync(join(root, path), content, 'utf8')
}

const AGENT_ID = 'fixture-curator'

/** A small repository with an installed Registry agent whose runner speaks protocol v2 and counts its calls. */
const repository = (registry: Record<string, unknown> = {}): { root: string; config: DocBridgeConfigV1; configPath: string; calls: () => number } => {
  const root = mkdtempSync(join(tmpdir(), 'doc-bridge-enrich-stage-'))
  temporary.push(root)
  write(root, 'package.json', JSON.stringify({ name: 'fixture', version: '0.0.0' }))
  write(root, 'src/query/search.ts', "import { rank } from '../ranking/bm25.js'\nexport const searchIndex = (): number => rank()\n")
  write(root, 'src/ranking/bm25.ts', 'export const rank = (): number => 2\n')
  write(root, 'docs/for-agents/INDEX.md', '# Agent index\n\n- [query](./query.md)\n')
  write(root, 'docs/for-agents/query.md', '---\nid: fixture-query\neditRoot: src/query\n---\n# Query\n\nDeterministic search. Exports `searchIndex`.\n')
  write(root, 'docs/ranking.md', '# Ranking\n\nScores come from `src/ranking/bm25.ts`. Never share api_key=sk-live-abcdefghijklmnopqrstuvwxyz here.\n')
  write(root, 'docs/mention.md', '# Mention\n\nA passing mention of `src/query`.\n')
  write(root, `.doc-bridge/agents/${AGENT_ID}/agent.json`, JSON.stringify({ id: AGENT_ID, version: '1.0.0', provider: 'fixture', model: 'fixture', capabilities: ['pack.read', 'proposal.write'] }))
  // The runner: one summary and one alias per document pack, a canonical marker for query.md, and a call log.
  write(root, `.doc-bridge/agents/${AGENT_ID}/doc-bridge-adapter.js`, `import { createHash } from 'node:crypto'
import { appendFileSync } from 'node:fs'
const sortValue = (value) => Array.isArray(value) ? value.map(sortValue) : value && typeof value === 'object' ? Object.fromEntries(Object.keys(value).sort().map((key) => [key, sortValue(value[key])])) : value
const hash = (value) => createHash('sha256').update(JSON.stringify(sortValue(value)), 'utf8').digest('hex')
const origin = { agentId: ${JSON.stringify(AGENT_ID)}, agentVersion: '1.0.0', promptVersion: '1' }
const proposal = (pack, kind, payload, key) => {
  const base = { type: 'enrichment-proposal', schemaVersion: 1, kind, entity: pack.target.id, targetContentHash: pack.target.contentHash, confidence: 0.9, reason: 'fixture ' + kind, evidence: pack.target.evidence, origin, baseSnapshotHash: pack.baseSnapshotHash, payload }
  return { ...base, proposalId: hash({ kind, entity: pack.target.id, targetContentHash: pack.target.contentHash, agentId: origin.agentId, promptVersion: origin.promptVersion, key }) }
}
export default (context) => {
  appendFileSync(${JSON.stringify(join(root, 'calls.log'))}, context.protocol + ' ' + context.task + ' ' + context.packs.length + '\\n')
  if (context.protocol !== ${JSON.stringify(REGISTRY_AGENT_PROTOCOL_V2)}) throw new Error('v2 only')
  const proposals = []
  for (const pack of context.packs) {
    if (pack.target.kind !== 'document') continue
    const stem = pack.target.path.split('/').pop().replace(/\\.md$/, '')
    proposals.push(proposal(pack, 'summarize', { summary: 'Fixture summary of ' + stem + '.', language: 'en' }, null))
    proposals.push(proposal(pack, 'add-alias', { alias: stem + ' guide' }, { alias: stem + ' guide' }))
    if (pack.target.path === 'docs/for-agents/query.md') proposals.push(proposal(pack, 'mark-canonical', { scope: 'area:src/query' }, null))
    if (pack.target.path === 'docs/mention.md') proposals.push({ kind: 'rewrite-history', entity: pack.target.id })
  }
  return { proposals }
}
`)
  const configuration = {
    schemaVersion: 1,
    corpus: { agent: { root: 'docs/for-agents', index: 'docs/for-agents/INDEX.md' } },
    routing: { options: { ownership: { 'fixture-query': { path: 'src/query', purpose: 'Query layer', agentDoc: 'docs/for-agents/query.md' } } } },
    intelligence: { registry: { enabled: true, agentId: AGENT_ID, agentRoot: '.doc-bridge/agents', ...registry } },
  }
  write(root, 'doc-bridge.config.json', JSON.stringify(configuration))
  return {
    root,
    config: applyConfigDefaults(DocBridgeConfigV1Schema.parse(configuration)),
    configPath: join(root, 'doc-bridge.config.json'),
    calls: () => (existsSync(join(root, 'calls.log')) ? readFileSync(join(root, 'calls.log'), 'utf8').trim().split('\n').filter(Boolean).length : 0),
  }
}

const artifacts = (root: string, config: DocBridgeConfigV1): { snapshot: DiscoverySnapshotV1; report: ReconciliationReportV1 } => {
  const snapshot = discoverRepository({ root, config })
  return { snapshot, report: reconcileKnowledge(snapshot, snapshot, {}) }
}

const capture = async (fn: () => number | undefined | Promise<number | undefined>): Promise<{ code: number | undefined; out: string; err: string }> => {
  const stdout = process.stdout.write
  const stderr = process.stderr.write
  let out = ''
  let err = ''
  process.stdout.write = ((chunk: string | Uint8Array) => { out += String(chunk); return true }) as typeof process.stdout.write
  process.stderr.write = ((chunk: string | Uint8Array) => { err += String(chunk); return true }) as typeof process.stderr.write
  try {
    return { code: await fn(), out, err }
  } finally {
    process.stdout.write = stdout
    process.stderr.write = stderr
  }
}

describe('context packs', () => {
  it('builds one bounded, redacted, deterministic pack per document, grouped by area', () => {
    const { root, config } = repository()
    const { snapshot, report } = artifacts(root, config)
    const packs = buildContextPacks({ snapshot, report, config, root })
    expect(packs.map((pack) => pack.target.id)).toEqual(['document:docs/for-agents/INDEX.md', 'document:docs/for-agents/query.md', 'document:docs/mention.md', 'document:docs/ranking.md'])
    const ranking = packs.find((pack) => pack.target.path === 'docs/ranking.md') as ContextPack
    expect(JSON.stringify(ranking)).not.toContain('sk-live-')
    expect(ranking.evidence[0]?.excerpt).toContain('[REDACTED]')
    expect(ranking.neighbours.map((item) => [item.id, item.relation, item.direction])).toContainEqual(['module:src/ranking/bm25.ts', 'mentions', 'out'])
    expect(ranking.neighbours.length).toBeLessThanOrEqual(32)
    for (const pack of packs) {
      expect(pack.budget.bytes).toBeLessThanOrEqual(pack.budget.maxBytes)
      expect(Buffer.byteLength(JSON.stringify(pack), 'utf8')).toBeLessThanOrEqual(pack.budget.bytes)
      expect(pack.packHash).toBe(contextPackHash(pack.target, pack.neighbours))
    }
    // The same inputs in another order are the same packs.
    const shuffled = { ...snapshot, entities: [...snapshot.entities].reverse(), relations: [...snapshot.relations].reverse() }
    expect(JSON.stringify(buildContextPacks({ snapshot: shuffled, report, config, root }))).toBe(JSON.stringify(packs))
    const batches = batchContextPacks(packs)
    expect(batches.map((batch) => [batch.areaId, batch.packs.length])).toEqual([['root', 4]])
  })

  it('never exceeds its byte budget, dropping excerpt, then diagnostics, then neighbours', () => {
    const { root, config } = repository()
    const { snapshot, report } = artifacts(root, config)
    const generous = buildContextPacks({ snapshot, report, config, root, kinds: ['document'] }).find((pack) => pack.target.path === 'docs/ranking.md') as ContextPack
    expect(generous.budget.dropped).toEqual([])
    // The target is never dropped: an impossible budget yields the bare pack, and a budget just above it fits.
    const minimal = fitContextPack(generous, 1)
    expect(minimal.budget.dropped).toEqual(['evidence.excerpt', 'diagnostics', 'neighbours'])
    expect(minimal.target).toEqual(generous.target)
    expect(minimal.neighbours).toEqual([])
    const floor = minimal.budget.bytes
    const tight = fitContextPack(generous, floor + 40)
    expect(tight.budget.bytes).toBeLessThanOrEqual(floor + 40)
    expect(Buffer.byteLength(JSON.stringify(tight), 'utf8')).toBeLessThanOrEqual(floor + 40)
    expect(tight.budget.dropped[0]).toBe('evidence.excerpt')
    const middle = fitContextPack(generous, floor + 40 + Buffer.byteLength(JSON.stringify(generous.neighbours), 'utf8'))
    expect(middle.neighbours.length).toBeGreaterThan(0)
    expect(middle.budget.bytes).toBeLessThanOrEqual(middle.budget.maxBytes)
    const configured = buildContextPacks({ snapshot, report, config: { ...config, intelligence: { registry: { enabled: true, maxPackBytes: 4_096 } } }, root })
    for (const pack of configured) expect(pack.budget.maxBytes).toBe(4_096)
    for (const pack of configured) expect(pack.budget.bytes).toBeLessThanOrEqual(4_096)
  })

  it('drops the same sections the ecosystem compileBudget drops with a byte counter', async () => {
    const core = (await import('@agentskit/core')) as unknown as {
      compileBudget: (input: { budget: number; messages: { role: string; content: string; id: string }[]; counter: { name: string; count: (messages: { content: string }[]) => Promise<number> | number; countText?: (text: string) => number }; strategy: 'drop-oldest'; keepRecent: number }) => Promise<{ fits: boolean; dropped: { id: string }[]; messages: { id: string }[] }>
    }
    const { root, config } = repository()
    const { snapshot, report } = artifacts(root, config)
    const pack = buildContextPacks({ snapshot, report, config, root }).find((item) => item.target.path === 'docs/ranking.md') as ContextPack
    const budget = Buffer.byteLength(JSON.stringify({ ...pack, evidence: [], diagnostics: [] }), 'utf8') + 80
    const mirrored = fitContextPack(pack, budget)
    // Sections least-important-first, so drop-oldest drops the excerpt before the diagnostics before the neighbours.
    const sections = [
      { role: 'user', id: 'evidence.excerpt', content: JSON.stringify(pack.evidence) },
      { role: 'user', id: 'diagnostics', content: JSON.stringify(pack.diagnostics) },
      { role: 'user', id: 'neighbours', content: JSON.stringify(pack.neighbours) },
      { role: 'user', id: 'target', content: JSON.stringify(pack.target) },
    ]
    const bytes = (messages: { content: string }[]): number => messages.reduce((total, message) => total + Buffer.byteLength(message.content, 'utf8'), 0)
    const result = await core.compileBudget({ budget, messages: sections, counter: { name: 'bytes', count: bytes, countText: (text) => Buffer.byteLength(text, 'utf8') }, strategy: 'drop-oldest', keepRecent: 1 })
    expect(result.fits).toBe(true)
    expect(result.messages.map((message) => message.id)).toContain('target')
    const droppedByCore = result.dropped.map((message) => message.id)
    const order = ['evidence.excerpt', 'diagnostics', 'neighbours']
    // Both drop in the declared order — each dropped list is a prefix of it — and both start with the excerpt.
    expect(droppedByCore).toEqual(order.slice(0, droppedByCore.length))
    expect(mirrored.budget.dropped).toEqual(order.slice(0, mirrored.budget.dropped.length))
    expect(droppedByCore[0]).toBe('evidence.excerpt')
    expect(mirrored.budget.dropped[0]).toBe('evidence.excerpt')
  })
})

describe('the enrich stage', () => {
  const fakeAgent = (log: string[]): EnrichmentAgent => async ({ task, packs, role }) => {
    log.push(`${task}:${packs.map((pack) => pack.target.id).join(',')}`)
    return packs.flatMap((pack) => {
      if (pack.target.kind !== 'document') return []
      const origin = { agentId: role.agentId, agentVersion: '1.0.0', promptVersion: role.promptVersion }
      const make = (kind: 'summarize' | 'mark-canonical', payload: unknown) => {
        const identity = { kind, entity: pack.target.id, targetContentHash: pack.target.contentHash, origin, payload }
        return { type: 'enrichment-proposal', schemaVersion: 1, ...identity, proposalId: enrichmentProposalId(identity), confidence: 0.9, reason: `fixture ${kind}`, evidence: pack.target.evidence, baseSnapshotHash: pack.baseSnapshotHash }
      }
      return [make('summarize', { summary: `Fixture summary of ${pack.target.path}.`, language: 'en' }), ...(pack.target.path === 'docs/for-agents/query.md' ? [make('mark-canonical', { scope: 'area:src/query' })] : [])]
    })
  }

  it('makes zero agent calls over an unchanged repository and re-runs only the packs a change touched', async () => {
    const { root, config } = repository()
    const log: string[] = []
    const agent = { call: fakeAgent(log), version: () => '1.0.0' }
    const first = await runEnrichment({ root, config, ...artifacts(root, config), agent, now: () => '2026-09-14T00:00:00.000Z' })
    expect(first.agentCalls).toBe(1)
    expect(first.rerun).toHaveLength(4)
    expect(first.overlay.accepted.map((entry) => entry.proposal.kind)).toEqual(['summarize', 'summarize', 'summarize', 'summarize'])
    expect(first.overlay.pending.map((entry) => entry.proposal.kind)).toEqual(['mark-canonical'])
    expect(readdirSync(enrichmentCacheDir(root))).toHaveLength(4)
    expect(listApprovals(approvalsDir(root)).map((approval) => approval.status)).toEqual(['pending'])

    const second = await runEnrichment({ root, config, ...artifacts(root, config), agent, now: () => '2030-01-01T00:00:00.000Z' })
    expect(second.agentCalls).toBe(0)
    expect(second.cacheHits).toBe(4)
    expect(second.rerun).toEqual([])
    expect(second.overlay.contentHash).toBe(first.overlay.contentHash)
    // Decisions already made keep their date: nothing was re-accepted.
    expect(second.overlay.accepted.every((entry) => entry.acceptedAt === '2026-09-14T00:00:00.000Z')).toBe(true)
    expect(log).toHaveLength(1)

    write(root, 'docs/ranking.md', '# Ranking\n\nRewritten scores.\n')
    const third = await runEnrichment({ root, config, ...artifacts(root, config), agent, now: () => '2031-01-01T00:00:00.000Z' })
    expect(third.rerun).toEqual(['document:docs/ranking.md'])
    expect(third.agentCalls).toBe(1)
    expect(third.cacheHits).toBe(3)
    expect(third.expired).toBe(1)
    expect(third.overlay.rejected.filter((entry) => entry.reason === 'expired').map((entry) => entry.entity)).toEqual(['document:docs/ranking.md'])
    const ranking = third.overlay.accepted.find((entry) => entry.proposal.entity === 'document:docs/ranking.md')
    expect(ranking?.acceptedAt).toBe('2031-01-01T00:00:00.000Z')
    expect(third.overlay.accepted.filter((entry) => entry.proposal.entity !== 'document:docs/ranking.md').every((entry) => entry.acceptedAt === '2026-09-14T00:00:00.000Z')).toBe(true)
    expect(third.overlay.pending).toHaveLength(1)
  })

  it('keys the cache on task, agent identity and version, prompt version and pack hash', () => {
    const cache = createMemoryEnrichmentCache()
    const key = { task: 'curate' as const, agentId: 'a', agentVersion: '1', promptVersion: '1', packHash: 'a'.repeat(64) }
    cache.write(key, [{ kind: 'summarize' }])
    expect(cache.read(key)).toEqual([{ kind: 'summarize' }])
    for (const change of [{ task: 'review' as const }, { agentId: 'b' }, { agentVersion: '2' }, { promptVersion: '2' }, { packHash: 'b'.repeat(64) }]) {
      expect(cache.read({ ...key, ...change })).toBeUndefined()
      expect(enrichmentCacheKey({ ...key, ...change })).not.toBe(enrichmentCacheKey(key))
    }
  })

  it('resolves roles from configuration and refuses an adjudicator that shares an identity', () => {
    const { config } = repository()
    expect(resolveEnrichmentRoles(config)).toEqual([{ role: 'curator', agentId: AGENT_ID, promptVersion: '1' }])
    const three = { ...config, intelligence: { registry: { enabled: true, agentId: AGENT_ID, roles: { reviewer: { agentId: 'graph-reviewer', promptVersion: '3' }, adjudicator: { agentId: 'judge' } } } } }
    expect(resolveEnrichmentRoles(three).map((role) => [role.role, role.agentId, role.promptVersion])).toEqual([['curator', AGENT_ID, '1'], ['reviewer', 'graph-reviewer', '3'], ['adjudicator', 'judge', '1']])
    expect(() => resolveEnrichmentRoles({ ...config, intelligence: { registry: { enabled: true, agentId: AGENT_ID, roles: { adjudicator: {} } } } })).toThrow('different agent identity')
    expect(resolveEnrichmentRoles({ ...config, intelligence: { registry: { enabled: true, roles: { curator: { enabled: false } } } } })).toEqual([])
  })

  it('invokes the adjudicator only for a canonical conflict, and rejects a self-adjudication', async () => {
    const { root, config } = repository()
    const log: string[] = []
    const agent: EnrichmentAgent = async ({ task, packs, role }) => {
      log.push(`${role.role}:${task}`)
      if (task === 'adjudicate') {
        const request = (packs as unknown as { type?: string; disputes?: { proposal: { proposalId: string; origin: { agentId: string } } }[] }[]).find((item) => item.type === 'adjudication-request')
        const disputes = (request?.disputes ?? []) as { proposal: { proposalId: string; entity: string; origin: { agentId: string } } }[]
        const ids = disputes.map((item) => item.proposal.proposalId).sort()
        const keep = [disputes.find((item) => item.proposal.entity.endsWith('query.md'))?.proposal.proposalId ?? '']
        const origin = { agentId: role.agentId, agentVersion: '1.0.0', promptVersion: '1' }
        const draft = { type: 'enrichment-adjudication', schemaVersion: 1, judges: ids, keep, reason: 'query.md covers the area', origin }
        const selfDraft = { ...draft, origin: { ...origin, agentId: disputes[0]?.proposal.origin.agentId ?? '' } }
        return [{ ...selfDraft, adjudicationId: sha256NormalizedV1({ judges: ids, keep, agentId: selfDraft.origin.agentId, promptVersion: '1' }) }, { ...draft, adjudicationId: sha256NormalizedV1({ judges: ids, keep, agentId: origin.agentId, promptVersion: '1' }) }]
      }
      // Curator and reviewer each mark a different document canonical for the same area.
      const target = role.role === 'curator' ? 'docs/for-agents/query.md' : 'docs/mention.md'
      return packs.flatMap((pack) => {
        if (pack.target.path !== target) return []
        const origin = { agentId: role.agentId, agentVersion: '1.0.0', promptVersion: '1' }
        const identity = { kind: 'mark-canonical' as const, entity: pack.target.id, targetContentHash: pack.target.contentHash, origin, payload: { scope: 'area:src/query' } }
        return [{ type: 'enrichment-proposal', schemaVersion: 1, ...identity, proposalId: enrichmentProposalId(identity), confidence: 0.9, reason: 'canonical', evidence: pack.target.evidence, baseSnapshotHash: pack.baseSnapshotHash }]
      })
    }
    const configured = { ...config, intelligence: { registry: { enabled: true, agentId: AGENT_ID, roles: { reviewer: { agentId: 'graph-reviewer' }, adjudicator: { agentId: 'judge' } } } } }
    const result = await runEnrichment({ root, config: configured, ...artifacts(root, configured), agent: { call: agent, version: () => '1.0.0' } })
    // The reviewer is called once per area batch; the adjudicator exactly once, after both.
    expect([...new Set(log)]).toEqual(['curator:curate', 'reviewer:review', 'adjudicator:adjudicate'])
    expect(log[log.length - 1]).toBe('adjudicator:adjudicate')
    expect(result.overlay.pending.map((entry) => [entry.proposal.entity, entry.note])).toEqual([['document:docs/for-agents/query.md', undefined]])
    expect(result.overlay.rejected.map((entry) => entry.reason).sort()).toEqual(['adjudicated', 'self-adjudication'])
    expect(result.overlay.accepted).toEqual([])
    // A second run has nothing to adjudicate: the conflict is settled and cached.
    const again = await runEnrichment({ root, config: configured, ...artifacts(root, configured), agent: { call: agent, version: () => '1.0.0' } })
    expect(again.agentCalls).toBe(0)
  })

  it('refuses to run with the Registry disabled and leaves no overlay behind', async () => {
    const { root, config } = repository({ enabled: false })
    await expect(runEnrichment({ root, config, ...artifacts(root, config), agent: { call: async () => [], version: () => '1' } })).rejects.toThrow('disabled')
    expect(existsSync(enrichmentOverlayPath(root))).toBe(false)
  })
})

describe('the Registry adapter, protocol v2', () => {
  it('sends packs and returns the proposals array from a runner or a CLI, and fails closed on a malformed answer', async () => {
    const { root, config } = repository()
    const seen: unknown[] = []
    const adapter = createRegistryAgentAdapter(root, config, (context) => {
      seen.push(context)
      return { proposals: [{ kind: 'summarize' }] }
    })
    const proposals = await adapter.enrich('curate', [{ target: { id: 'document:x', metadata: { note: 'token=super-secret-value' } } }], { role: 'curator', promptVersion: '7' })
    expect(proposals).toEqual([{ kind: 'summarize' }])
    expect(seen[0]).toMatchObject({ protocol: REGISTRY_AGENT_PROTOCOL_V2, task: 'curate', role: 'curator', promptVersion: '7', network: false, shell: false })
    expect(JSON.stringify(seen[0])).not.toContain('super-secret-value')
    expect(Object.isFrozen(seen[0])).toBe(true)
    const malformed = createRegistryAgentAdapter(root, config, () => ({ proposal: [] }))
    await expect(malformed.enrich('curate', [])).rejects.toThrow('"proposals" array')
    const cliPath = join(root, 'agent-cli.mjs')
    writeFileSync(cliPath, `import { readFileSync } from 'node:fs'
const input = JSON.parse(readFileSync(0, 'utf8'))
if (input.protocol !== ${JSON.stringify(REGISTRY_AGENT_PROTOCOL_V2)} || input.context.task !== 'review') process.exit(3)
process.stdout.write(JSON.stringify({ proposals: [{ kind: 'rank-hint', packs: input.context.packs.length }] }))
`)
    const viaCli = createRegistryAgentAdapter(root, { ...config, intelligence: { registry: { enabled: true, agentId: AGENT_ID, agentRoot: '.doc-bridge/agents', cli: { command: process.execPath, args: [cliPath] } } } })
    expect(await viaCli.enrich('review', [{ a: 1 }, { b: 2 }])).toEqual([{ kind: 'rank-hint', packs: 2 }])
  })
})

describe('ak-docs enrich, check --enrich, index, search and MCP', () => {
  it('runs the stage end to end, caches, applies the overlay to the index, and bounds its influence', async () => {
    const { root, config, configPath, calls } = repository()
    const previous = process.cwd()
    try {
      process.chdir(root)
      const plainCheck = await capture(() => runCli(['check', '--config', configPath, '--json']))
      expect(plainCheck.code).toBe(0)
      const plainIndex = buildDocBridgeIndex({ root, config, write: false }).index.projection

      const first = await capture(() => runCli(['enrich', '--config', configPath, '--json']))
      expect(first.code, first.err).toBe(0)
      const payload = JSON.parse(first.out)
      expect(payload).toMatchObject({ ok: true, agentCalls: 1, cacheHits: 0, packs: 4, accepted: 8, pending: 1 })
      expect(payload.stats.rejectionReasons).toMatchObject({ 'invalid-kind': 1 })
      expect(calls()).toBe(1)
      expect(readEnrichmentOverlay(root)?.contentHash).toBe(payload.overlayHash)

      const second = await capture(() => runCli(['enrich', '--config', configPath, '--json']))
      expect(JSON.parse(second.out)).toMatchObject({ agentCalls: 0, cacheHits: 4, rerun: [] })
      expect(calls()).toBe(1)

      // The overlay reaches the index: aliases, summaries, and a bounded signal for the canonical document once approved.
      const listed = await capture(() => runCli(['enrich', 'list', '--config', configPath, '--json']))
      const pending = JSON.parse(listed.out).enrichment.pending[0]
      expect(pending.proposal.kind).toBe('mark-canonical')
      const self = await capture(() => runCli(['enrich', 'approve', pending.proposal.proposalId, '--by', AGENT_ID, '--config', configPath, '--json']))
      expect(self.code).toBe(2)
      expect(self.err).toContain('cannot approve its own output')
      const approved = await capture(() => runCli(['enrich', 'approve', pending.proposal.proposalId, '--by', 'reviewer', '--config', configPath, '--json']))
      expect(approved.code, approved.err).toBe(0)
      expect(JSON.parse(approved.out)).toMatchObject({ ok: true, gate: 'ecosystem', approvalId: pending.approvalId })
      expect(listApprovals(approvalsDir(root)).map((approval) => approval.status)).toEqual(['approved'])

      const enriched = buildDocBridgeIndex({ root, config, write: false }).index
      const ranking = enriched.projection?.entries.find((entry) => entry.id === 'document:docs/ranking.md')
      expect(ranking?.aliases).toContain('ranking guide')
      // An observed summary is never replaced; an accepted one fills a document that has none.
      expect(ranking?.summary).toBe('Scores come from src/ranking/bm25.ts. Never share api_key=sk-live-abcdefghijklmnopqrstuvwxyz here.')
      expect(enriched.projection?.entries.find((entry) => entry.id === 'document:docs/for-agents/INDEX.md')?.summary).toBe('Fixture summary of INDEX.')
      const query = enriched.projection?.entries.find((entry) => entry.id === 'document:docs/for-agents/query.md')
      expect(query?.agentSignal).toBe(0.8)
      expect(query?.tags).toContain('canonical')
      // An exact identifier still outranks the canonical, boosted document.
      const byAlias = searchIndex(enriched, 'ranking guide', 5, { explain: true })
      expect(byAlias[0]?.id).toBe('document:docs/ranking.md')
      expect(byAlias[0]?.explain?.components.exactId).toBeGreaterThanOrEqual(200)
      const bySymbol = searchIndex(enriched, 'searchIndex', 5, { explain: true })
      expect(bySymbol[0]?.id).toBe('module:src/query/search.ts')
      expect(plainIndex?.entries.every((entry) => enriched.projection?.entries.some((item) => item.id === entry.id && item.contentHash === entry.contentHash))).toBe(true)

      // check --enrich reports the stage and changes nothing else.
      const checked = await capture(() => runCli(['check', '--enrich', '--config', configPath, '--json']))
      expect(checked.code, checked.err).toBe(0)
      const checkedPayload = JSON.parse(checked.out)
      expect(checkedPayload.enrichment, JSON.stringify(checkedPayload.enrichment)).toMatchObject({ status: 'ok', agentCalls: 0 })
      expect(checkedPayload.steps.find((step: { name: string }) => step.name === 'enrich')?.status).toBe('completed')
      expect(checkedPayload.diagnostics).toEqual(JSON.parse(plainCheck.out).diagnostics)
      expect(checkedPayload.rules).toEqual(JSON.parse(plainCheck.out).rules)

      // MCP shares the record.
      const mcp = handleMcpRequest({ root, config }, { jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'docbridge.proposals', arguments: { action: 'enrich-list' } } }) as { content: { text: string }[] }
      expect(JSON.parse(mcp.content[0]!.text).enrichment.accepted).toHaveLength(9)
      const mcpDecision = await (handleMcpRequest({ root, config }, { jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name: 'docbridge.proposals', arguments: { action: 'enrich-approve', proposalId: pending.proposal.proposalId, approvedBy: 'reviewer' } } }) as Promise<unknown>).catch((error: Error) => error.message)
      expect(String(mcpDecision)).toContain('No pending enrichment proposal')
    } finally {
      process.chdir(previous)
    }
  })

  it('leaves check, index and search identical when the agent is disabled, times out or answers garbage', async () => {
    const { root, config, configPath } = repository()
    const previous = process.cwd()
    try {
      process.chdir(root)
      const baselineCheck = await capture(() => runCli(['check', '--config', configPath, '--json']))
      const baseline = JSON.stringify(buildDocBridgeIndex({ root, config, write: false }).index.projection?.entries)
      const search = JSON.stringify(searchIndex(buildDocBridgeIndex({ root, config, write: false }).index, 'ranking scores'))

      // Times out: the stage fails, no overlay is written.
      write(root, `.doc-bridge/agents/${AGENT_ID}/doc-bridge-adapter.js`, 'export default () => new Promise((resolve) => setTimeout(() => resolve({ proposals: [] }), 200))\n')
      const slow = { ...config, intelligence: { registry: { enabled: true, agentId: AGENT_ID, agentRoot: '.doc-bridge/agents', timeoutMs: 5 } } }
      writeFileSync(configPath, JSON.stringify({ ...JSON.parse(readFileSync(configPath, 'utf8')), intelligence: slow.intelligence }))
      const timedOut = await capture(() => runCli(['enrich', '--config', configPath, '--json']))
      expect(timedOut.code).toBe(2)
      expect(timedOut.err).toContain('timed out')
      expect(existsSync(enrichmentOverlayPath(root))).toBe(false)
      const checkedAfterTimeout = await capture(() => runCli(['check', '--enrich', '--config', configPath, '--json']))
      expect(checkedAfterTimeout.code).toBe(0)
      expect(JSON.parse(checkedAfterTimeout.out).enrichment).toMatchObject({ status: 'failed', error: expect.stringContaining('timed out') })
      expect(JSON.parse(checkedAfterTimeout.out).diagnostics).toEqual(JSON.parse(baselineCheck.out).diagnostics)

      // Garbage: no proposals array. A separate module path, because the loader caches the first one by URL.
      write(root, '.doc-bridge/garbage-runner.mjs', 'export default () => "not even json"\n')
      writeFileSync(configPath, JSON.stringify({ ...JSON.parse(readFileSync(configPath, 'utf8')), intelligence: { registry: { enabled: true, agentId: AGENT_ID, agentRoot: '.doc-bridge/agents', runnerModule: '.doc-bridge/garbage-runner.mjs' } } }))
      const garbage = await capture(() => runCli(['enrich', '--config', configPath, '--json']))
      expect(garbage.code).toBe(2)
      expect(garbage.err).toContain('"proposals" array')
      expect(existsSync(enrichmentOverlayPath(root))).toBe(false)

      // Disabled: refused, explicitly.
      writeFileSync(configPath, JSON.stringify({ ...JSON.parse(readFileSync(configPath, 'utf8')), intelligence: { registry: { enabled: false } } }))
      const disabled = await capture(() => runCli(['enrich', '--config', configPath, '--json']))
      expect(disabled.code).toBe(2)
      expect(disabled.err).toContain('disabled')

      expect(JSON.stringify(buildDocBridgeIndex({ root, config, write: false }).index.projection?.entries)).toBe(baseline)
      expect(JSON.stringify(searchIndex(buildDocBridgeIndex({ root, config, write: false }).index, 'ranking scores'))).toBe(search)
      const plain = await capture(() => runCli(['check', '--config', configPath, '--json']))
      expect(JSON.parse(plain.out).diagnostics).toEqual(JSON.parse(baselineCheck.out).diagnostics)
    } finally {
      process.chdir(previous)
    }
  })

  it('records a fix approval through the same gate', async () => {
    const { root, configPath } = repository()
    write(root, 'docs/broken.md', '# Broken\n\nSee [ranking](./rankng.md).\n')
    const previous = process.cwd()
    try {
      process.chdir(root)
      const proposed = await capture(() => runCli(['fix', 'propose', 'links', '--output', '.doc-bridge/fix.json', '--config', configPath]))
      expect(proposed.code).toBe(0)
      const approved = await capture(() => runCli(['fix', 'approve', '.doc-bridge/fix.json', '--by', 'reviewer', '--config', configPath]))
      expect(approved.code, approved.err).toBe(0)
      const payload = JSON.parse(approved.out)
      expect(payload.approvalId).toMatch(/^[a-f0-9]{64}$/)
      expect(listApprovals(approvalsDir(root))).toEqual([expect.objectContaining({ id: payload.approvalId, name: 'doc-bridge.fix', status: 'approved', decisionMetadata: expect.objectContaining({ by: 'reviewer' }) })])
    } finally {
      process.chdir(previous)
    }
  })
})

describe('entity content hashes', () => {
  it('binds to the file hash when there is one and to the entity otherwise', () => {
    const { root, config } = repository()
    const snapshot = discoverRepository({ root, config })
    const document = snapshot.entities.find((entity) => entity.id === 'document:docs/ranking.md')!
    expect(entityContentHash(document)).toBe(document.evidence[0]?.contentHash)
    const area = snapshot.entities.find((entity) => entity.kind === 'area')!
    expect(entityContentHash(area)).toMatch(/^[a-f0-9]{64}$/)
    expect(entityContentHash({ ...area, name: 'renamed' })).not.toBe(entityContentHash(area))
  })
})
