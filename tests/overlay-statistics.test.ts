import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'

import { afterEach, describe, expect, it } from 'vitest'

import { EVAL_FORMAT_VERSION, parseRetrievalSuite, type RetrievalSuite } from '../src/bench/retrieval.js'
import { OVERLAY_BLOCKING_METRIC, formatOverlayRetrievalDeltaText, measureOverlayRetrievalDelta } from '../src/bench/overlay-delta.js'
import { runCli } from '../src/cli/program.js'
import { applyConfigDefaults } from '../src/config/defaults.js'
import { DocBridgeConfigV1Schema, type DocBridgeConfigV1 } from '../src/config/schema.js'
import { discoverRepository } from '../src/discovery/repository.js'
import { sealEnrichmentOverlay, writeEnrichmentOverlay } from '../src/enrich/overlay.js'
import { formatEnrichmentText, runEnrichment, type EnrichmentAgent } from '../src/enrich/stage.js'
import { cacheHitRate, enrichmentCost, enrichmentStability, inventedReferenceCount, overlayProposalIds } from '../src/enrich/stats.js'
import { entityContentHash } from '../src/enrich/validate.js'
import { reconcileKnowledge } from '../src/reconciliation/reconcile.js'
import {
  INVENTED_RELATION_REASONS,
  enrichmentProposalId,
  type AcceptedEnrichment,
  type EnrichmentKind,
  type EnrichmentOverlayV1,
  type EnrichmentProposalV1,
} from '../src/schemas/enrichment.js'
import type { DiscoverySnapshotV1, ReconciliationReportV1 } from '../src/schemas/knowledge.js'

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
const ORIGIN = { agentId: AGENT_ID, agentVersion: '1.0.0', promptVersion: '1' } as const

/**
 * A repository whose ranking for the queries below is known by construction: one module under
 * `src/widget`, an agent corpus that mentions it, and three documents about nothing related.
 */
const repository = (): { root: string; config: DocBridgeConfigV1; configPath: string } => {
  const root = mkdtempSync(join(tmpdir(), 'doc-bridge-overlay-stats-'))
  temporary.push(root)
  write(root, 'package.json', JSON.stringify({ name: 'fixture', version: '0.0.0' }))
  write(root, 'src/widget/build.ts', 'export const buildWidget = (): number => 1\n')
  write(root, 'docs/for-agents/INDEX.md', '# Agent index\n\n- [notes](./notes.md)\n')
  write(root, 'docs/for-agents/notes.md', '---\nid: fixture-notes\neditRoot: src/widget\n---\n# Subsystem notes\n\nThe assembly step is described here, and it produces a widget at the end.\n')
  write(root, 'docs/one.md', '# Release process\n\nHow releases are cut.\n')
  write(root, 'docs/two.md', '# Support rota\n\nWho is on call.\n')
  write(root, 'docs/three.md', '# Glossary\n\nTerms used across the repository.\n')
  const configuration = {
    schemaVersion: 1,
    corpus: { agent: { root: 'docs/for-agents', index: 'docs/for-agents/INDEX.md' } },
    intelligence: { registry: { enabled: true, agentId: AGENT_ID } },
  }
  write(root, 'doc-bridge.config.json', JSON.stringify(configuration))
  return { root, config: applyConfigDefaults(DocBridgeConfigV1Schema.parse(configuration)), configPath: join(root, 'doc-bridge.config.json') }
}

const artifacts = (root: string, config: DocBridgeConfigV1): { snapshot: DiscoverySnapshotV1; report: ReconciliationReportV1 } => {
  const snapshot = discoverRepository({ root, config })
  return { snapshot, report: reconcileKnowledge(snapshot, snapshot, {}) }
}

/** A proposal bound to a snapshot entity, with the identifier the validators recompute. */
const proposalFor = (snapshot: DiscoverySnapshotV1, kind: EnrichmentKind, entity: string, payload: unknown): EnrichmentProposalV1 => {
  const target = snapshot.entities.find((item) => item.id === entity)
  if (!target) throw new Error(`No fixture entity ${entity}.`)
  const targetContentHash = entityContentHash(target)
  return {
    type: 'enrichment-proposal',
    schemaVersion: 1,
    kind,
    entity,
    targetContentHash,
    confidence: 0.8,
    reason: `Fixture ${kind} for ${entity}.`,
    evidence: [{ source: target.evidence[0]!.source, path: target.evidence[0]!.path }],
    origin: ORIGIN,
    baseSnapshotHash: snapshot.contentHash,
    payload,
    proposalId: enrichmentProposalId({ kind, entity, targetContentHash, origin: ORIGIN, payload }),
  } as EnrichmentProposalV1
}

const overlayOf = (snapshot: DiscoverySnapshotV1, accepted: readonly EnrichmentProposalV1[]): EnrichmentOverlayV1 =>
  sealEnrichmentOverlay({
    type: 'enrichment-overlay',
    schemaVersion: 1,
    contentHashAlgo: 'sha256-normalized-v1',
    project: snapshot.project,
    sourceRevision: snapshot.sourceRevision,
    sourceRevisionKind: snapshot.sourceRevisionKind,
    configurationHash: snapshot.configurationHash,
    pipelineVersion: snapshot.pipelineVersion,
    analyzerVersions: snapshot.analyzerVersions,
    baseSnapshotHash: snapshot.contentHash,
    accepted: accepted.map((proposal): AcceptedEnrichment => ({ proposal, acceptedAt: '2026-09-14T00:00:00.000Z', acceptedBy: 'policy' })),
    pending: [],
    rejected: [],
    stats: { byKind: {}, rejectionReasons: {}, inventedReferences: 0, agentRuns: 0, cacheHits: 0, cacheHitRate: 0, packs: 0, inputBytes: 0, outputBytes: 0, wallTimeMs: 0, expired: 0 },
  })

const suiteOf = (name: string, cases: RetrievalSuite['cases']): RetrievalSuite =>
  parseRetrievalSuite({ evalFormatVersion: EVAL_FORMAT_VERSION, name, cases })

/** The module is the second result for `widget`, so three aliased decoys are enough to lose it. */
const MODULE_SUITE = (): RetrievalSuite =>
  suiteOf('overlay-module', [{ id: 'widget-module', input: 'widget', metadata: { expectedTargets: ['src/widget/build.ts'], kind: 'question' } }])

/** A phrase the repository does not contain, so only an accepted alias can answer it. */
const PHRASE_SUITE = (): RetrievalSuite =>
  suiteOf('overlay-phrase', [{ id: 'gizmo', input: 'gizmo handbook', metadata: { expectedTargets: ['docs/for-agents/notes.md'], kind: 'question' } }])

const harmfulOverlay = (snapshot: DiscoverySnapshotV1): EnrichmentOverlayV1 =>
  overlayOf(snapshot, ['docs/one.md', 'docs/two.md', 'docs/three.md'].map((path) => proposalFor(snapshot, 'add-alias', `document:${path}`, { alias: 'widget' })))

const helpfulOverlay = (snapshot: DiscoverySnapshotV1): EnrichmentOverlayV1 =>
  overlayOf(snapshot, [proposalFor(snapshot, 'add-alias', 'document:docs/for-agents/notes.md', { alias: 'gizmo handbook' })])

/**
 * An agent that proposes two usable things and two references the repository does not contain.
 *
 * The invented pair are the point: a relation to a module that does not exist and a canonical
 * marker for an area that does not exist are what "making things up" looks like in this schema.
 */
const stubAgent = (options: { readonly alias: (stem: string) => string; readonly version?: string } = { alias: (stem) => `${stem} guide` }): { call: EnrichmentAgent; version: () => string } => ({
  call: async ({ packs }) =>
    packs.flatMap((pack) => {
      if (pack.target.kind !== 'document') return []
      const stem = (pack.target.path ?? '').split('/').pop()?.replace(/\.md$/, '') ?? pack.target.id
      const origin = { ...ORIGIN, agentVersion: options.version ?? ORIGIN.agentVersion }
      const build = (kind: EnrichmentKind, payload: unknown): unknown => ({
        type: 'enrichment-proposal',
        schemaVersion: 1,
        kind,
        entity: pack.target.id,
        targetContentHash: pack.target.contentHash,
        confidence: 0.9,
        reason: `Fixture ${kind}.`,
        evidence: pack.target.evidence,
        origin,
        baseSnapshotHash: pack.baseSnapshotHash,
        payload,
        proposalId: enrichmentProposalId({ kind, entity: pack.target.id, targetContentHash: pack.target.contentHash, origin, payload }),
      })
      return [
        build('summarize', { summary: `Fixture summary of ${stem}.`, language: 'en' }),
        build('add-alias', { alias: options.alias(stem) }),
        build('propose-relation', { from: pack.target.id, to: 'module:src/nowhere.ts', kind: 'covers', detection: 'invented endpoint' }),
        build('mark-canonical', { scope: 'area:src/nowhere' }),
        // Not an invention, just wrong: an unknown kind must not inflate the invented count.
        { kind: 'rewrite-history', entity: pack.target.id },
      ]
    }),
  version: () => options.version ?? '1.0.0',
})

describe('overlay statistics: what the run cost, and what the agent made up', () => {
  it('reports per-kind counts, a rejection histogram, and invented references counted apart from them', async () => {
    const { root, config } = repository()
    const result = await runEnrichment({ root, config, ...artifacts(root, config), agent: stubAgent(), now: () => '2026-09-14T00:00:00.000Z' })
    const { stats } = result.overlay

    // Every kind the agent proposed is in the histogram, in the bucket its policy and validators put it.
    expect(stats.byKind.summarize).toMatchObject({ proposed: stats.packs, accepted: stats.packs, rejected: 0 })
    expect(stats.byKind['add-alias']).toMatchObject({ accepted: stats.packs })
    expect(stats.byKind['propose-relation']).toMatchObject({ accepted: 0, pending: 0, rejected: stats.packs })
    expect(stats.byKind['mark-canonical']).toMatchObject({ accepted: 0, pending: 0, rejected: stats.packs })
    // `byKind` is sorted, so two runs produce the same bytes.
    expect(Object.keys(stats.byKind)).toEqual([...Object.keys(stats.byKind)].sort())

    // The histogram names the reason, and the invented count is exactly the invented reasons.
    expect(stats.rejectionReasons['unknown-endpoint']).toBe(stats.packs)
    expect(stats.rejectionReasons['unknown-scope']).toBe(stats.packs)
    expect(stats.rejectionReasons['invalid-kind']).toBe(stats.packs)
    expect(stats.inventedReferences).toBe(stats.packs * 2)
    expect(stats.inventedReferences).toBe(inventedReferenceCount(result.overlay.rejected))
    // Counted apart: the unknown kind is a rejection and not an invention.
    expect(result.overlay.rejected.length).toBeGreaterThan(stats.inventedReferences)
    expect(INVENTED_RELATION_REASONS).not.toContain('invalid-kind')

    const text = formatEnrichmentText(result).join('\n')
    expect(text).toContain(`Invented references: ${stats.inventedReferences}`)
    expect(text).toContain('Cost: ')
    expect(text).toContain('Stability: ')
    expect(text).toContain('Rejections: ')
  })

  it('measures cost — agent runs, bytes, cache hit rate, wall time — without putting it in the overlay hash', async () => {
    const { root, config } = repository()
    const ticks = [1_000, 1_750, 5_000, 5_020]
    const clock = (): number => ticks.shift() ?? 9_999
    const first = await runEnrichment({ root, config, ...artifacts(root, config), agent: stubAgent(), now: () => '2026-09-14T00:00:00.000Z', clock })
    expect(first.overlay.stats.wallTimeMs).toBe(750)
    expect(first.overlay.stats.agentRuns).toBeGreaterThan(0)
    expect(first.overlay.stats.inputBytes).toBeGreaterThan(0)
    expect(first.overlay.stats.outputBytes).toBeGreaterThan(0)
    expect(first.overlay.stats.cacheHits).toBe(0)
    expect(first.overlay.stats.cacheHitRate).toBe(0)
    expect(enrichmentCost(first.overlay.stats)).toEqual({
      agentRuns: first.overlay.stats.agentRuns,
      inputBytes: first.overlay.stats.inputBytes,
      outputBytes: first.overlay.stats.outputBytes,
      cacheHits: first.overlay.stats.cacheHits,
      cacheHitRate: 0,
      wallTimeMs: 750,
    })

    // An unchanged repository is answered from the cache: every pack a hit, no agent call, no cost.
    const second = await runEnrichment({ root, config, ...artifacts(root, config), agent: stubAgent(), now: () => '2027-01-01T00:00:00.000Z', clock })
    expect(second.overlay.stats.agentRuns).toBe(0)
    expect(second.overlay.stats.cacheHits).toBe(second.overlay.stats.packs)
    expect(second.overlay.stats.cacheHitRate).toBe(1)
    expect(second.overlay.stats.wallTimeMs).toBe(20)
    expect(second.overlay.stats.inputBytes).toBe(0)

    // Cost differs between the two runs and the overlay hash does not: `stats` is outside it.
    expect(second.overlay.contentHash).toBe(first.overlay.contentHash)
    expect(cacheHitRate(3, 1)).toBe(0.75)
    expect(cacheHitRate(0, 0)).toBe(0)
  })

  it('reports stability as one hash for a deterministic agent and a shared-identifier share otherwise', async () => {
    const { root, config } = repository()
    const first = await runEnrichment({ root, config, ...artifacts(root, config), agent: stubAgent(), now: () => '2026-09-14T00:00:00.000Z' })
    expect(first.stability).toMatchObject({ overlayHashIdentical: false, proposalIdShare: 0 })
    expect(first.stability.previousOverlayHash).toBeUndefined()

    const second = await runEnrichment({ root, config, ...artifacts(root, config), agent: stubAgent(), now: () => '2026-09-14T00:00:00.000Z' })
    expect(second.overlay.contentHash).toBe(first.overlay.contentHash)
    expect(second.stability).toMatchObject({ overlayHashIdentical: true, previousOverlayHash: first.overlay.contentHash, proposalIdShare: 1 })

    // A different agent version proposing different aliases: the hash moves and the share drops.
    const third = await runEnrichment({
      root,
      config,
      ...artifacts(root, config),
      agent: stubAgent({ alias: (stem) => `${stem} handbook`, version: '2.0.0' }),
      now: () => '2026-09-14T00:00:00.000Z',
    })
    expect(third.stability.overlayHashIdentical).toBe(false)
    expect(third.stability.previousOverlayHash).toBe(second.overlay.contentHash)
    expect(third.stability.proposalIdShare).toBeGreaterThan(0)
    expect(third.stability.proposalIdShare).toBeLessThan(1)
    expect(third.stability.sharedProposalIds).toBeGreaterThan(0)

    // The share is over the union, so proposing fewer things does not read as more stable.
    const shrunk = enrichmentStability(
      { ...third.overlay, accepted: third.overlay.accepted.slice(0, 1), pending: [], rejected: [] } as EnrichmentOverlayV1,
      third.overlay,
    )
    expect(shrunk.proposalIdShare).toBeLessThan(1)
    expect(overlayProposalIds(third.overlay).size).toBe(third.stability.proposalIds)
  })
})

describe('overlay retrieval delta: the same suite, the same snapshot, with and without the overlay', () => {
  it('reports an improvement when an accepted alias answers a query nothing else could', () => {
    const { root, config } = repository()
    const snapshot = discoverRepository({ root, config })
    const delta = measureOverlayRetrievalDelta({ root, config, snapshot, overlay: helpfulOverlay(snapshot), suite: PHRASE_SUITE() })

    expect(delta.status).toBe('improved')
    expect(delta.regression).toBe(false)
    expect(delta.withoutOverlay.hitAt3).toBe(0)
    expect(delta.withOverlay.hitAt3).toBe(1)
    expect(delta.gainedCases).toEqual(['gizmo'])
    expect(delta.lostCases).toEqual([])
    expect(delta.deltas.find((entry) => entry.metric === 'hitAt3')).toMatchObject({ delta: 1, improved: true, worsened: false })
    expect(delta.suite).toMatchObject({ name: 'overlay-phrase', caseCount: 1 })
    expect(formatOverlayRetrievalDeltaText(delta).join('\n')).toContain('Cases the overlay gained: gizmo.')
  })

  it('reports an overlay that lowers hit@3 as a regression rather than accepting it silently', () => {
    const { root, config } = repository()
    const snapshot = discoverRepository({ root, config })
    const delta = measureOverlayRetrievalDelta({ root, config, snapshot, overlay: harmfulOverlay(snapshot), suite: MODULE_SUITE() })

    expect(delta.withoutOverlay.hitAt3).toBe(1)
    expect(delta.withOverlay.hitAt3).toBe(0)
    expect(delta.regression).toBe(true)
    expect(delta.status).toBe('regressed')
    expect(delta.lostCases).toEqual(['widget-module'])
    expect(delta.gainedCases).toEqual([])
    expect(delta.deltas.find((entry) => entry.metric === OVERLAY_BLOCKING_METRIC)).toMatchObject({ delta: -1, worsened: true, improved: false })
    expect(delta.overlayHash).toBe(harmfulOverlay(snapshot).contentHash)
    const text = formatOverlayRetrievalDeltaText(delta).join('\n')
    expect(text).toContain('Overlay retrieval delta: regressed')
    expect(text).toContain('This is a finding about the agent, not a new baseline.')
    expect(text).toContain('Cases the overlay lost: widget-module.')
  })

  it('is measured over one snapshot, so nothing but the overlay differs between the two runs', () => {
    const { root, config } = repository()
    const snapshot = discoverRepository({ root, config })
    const suite = MODULE_SUITE()
    const overlay = harmfulOverlay(snapshot)
    const first = measureOverlayRetrievalDelta({ root, config, snapshot, overlay, suite })
    const second = measureOverlayRetrievalDelta({ root, config, snapshot, overlay, suite })
    expect(JSON.stringify(second)).toBe(JSON.stringify(first))
    // The baseline half is the unenriched projection: the overlay on disk cannot leak into it.
    writeEnrichmentOverlay(root, overlay)
    expect(JSON.stringify(measureOverlayRetrievalDelta({ root, config, snapshot, overlay, suite }))).toBe(JSON.stringify(first))
  })
})

describe('ak-docs bench retrieval --overlay', () => {
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

  it('exits non-zero and names the lost case when the overlay on disk regresses the suite', async () => {
    const { root, config, configPath } = repository()
    const snapshot = discoverRepository({ root, config })
    writeEnrichmentOverlay(root, harmfulOverlay(snapshot))
    write(root, 'bench/suite.json', JSON.stringify(MODULE_SUITE()))

    const json = await capture(() => runCli(['bench', 'retrieval', 'bench/suite.json', '--overlay', '--config', configPath, '--json']))
    expect(json.code).toBe(1)
    const payload = JSON.parse(json.out) as { ok: boolean; overlayDelta: { regression: boolean; status: string; lostCases: string[]; deltas: { metric: string }[] } }
    expect(payload.ok).toBe(false)
    expect(payload.overlayDelta).toMatchObject({ regression: true, status: 'regressed', lostCases: ['widget-module'] })
    expect(payload.overlayDelta.deltas.map((entry) => entry.metric)).toContain('hitAt3')

    const text = await capture(() => runCli(['bench', 'retrieval', 'bench/suite.json', '--overlay', '--config', configPath, '--text']))
    expect(text.code).toBe(1)
    expect(text.out).toContain('Overlay retrieval delta: regressed')
    expect(text.out).toContain('hitAt3: 1.000 → 0.000')
  })

  it('exits zero when the overlay helps, and refuses to run with no overlay on disk', async () => {
    const { root, config, configPath } = repository()
    const snapshot = discoverRepository({ root, config })
    write(root, 'bench/suite.json', JSON.stringify(PHRASE_SUITE()))

    const missing = await capture(() => runCli(['bench', 'retrieval', 'bench/suite.json', '--overlay', '--config', configPath, '--json']))
    expect(missing.code).toBe(2)
    expect(missing.err).toContain('No enrichment overlay')

    writeEnrichmentOverlay(root, helpfulOverlay(snapshot))
    const helped = await capture(() => runCli(['bench', 'retrieval', 'bench/suite.json', '--overlay', '--config', configPath, '--json']))
    expect(helped.code).toBe(0)
    const payload = JSON.parse(helped.out) as { ok: boolean; overlayDelta: { status: string; gainedCases: string[] } }
    expect(payload.ok).toBe(true)
    expect(payload.overlayDelta).toMatchObject({ status: 'improved', gainedCases: ['gizmo'] })
  })
})
