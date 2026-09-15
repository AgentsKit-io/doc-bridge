import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'

import { afterEach, describe, expect, it } from 'vitest'

import { applyConfigDefaults } from '../src/config/defaults.js'
import { DocBridgeConfigV1Schema, type DocBridgeConfigV1 } from '../src/config/schema.js'
import { discoverRepository } from '../src/discovery/repository.js'
import {
  approvalsDir,
  createApprovalGateMirror,
  createFileApprovalStore,
  enrichmentApprovalId,
  listApprovals,
  loadApprovalGate,
  type ApprovalGate,
} from '../src/enrich/approvals.js'
import {
  assertObservedSurvive,
  effectiveEnrichment,
  enrichmentOverlayHash,
  enrichmentOverlayPath,
  projectEnrichmentOverlay,
  readEnrichmentOverlay,
  sealEnrichmentOverlay,
  withAcceptedRelations,
  writeEnrichmentOverlay,
} from '../src/enrich/overlay.js'
import { decideEnrichment } from '../src/enrich/review.js'
import {
  applyEnrichmentAdjudication,
  entityContentHash,
  partitionEnrichmentProposals,
  revalidateEnrichmentOverlay,
  validateEnrichmentAdjudication,
  validateEnrichmentProposal,
} from '../src/enrich/validate.js'
import { buildDocBridgeIndex } from '../src/index-builder/build-index.js'
import { sha256NormalizedV1 } from '../src/index-builder/content-hash.js'
import { renderOfflineReport } from '../src/report/html.js'
import { EMPTY_OVERLAY_HASH, projectRetrievalIndex } from '../src/retrieval/project.js'
import { ACCEPTED_SIGNALS_SHARE, ACCEPTED_SIGNALS_WEIGHT, rankRetrieval } from '../src/retrieval/rank.js'
import {
  AcceptedEnrichmentSchema,
  ENRICHMENT_KINDS,
  ENRICHMENT_POLICY,
  enrichmentAdjudicationId,
  enrichmentProposalId,
  type AcceptedEnrichment,
  type EnrichmentKind,
  type EnrichmentOverlayV1,
  type EnrichmentProposalV1,
  type PendingEnrichment,
} from '../src/schemas/enrichment.js'
import { DiscoverySnapshotV1Schema, ReconciliationReportV1Schema, type DiscoverySnapshotV1, type KnowledgeEntity, type ReconciliationReportV1 } from '../src/schemas/knowledge.js'

const temporary: string[] = []
afterEach(() => {
  for (const directory of temporary) rmSync(directory, { recursive: true, force: true })
  temporary.length = 0
})

const fileHash = (text: string): string => sha256NormalizedV1(text)

/** A hand-built snapshot: one package, two areas, two modules, three documents, a few edges. */
const fixtureSnapshot = (): { snapshot: DiscoverySnapshotV1; report: ReconciliationReportV1 } => {
  const entity = (id: string, kind: string, path: string | undefined, extra: Partial<KnowledgeEntity> = {}, hashText?: string): KnowledgeEntity => ({
    id,
    kind,
    name: extra.name ?? id.split(':').pop() ?? id,
    ...(path ? { path } : {}),
    provenance: 'observed',
    evidence: [{ source: kind === 'document' ? 'documentation' : 'code', path: path ?? '.', ...(hashText !== undefined ? { contentHash: fileHash(hashText) } : {}) }],
    ...(extra.metadata ? { metadata: extra.metadata } : {}),
    ...(extra.aliases ? { aliases: extra.aliases } : {}),
  })
  const entities: KnowledgeEntity[] = [
    entity('package:fixture', 'package', 'package.json', { name: 'fixture' }, '{"name":"fixture"}'),
    entity('area:src/query', 'area', 'src/query'),
    entity('area:src/ranking', 'area', 'src/ranking'),
    entity('module:src/query/search.ts', 'module', 'src/query/search.ts', { metadata: { exports: ['searchIndex'] } }, 'export const searchIndex = 1'),
    entity('module:src/ranking/bm25.ts', 'module', 'src/ranking/bm25.ts', { metadata: { exports: ['rank'] } }, 'export const rank = 2'),
    entity('document:docs/query.md', 'document', 'docs/query.md', { metadata: { title: 'Query', summary: 'Deterministic search over the index.', classification: 'human' } }, '# Query\n\nDeterministic search over the index.\n'),
    entity('document:docs/ranking.md', 'document', 'docs/ranking.md', { metadata: { title: 'Ranking', classification: 'human' } }, '# Ranking\n\nScores.\n'),
    entity('document:docs/mention.md', 'document', 'docs/mention.md', { metadata: { title: 'Mention', classification: 'human' } }, '# Mention\n'),
    entity('document:docs/copy.md', 'document', 'docs/copy.md', { metadata: { title: 'Copy', classification: 'human' } }, '# Mention\n'),
  ]
  const relation = (from: string, kind: string, to: string, path: string) => ({ id: `relation:${from}|${kind}|${to}`, kind, from, to, provenance: 'observed' as const, evidence: [{ source: 'code' as const, path, lineStart: 1, lineEnd: 1 }] })
  const relations = [
    relation('package:fixture', 'contains', 'area:src/query', 'package.json'),
    relation('package:fixture', 'contains', 'area:src/ranking', 'package.json'),
    relation('area:src/query', 'contains', 'module:src/query/search.ts', 'src/query/search.ts'),
    relation('area:src/ranking', 'contains', 'module:src/ranking/bm25.ts', 'src/ranking/bm25.ts'),
    relation('module:src/query/search.ts', 'imports', 'module:src/ranking/bm25.ts', 'src/query/search.ts'),
    relation('document:docs/query.md', 'covers', 'area:src/query', 'docs/query.md'),
    relation('document:docs/ranking.md', 'mentions', 'module:src/ranking/bm25.ts', 'docs/ranking.md'),
    relation('document:docs/mention.md', 'links-to', 'document:docs/query.md', 'docs/mention.md'),
  ]
  const base = { schemaVersion: 1 as const, contentHash: '0'.repeat(64), contentHashAlgo: 'sha256-normalized-v1' as const, project: { name: 'fixture' }, sourceRevision: 'rev-1', sourceRevisionKind: 'content' as const, configurationHash: 'b'.repeat(64), pipelineVersion: '1.0.0', analyzerVersions: { 'js-ts': '1.0.0' } }
  const draft = { type: 'discovery-snapshot' as const, ...base, entities, relations, coverage: [] }
  const snapshot = DiscoverySnapshotV1Schema.parse({ ...draft, contentHash: sha256NormalizedV1({ ...draft, contentHash: undefined }) })
  const reportDraft = {
    type: 'reconciliation-report' as const,
    ...base,
    snapshotHash: snapshot.contentHash,
    diagnostics: [{ id: 'd1', code: 'DOC_ORPHANED', status: 'undocumented' as const, severity: 'warn' as const, message: 'Mention is not linked from code.', evidence: [{ source: 'documentation' as const, path: 'docs/mention.md', lineStart: 1, lineEnd: 1 }], entityIds: ['document:docs/mention.md'] }],
    summary: { entityCount: entities.length, relationCount: relations.length, diagnosticCount: 1 },
  }
  const report = ReconciliationReportV1Schema.parse({ ...reportDraft, contentHash: sha256NormalizedV1({ ...reportDraft, contentHash: undefined }) })
  return { snapshot, report }
}

const CURATOR = { agentId: 'curator-agent', agentVersion: '1.0.0', promptVersion: '1' }
const REVIEWER = { agentId: 'reviewer-agent', agentVersion: '1.0.0', promptVersion: '1' }
const JUDGE = { agentId: 'judge-agent', agentVersion: '1.0.0', promptVersion: '1' }

type Overrides = Partial<Record<string, unknown>>

/** A proposal about `entity`, correctly bound to the snapshot; `overrides` can break any part of it. */
const proposalFor = (snapshot: DiscoverySnapshotV1, kind: EnrichmentKind, entity: string, payload: unknown, overrides: Overrides = {}, origin = CURATOR): Record<string, unknown> => {
  const target = snapshot.entities.find((item) => item.id === entity)
  const targetContentHash = (overrides.targetContentHash as string | undefined) ?? (target ? entityContentHash(target) : 'c'.repeat(64))
  const evidence = target ? [{ source: target.evidence[0]!.source, path: target.evidence[0]!.path }] : [{ source: 'code', path: 'nowhere.ts' }]
  const base = {
    type: 'enrichment-proposal',
    schemaVersion: 1,
    kind,
    entity,
    targetContentHash,
    confidence: 0.8,
    reason: `Proposed ${kind} for ${entity}.`,
    evidence,
    origin,
    baseSnapshotHash: snapshot.contentHash,
    payload,
    ...overrides,
  }
  const proposalId = (overrides.proposalId as string | undefined) ?? enrichmentProposalId({ kind, entity, targetContentHash, origin: origin, payload })
  return { ...base, proposalId }
}

/** One valid and at least one rejected fixture per kind. */
const kindFixtures = (snapshot: DiscoverySnapshotV1): Record<EnrichmentKind, { valid: Record<string, unknown>; rejected: { proposal: Record<string, unknown>; reason: string }[] }> => ({
  'classify-document': {
    valid: proposalFor(snapshot, 'classify-document', 'document:docs/ranking.md', { type: 'guide', audience: 'human', lifecycle: 'active', criticality: 'tier-2' }),
    rejected: [
      { proposal: proposalFor(snapshot, 'classify-document', 'module:src/query/search.ts', { type: 'guide', audience: 'human', lifecycle: 'active', criticality: 'tier-2' }), reason: 'entity-kind' },
      { proposal: proposalFor(snapshot, 'classify-document', 'document:docs/ranking.md', { type: 'novel', audience: 'human', lifecycle: 'active', criticality: 'tier-2' }), reason: 'schema' },
    ],
  },
  summarize: {
    valid: proposalFor(snapshot, 'summarize', 'document:docs/ranking.md', { summary: 'How scores are computed.', language: 'en' }),
    rejected: [
      { proposal: proposalFor(snapshot, 'summarize', 'document:docs/query.md', { summary: 'Deterministic search over the index.', language: 'en' }), reason: 'summary-unchanged' },
      { proposal: proposalFor(snapshot, 'summarize', 'document:docs/ranking.md', { summary: 'Use api_key=sk-live-abcdefghijklmnop to call it.', language: 'en' }), reason: 'redaction' },
      { proposal: proposalFor(snapshot, 'summarize', 'document:docs/ranking.md', { summary: 'x'.repeat(401), language: 'en' }), reason: 'schema' },
    ],
  },
  'add-alias': {
    valid: proposalFor(snapshot, 'add-alias', 'document:docs/ranking.md', { alias: 'scoring guide' }),
    rejected: [
      { proposal: proposalFor(snapshot, 'add-alias', 'document:docs/ranking.md', { alias: 'Ranking' }), reason: 'alias-collision' },
      { proposal: proposalFor(snapshot, 'add-alias', 'document:docs/ranking.md', { alias: 'rankin' }), reason: 'alias-collision' },
      { proposal: proposalFor(snapshot, 'add-alias', 'document:docs/ranking.md', { alias: 'a'.repeat(65) }), reason: 'schema' },
    ],
  },
  'add-intent': {
    valid: proposalFor(snapshot, 'add-intent', 'document:docs/query.md', { phrase: 'how do I search the index', language: 'en' }),
    rejected: [
      { proposal: proposalFor(snapshot, 'add-intent', 'document:docs/query.md', { phrase: 'how do I search the index' }), reason: 'schema' },
      { proposal: proposalFor(snapshot, 'add-intent', 'document:docs/query.md', { phrase: 'x'.repeat(121), language: 'en' }), reason: 'schema' },
    ],
  },
  'mark-canonical': {
    valid: proposalFor(snapshot, 'mark-canonical', 'document:docs/query.md', { scope: 'area:src/query' }),
    rejected: [
      { proposal: proposalFor(snapshot, 'mark-canonical', 'document:docs/query.md', { scope: 'area:src/missing' }), reason: 'unknown-scope' },
      { proposal: proposalFor(snapshot, 'mark-canonical', 'module:src/query/search.ts', { scope: 'area:src/query' }), reason: 'entity-kind' },
    ],
  },
  'propose-relation': {
    valid: proposalFor(snapshot, 'propose-relation', 'document:docs/ranking.md', { from: 'document:docs/ranking.md', to: 'area:src/ranking', kind: 'covers', detection: 'prose describes the ranking area' }, {}, REVIEWER),
    rejected: [
      { proposal: proposalFor(snapshot, 'propose-relation', 'document:docs/ranking.md', { from: 'document:docs/ranking.md', to: 'module:src/ranking/bm25.ts', kind: 'mentions', detection: 'already there' }, {}, REVIEWER), reason: 'relation-already-observed' },
      { proposal: proposalFor(snapshot, 'propose-relation', 'document:docs/ranking.md', { from: 'document:docs/ranking.md', to: 'module:src/nowhere.ts', kind: 'covers', detection: 'invented' }, {}, REVIEWER), reason: 'unknown-endpoint' },
      { proposal: proposalFor(snapshot, 'propose-relation', 'document:docs/ranking.md', { from: 'document:docs/ranking.md', to: 'area:src/ranking', kind: 'covers', detection: 'x' }, { evidence: [{ source: 'documentation', path: 'docs/mention.md', lineStart: 1, lineEnd: 1 }] }, REVIEWER), reason: 'evidence-outside-endpoints' },
      { proposal: proposalFor(snapshot, 'propose-relation', 'document:docs/ranking.md', { from: 'document:docs/ranking.md', to: 'area:src/ranking', kind: 'imports', detection: 'x' }, {}, REVIEWER), reason: 'schema' },
    ],
  },
  'flag-contradiction': {
    valid: proposalFor(snapshot, 'flag-contradiction', 'document:docs/ranking.md', { against: 'module:src/ranking/bm25.ts', claim: 'scores are cached', observed: 'no cache in bm25.ts' }, { evidence: [{ source: 'documentation', path: 'docs/ranking.md' }, { source: 'code', path: 'src/ranking/bm25.ts' }] }, REVIEWER),
    rejected: [
      { proposal: proposalFor(snapshot, 'flag-contradiction', 'document:docs/ranking.md', { against: 'module:src/ranking/bm25.ts', claim: 'a', observed: 'b' }, {}, REVIEWER), reason: 'evidence-missing-for-endpoint' },
      { proposal: proposalFor(snapshot, 'flag-contradiction', 'document:docs/ranking.md', { against: 'module:src/gone.ts', claim: 'a', observed: 'b' }, {}, REVIEWER), reason: 'unknown-endpoint' },
    ],
  },
  'flag-redundancy': {
    valid: proposalFor(snapshot, 'flag-redundancy', 'document:docs/ranking.md', { with: 'document:docs/query.md' }),
    rejected: [
      { proposal: proposalFor(snapshot, 'flag-redundancy', 'document:docs/mention.md', { with: 'document:docs/copy.md' }), reason: 'already-duplicate' },
      { proposal: proposalFor(snapshot, 'flag-redundancy', 'document:docs/ranking.md', { with: 'module:src/ranking/bm25.ts' }), reason: 'entity-kind' },
    ],
  },
  'flag-gap': {
    valid: proposalFor(snapshot, 'flag-gap', 'area:src/ranking', { area: 'area:src/ranking', missing: 'No document explains the scoring parameters.' }),
    rejected: [{ proposal: proposalFor(snapshot, 'flag-gap', 'area:src/ranking', { area: 'module:src/ranking/bm25.ts', missing: 'x' }), reason: 'unknown-scope' }],
  },
  'rank-hint': {
    valid: proposalFor(snapshot, 'rank-hint', 'document:docs/query.md', { relevance: 'strong' }),
    rejected: [
      { proposal: proposalFor(snapshot, 'rank-hint', 'document:docs/query.md', { relevance: 'huge' }), reason: 'schema' },
      { proposal: proposalFor(snapshot, 'rank-hint', 'document:docs/nowhere.md', { relevance: 'weak' }), reason: 'unknown-entity' },
    ],
  },
  'suggest-area': {
    valid: proposalFor(snapshot, 'suggest-area', 'package:fixture', { directories: ['docs'], name: 'documentation' }, {}, REVIEWER),
    rejected: [
      { proposal: proposalFor(snapshot, 'suggest-area', 'package:fixture', { directories: ['src/query'], name: 'query' }, {}, REVIEWER), reason: 'area-overlap' },
      { proposal: proposalFor(snapshot, 'suggest-area', 'package:fixture', { directories: ['lib'], name: 'lib' }, {}, REVIEWER), reason: 'unknown-directory' },
    ],
  },
})

const accepted = (proposal: EnrichmentProposalV1, by = 'policy'): AcceptedEnrichment => ({ proposal, acceptedAt: '2026-09-14T00:00:00.000Z', acceptedBy: by })
const pendingEntry = (proposal: EnrichmentProposalV1, note?: PendingEnrichment['note']): PendingEnrichment => ({ proposal, approvalId: enrichmentApprovalId(proposal.proposalId, proposal.targetContentHash), ...(note ? { note } : {}) })

const overlayFor = (snapshot: DiscoverySnapshotV1, entries: { accepted?: AcceptedEnrichment[]; pending?: PendingEnrichment[] }): EnrichmentOverlayV1 =>
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
    accepted: entries.accepted ?? [],
    pending: entries.pending ?? [],
    rejected: [],
    stats: { byKind: {}, rejectionReasons: {}, inventedReferences: 0, agentRuns: 0, cacheHits: 0, cacheHitRate: 0, packs: 0, inputBytes: 0, outputBytes: 0, wallTimeMs: 0, expired: 0 },
  })

const temp = (prefix: string): string => {
  const root = mkdtempSync(join(tmpdir(), prefix))
  temporary.push(root)
  return root
}

describe('typed proposals: one validator, one valid fixture and one rejection fixture per kind', () => {
  const { snapshot, report } = fixtureSnapshot()
  const fixtures = kindFixtures(snapshot)

  for (const kind of ENRICHMENT_KINDS) {
    it(`${kind}: the valid fixture lands where its policy says, and the rejections name their reason`, () => {
      const { valid, rejected } = fixtures[kind]
      const verdict = validateEnrichmentProposal(valid, { snapshot, report })
      expect(verdict.status).toBe(ENRICHMENT_POLICY[kind] === 'human' ? 'pending' : 'accepted')
      expect(rejected.length).toBeGreaterThan(0)
      for (const { proposal, reason } of rejected) {
        const result = validateEnrichmentProposal(proposal, { snapshot, report })
        expect(result.status, `${kind} ${reason}`).toBe('rejected')
        if (result.status === 'rejected') expect(result.rejection.reason, `${kind}: ${result.rejection.detail ?? ''}`).toBe(reason)
      }
    })
  }

  it('rejects at the boundary: no evidence, unknown entity, unknown diagnostic, outside evidence, stale target, wrong base', () => {
    const base = fixtures.summarize.valid
    const reasonOf = (proposal: Record<string, unknown>): string => {
      const verdict = validateEnrichmentProposal(proposal, { snapshot, report })
      return verdict.status === 'rejected' ? verdict.rejection.reason : verdict.status
    }
    expect(reasonOf({ ...base, evidence: [] })).toBe('no-evidence')
    expect(reasonOf(proposalFor(snapshot, 'summarize', 'document:docs/nowhere.md', { summary: 'x', language: 'en' }))).toBe('unknown-entity')
    expect(reasonOf(proposalFor(snapshot, 'summarize', 'document:docs/ranking.md', { summary: 'x', language: 'en' }, { relatedDiagnosticIds: ['d-missing'] }))).toBe('unknown-diagnostic')
    expect(reasonOf(proposalFor(snapshot, 'summarize', 'document:docs/ranking.md', { summary: 'x', language: 'en' }, { relatedDiagnosticIds: ['d1'] }))).toBe('accepted')
    expect(reasonOf(proposalFor(snapshot, 'summarize', 'document:docs/ranking.md', { summary: 'x', language: 'en' }, { evidence: [{ source: 'code', path: 'src/invented.ts' }] }))).toBe('evidence-outside-artifacts')
    expect(reasonOf(proposalFor(snapshot, 'summarize', 'document:docs/ranking.md', { summary: 'x', language: 'en' }, { targetContentHash: 'e'.repeat(64) }))).toBe('stale-target')
    expect(reasonOf(proposalFor(snapshot, 'summarize', 'document:docs/ranking.md', { summary: 'x', language: 'en' }, { baseSnapshotHash: 'e'.repeat(64) }))).toBe('base-snapshot-mismatch')
    expect(reasonOf(proposalFor(snapshot, 'summarize', 'document:docs/ranking.md', { summary: 'x', language: 'en' }, { proposalId: 'f'.repeat(64) }))).toBe('proposal-id-mismatch')
    expect(reasonOf('not an object' as unknown as Record<string, unknown>)).toBe('schema')
  })

  it('rejects an unknown kind as invalid-kind rather than passing it through', () => {
    const verdict = validateEnrichmentProposal({ ...fixtures.summarize.valid, kind: 'rewrite-history' }, { snapshot, report })
    expect(verdict.status).toBe('rejected')
    if (verdict.status === 'rejected') {
      expect(verdict.rejection.reason).toBe('invalid-kind')
      expect(verdict.rejection.kind).toBe('rewrite-history')
    }
    const partition = partitionEnrichmentProposals([{ kind: 'rewrite-history' }, fixtures.summarize.valid], { snapshot, report })
    expect(partition.rejected.map((entry) => entry.reason)).toEqual(['invalid-kind'])
    expect(partition.accepted).toHaveLength(1)
  })

  it('derives proposalId from content, so a re-run produces no duplicate entries', () => {
    const batch = [fixtures.summarize.valid, fixtures['add-alias'].valid, fixtures['mark-canonical'].valid]
    const first = partitionEnrichmentProposals(batch, { snapshot, report })
    const again = partitionEnrichmentProposals([...batch, ...batch], { snapshot, report })
    expect(again).toEqual(first)
    expect(first.accepted).toHaveLength(2)
    expect(first.pending).toHaveLength(1)
    // The same content from the same agent and prompt is the same id; a different alias is a different one.
    expect(enrichmentProposalId(fixtures.summarize.valid as never)).toBe(fixtures.summarize.valid.proposalId)
    expect(proposalFor(snapshot, 'add-alias', 'document:docs/ranking.md', { alias: 'other' }).proposalId).not.toBe(fixtures['add-alias'].valid.proposalId)
    // An entry already stored is not re-accepted.
    const stored = partitionEnrichmentProposals(batch, { snapshot, report, existing: { accepted: first.accepted.map((proposal) => accepted(proposal)) } })
    expect(stored.accepted).toHaveLength(0)
  })

  it('reports a canonical conflict on both markers, and refuses a second canonical once one is accepted', () => {
    const first = fixtures['mark-canonical'].valid
    const second = proposalFor(snapshot, 'mark-canonical', 'document:docs/ranking.md', { scope: 'area:src/query' })
    const partition = partitionEnrichmentProposals([first, second], { snapshot, report })
    expect(partition.pending.map((entry) => entry.note)).toEqual(['canonical-conflict', 'canonical-conflict'])
    const afterAccept = validateEnrichmentProposal(second, { snapshot, report, existing: { accepted: [accepted(first as never, 'reviewer')] } })
    expect(afterAccept.status === 'rejected' && afterAccept.rejection.reason).toBe('canonical-conflict')
  })
})

describe('the overlay', () => {
  const { snapshot, report } = fixtureSnapshot()
  const fixtures = kindFixtures(snapshot)

  it('expires an accepted entry when its target content hash changes, and its siblings survive', () => {
    const overlay = overlayFor(snapshot, { accepted: [accepted(fixtures.summarize.valid as never), accepted(fixtures['add-alias'].valid as never), accepted(fixtures['rank-hint'].valid as never)] })
    const changed: DiscoverySnapshotV1 = {
      ...snapshot,
      entities: snapshot.entities.map((entity) => (entity.id === 'document:docs/ranking.md' ? { ...entity, evidence: [{ ...entity.evidence[0]!, contentHash: fileHash('# Ranking\n\nRewritten.\n') }] } : entity)),
    }
    const { live, expired } = effectiveEnrichment(overlay, changed)
    expect(expired.map((entry) => entry.proposal.kind).sort()).toEqual(['add-alias', 'summarize'])
    expect(live.map((entry) => entry.proposal.kind)).toEqual(['rank-hint'])
    const projected = projectEnrichmentOverlay(overlay, changed)
    expect(projected?.aliases).toBeUndefined()
    expect(projected?.signals?.get('document:docs/query.md')).toBe(1)
    expect(projected?.hash).toBe(enrichmentOverlayHash(live))
    // Unchanged snapshot: everything is live.
    expect(effectiveEnrichment(overlay, snapshot).expired).toEqual([])
  })

  it('never rewrites the overlay file on a read', () => {
    const root = temp('doc-bridge-overlay-read-')
    const overlay = overlayFor(snapshot, { accepted: [accepted(fixtures.summarize.valid as never)] })
    const path = writeEnrichmentOverlay(root, overlay)
    const before = readFileSync(path, 'utf8')
    const stamp = statSync(path).mtimeMs
    const read = readEnrichmentOverlay(root)
    expect(read?.contentHash).toBe(overlay.contentHash)
    projectEnrichmentOverlay(read, { entities: [] })
    effectiveEnrichment(read as EnrichmentOverlayV1, { entities: [] })
    expect(readFileSync(path, 'utf8')).toBe(before)
    expect(statSync(path).mtimeMs).toBe(stamp)
    // A corrupt file is no overlay, not an error.
    writeFileSync(path, '{"type":"enrichment-overlay"', 'utf8')
    expect(readEnrichmentOverlay(root)).toBeUndefined()
    writeFileSync(path, JSON.stringify({ ...overlay, contentHash: 'a'.repeat(64) }), 'utf8')
    expect(readEnrichmentOverlay(root)).toBeUndefined()
  })

  it('re-running the validators over a stored overlay reproduces the same partition', () => {
    const raws = [fixtures.summarize.valid, fixtures['add-alias'].valid, fixtures['mark-canonical'].valid, fixtures['propose-relation'].valid, fixtures['flag-gap'].valid]
    const partition = partitionEnrichmentProposals(raws, { snapshot, report })
    const overlay = overlayFor(snapshot, {
      accepted: partition.accepted.map((proposal) => accepted(proposal)),
      pending: partition.pending.map((entry) => pendingEntry(entry.proposal, entry.note)),
    })
    const again = revalidateEnrichmentOverlay(overlay, { snapshot, report })
    expect(again.accepted).toEqual(overlay.accepted.map((entry) => entry.proposal.proposalId))
    expect(again.pending).toEqual(overlay.pending.map((entry) => entry.proposal.proposalId))
    expect(again.rejected).toEqual([])
    // The hash is over the decisions, not the timestamps.
    const later = overlayFor(snapshot, { ...overlay, accepted: overlay.accepted.map((entry) => ({ ...entry, acceptedAt: '2030-01-01T00:00:00.000Z' })) })
    expect(later.contentHash).toBe(overlay.contentHash)
  })

  it('refuses acceptedBy policy for a human-approval kind and an author approving itself', () => {
    const canonical = fixtures['mark-canonical'].valid as never as EnrichmentProposalV1
    expect(AcceptedEnrichmentSchema.safeParse(accepted(canonical, 'policy')).success).toBe(false)
    expect(AcceptedEnrichmentSchema.safeParse(accepted(canonical, CURATOR.agentId)).success).toBe(false)
    expect(AcceptedEnrichmentSchema.safeParse(accepted(canonical, 'a person')).success).toBe(true)
    expect(AcceptedEnrichmentSchema.safeParse(accepted(fixtures.summarize.valid as never, 'policy')).success).toBe(true)
  })

  it('rejects an adjudication whose origin matches a proposal it judges, and applies a valid one without accepting anything', () => {
    const first = fixtures['mark-canonical'].valid as never as EnrichmentProposalV1
    const second = proposalFor(snapshot, 'mark-canonical', 'document:docs/ranking.md', { scope: 'area:src/query' }) as never as EnrichmentProposalV1
    const pending = [pendingEntry(first, 'canonical-conflict'), pendingEntry(second, 'canonical-conflict')]
    const adjudication = (origin: typeof JUDGE) => {
      const draft = { type: 'enrichment-adjudication', schemaVersion: 1, judges: [first.proposalId, second.proposalId], keep: [first.proposalId], reason: 'query.md covers the area; ranking.md only mentions it.', origin }
      return { ...draft, adjudicationId: enrichmentAdjudicationId(draft as never) }
    }
    const self = validateEnrichmentAdjudication(adjudication(CURATOR), pending)
    expect(self.status === 'rejected' && self.reason).toBe('self-adjudication')
    const verdict = validateEnrichmentAdjudication(adjudication(JUDGE), pending)
    expect(verdict.status).toBe('accepted')
    if (verdict.status !== 'accepted') return
    const applied = applyEnrichmentAdjudication(pending, verdict.adjudication)
    expect(applied.pending.map((entry) => [entry.proposal.proposalId, entry.note])).toEqual([[first.proposalId, undefined]])
    expect(applied.rejected.map((entry) => [entry.proposalId, entry.reason])).toEqual([[second.proposalId, 'adjudicated']])
    expect(validateEnrichmentAdjudication({ ...adjudication(JUDGE), judges: ['f'.repeat(64)] }, pending).status).toBe('rejected')
  })
})

describe('approvals through the ecosystem gate', () => {
  const { snapshot } = fixtureSnapshot()
  const fixtures = kindFixtures(snapshot)

  it('records every approval against the proposal hash and the target content hash, through @agentskit/core/hitl', async () => {
    const root = temp('doc-bridge-approvals-')
    const canonical = fixtures['mark-canonical'].valid as never as EnrichmentProposalV1
    writeEnrichmentOverlay(root, overlayFor(snapshot, { pending: [pendingEntry(canonical)] }))
    const { source } = await loadApprovalGate(createFileApprovalStore(approvalsDir(root)))
    expect(source).toBe('ecosystem')

    const decided = await decideEnrichment({ root, proposalId: canonical.proposalId, decision: 'approved', by: 'a person', snapshot })
    expect(decided.gateSource).toBe('ecosystem')
    expect(decided.approvalId).toBe(enrichmentApprovalId(canonical.proposalId, canonical.targetContentHash))
    expect(decided.approvalId).toBe(sha256NormalizedV1({ proposalId: canonical.proposalId, targetContentHash: canonical.targetContentHash }))
    const records = listApprovals(approvalsDir(root))
    expect(records).toHaveLength(1)
    expect(records[0]).toMatchObject({ id: decided.approvalId, name: 'doc-bridge.enrichment', status: 'approved', decisionMetadata: { by: 'a person', proposalId: canonical.proposalId, targetContentHash: canonical.targetContentHash } })
    const overlay = readEnrichmentOverlay(root)
    expect(overlay?.accepted.map((entry) => [entry.proposal.proposalId, entry.acceptedBy, entry.approvalId])).toEqual([[canonical.proposalId, 'a person', decided.approvalId]])
    expect(overlay?.pending).toEqual([])
    // Deciding twice is refused by the gate, and the overlay is untouched.
    writeEnrichmentOverlay(root, overlayFor(snapshot, { pending: [pendingEntry(canonical)] }))
    await expect(decideEnrichment({ root, proposalId: canonical.proposalId, decision: 'rejected', by: 'someone else' })).rejects.toThrow('already approved')
  })

  it('rejects a proposal whose author identity equals the approver, and policy as an approver', async () => {
    const root = temp('doc-bridge-self-approval-')
    const canonical = fixtures['mark-canonical'].valid as never as EnrichmentProposalV1
    writeEnrichmentOverlay(root, overlayFor(snapshot, { pending: [pendingEntry(canonical)] }))
    await expect(decideEnrichment({ root, proposalId: canonical.proposalId, decision: 'approved', by: CURATOR.agentId })).rejects.toThrow('cannot approve its own output')
    await expect(decideEnrichment({ root, proposalId: canonical.proposalId, decision: 'approved', by: 'policy' })).rejects.toThrow('requires a person')
    expect(listApprovals(approvalsDir(root))).toEqual([])
    expect(readEnrichmentOverlay(root)?.pending).toHaveLength(1)
    // A stale proposal cannot be approved against a changed entity.
    const changed = { entities: snapshot.entities.map((entity) => (entity.id === canonical.entity ? { ...entity, evidence: [{ ...entity.evidence[0]!, contentHash: 'd'.repeat(64) }] } : entity)) }
    await expect(decideEnrichment({ root, proposalId: canonical.proposalId, decision: 'approved', by: 'a person', snapshot: changed })).rejects.toThrow('stale')
    // A rejection records too, with the reason.
    const rejected = await decideEnrichment({ root, proposalId: canonical.proposalId.slice(0, 12), decision: 'rejected', by: 'a person', reason: 'not canonical' })
    expect(rejected.entry).toMatchObject({ reason: 'human-rejected', detail: 'a person: not canonical' })
  })

  it('writes the same records through the mirror and the real gate', async () => {
    const root = temp('doc-bridge-gate-mirror-')
    const store = createFileApprovalStore(join(root, 'approvals'))
    const mirror: ApprovalGate = createApprovalGateMirror(store)
    const { gate: real, source } = await loadApprovalGate(store)
    expect(source).toBe('ecosystem')
    const id = sha256NormalizedV1('shared')
    const requested = await mirror.request({ id, name: 'doc-bridge.enrichment', payload: { proposalId: 'p' } })
    expect((await real.request({ id, name: 'doc-bridge.enrichment', payload: { proposalId: 'q' } })).payload).toEqual(requested.payload)
    const decided = await real.decide(id, 'approved', { by: 'reviewer' })
    expect((await mirror.await(id, { timeoutMs: 100 })).status).toBe('approved')
    expect(await store.get(id)).toMatchObject({ id, status: 'approved', decisionMetadata: decided.decisionMetadata })
  })
})

describe('bounded influence and the projection', () => {
  const { snapshot } = fixtureSnapshot()
  const fixtures = kindFixtures(snapshot)
  const config = applyConfigDefaults(DocBridgeConfigV1Schema.parse({ schemaVersion: 1, corpus: { agent: { root: 'docs' } } }))

  it('gives accepted signals at most 15 percent of the identity boost, and an exact id match still wins', () => {
    expect(ACCEPTED_SIGNALS_SHARE).toBe(0.15)
    expect(ACCEPTED_SIGNALS_WEIGHT).toBe(30)
    // Both documents match "query" lexically; the overlay pushes ranking.md as hard as it can.
    const boosted: DiscoverySnapshotV1 = {
      ...snapshot,
      entities: snapshot.entities.map((entity) =>
        entity.id === 'document:docs/ranking.md' ? { ...entity, metadata: { ...entity.metadata, title: 'Query ranking', summary: 'query query' } } : entity.id === 'document:docs/query.md' ? { ...entity, aliases: ['query'] } : entity,
      ),
    }
    const plain = projectRetrievalIndex({ snapshot: boosted, config })
    const withSignal = projectRetrievalIndex({ snapshot: boosted, config, overlay: { hash: 'a'.repeat(64), signals: new Map([['document:docs/ranking.md', 1]]) } })
    const ranked = rankRetrieval(withSignal, 'query', { floor: 0 })
    expect(ranked[0]?.entry.id).toBe('document:docs/query.md')
    expect(ranked[0]?.explanation.components.exactId).toBeGreaterThanOrEqual(200)
    const boostedEntry = ranked.find((item) => item.entry.id === 'document:docs/ranking.md')
    expect(boostedEntry?.explanation.components.acceptedAgentSignals).toBe(30)
    expect(withSignal.entries.find((entry) => entry.id === 'document:docs/ranking.md')?.agentSignal).toBe(1)
    // The signal only ever reorders: every other component is identical with and without it.
    const unboosted = rankRetrieval(plain, 'query', { floor: 0 }).find((item) => item.entry.id === 'document:docs/ranking.md')
    expect(unboosted && boostedEntry && boostedEntry.score - unboosted.score).toBe(30)
  })

  it('ranks identically without an overlay: no signals, no weight, byte for byte', () => {
    const index = projectRetrievalIndex({ snapshot, config })
    expect(index.overlayHash).toBe(EMPTY_OVERLAY_HASH)
    expect(index.entries.every((entry) => entry.agentSignal === undefined)).toBe(true)
    const explicit = projectRetrievalIndex({ snapshot, config, overlay: { hash: EMPTY_OVERLAY_HASH } })
    expect(JSON.stringify(explicit)).toBe(JSON.stringify(index))
    expect(JSON.stringify(rankRetrieval(index, 'ranking'))).toBe(JSON.stringify(rankRetrieval(explicit, 'ranking')))
    expect(projectEnrichmentOverlay(undefined, snapshot)).toBeUndefined()
    expect(projectEnrichmentOverlay(overlayFor(snapshot, {}), snapshot)?.hash).toBe(EMPTY_OVERLAY_HASH)
  })

  it('projects accepted relations with provenance proposed, aliases, summaries and intents, and removes nothing observed', () => {
    const relation = fixtures['propose-relation'].valid as never as EnrichmentProposalV1
    const overlay = overlayFor(snapshot, {
      accepted: [accepted(relation, 'a person'), accepted(fixtures['add-alias'].valid as never), accepted(fixtures.summarize.valid as never), accepted(fixtures['add-intent'].valid as never), accepted(fixtures['mark-canonical'].valid as never, 'a person')],
    })
    const input = projectEnrichmentOverlay(overlay, snapshot)
    expect(input?.relations?.map((item) => [item.kind, item.from, item.to, item.provenance])).toEqual([['covers', 'document:docs/ranking.md', 'area:src/ranking', 'proposed']])
    const index = projectRetrievalIndex({ snapshot, config, overlay: input })
    const ranking = index.entries.find((entry) => entry.id === 'document:docs/ranking.md')
    expect(ranking?.graph.outbound).toContainEqual({ kind: 'covers', id: 'area:src/ranking', confidence: 'proposed' })
    expect(index.entries.find((entry) => entry.id === 'area:src/ranking')?.graph.coveredBy).toEqual(['document:docs/ranking.md'])
    expect(ranking?.aliases).toContain('scoring guide')
    expect(ranking?.summary).toBe('How scores are computed.')
    expect(index.entries.find((entry) => entry.id === 'document:docs/query.md')?.tags).toContain('canonical')
    const intent = index.entries.find((entry) => entry.kind === 'intent')
    expect(intent).toMatchObject({ provenance: 'proposed', confidence: 'proposed', title: 'how do I search the index', path: 'docs/query.md' })
    // Every observed entity and relation survives enrichment, unchanged.
    const merged = withAcceptedRelations(snapshot, overlay)
    expect(merged.relations).toHaveLength(snapshot.relations.length + 1)
    expect(() => assertObservedSurvive(snapshot, merged)).not.toThrow()
    expect(() => assertObservedSurvive(snapshot, { ...merged, relations: merged.relations.slice(1) })).toThrow('removed or altered observed relation')
    expect(() => assertObservedSurvive(snapshot, { ...merged, entities: merged.entities.map((entity) => ({ ...entity, name: `${entity.name}!` })) })).toThrow('removed or altered observed entity')
    const plainEntries = projectRetrievalIndex({ snapshot, config }).entries
    for (const entry of plainEntries) expect(index.entries.some((item) => item.id === entry.id && item.contentHash === entry.contentHash), entry.id).toBe(true)
  })

  it('renders an accepted relation as a dashed edge in the HTML report', () => {
    const relation = fixtures['propose-relation'].valid as never as EnrichmentProposalV1
    const { report } = fixtureSnapshot()
    const merged = withAcceptedRelations(snapshot, overlayFor(snapshot, { accepted: [accepted(relation, 'a person')] }))
    const html = renderOfflineReport({ snapshot: merged, report })
    expect(html).toContain('.edge.proposed{stroke-dasharray:6 4}')
    expect(html).toContain('provenance==="proposed"')
    expect(html).toContain('"provenance":"proposed"')
    expect(renderOfflineReport({ snapshot, report })).not.toContain('"provenance":"proposed"')
  })
})

describe('isolation: the deterministic layer with no usable overlay', () => {
  const repositoryFixture = (): { root: string; config: DocBridgeConfigV1; configPath: string } => {
    const root = temp('doc-bridge-enrich-isolation-')
    const write = (path: string, content: string): void => {
      mkdirSync(dirname(join(root, path)), { recursive: true })
      writeFileSync(join(root, path), content, 'utf8')
    }
    write('package.json', JSON.stringify({ name: 'fixture', version: '0.0.0' }))
    write('src/query/search.ts', "export const searchIndex = (): number => 1\n")
    write('docs/for-agents/INDEX.md', '# Agent index\n\n- [query](./query.md)\n')
    write('docs/for-agents/query.md', '---\nid: fixture-query\neditRoot: src/query\n---\n# Query\n\nDeterministic search. Exports `searchIndex`.\n')
    write('docs/ranking.md', '# Ranking\n\nScores come from `src/query/search.ts`.\n')
    const configuration = { schemaVersion: 1, corpus: { agent: { root: 'docs/for-agents', index: 'docs/for-agents/INDEX.md' } }, intelligence: { registry: { enabled: true, agentId: 'absent-agent' } } }
    write('doc-bridge.config.json', JSON.stringify(configuration))
    return { root, config: applyConfigDefaults(DocBridgeConfigV1Schema.parse(configuration)), configPath: join(root, 'doc-bridge.config.json') }
  }

  it('builds a byte-identical index with the Registry disabled, absent, or leaving a malformed overlay', () => {
    const { root, config } = repositoryFixture()
    // The configuration hash is part of the snapshot's identity, so the comparison is over what is ranked.
    const projected = (configuration: DocBridgeConfigV1): string => {
      const projection = buildDocBridgeIndex({ root, config: configuration, write: false }).index.projection
      return JSON.stringify({ overlayHash: projection?.overlayHash, entries: projection?.entries })
    }
    const withoutOverlay = projected(config)
    // Absent agent, registry enabled, no overlay file: identical.
    expect(projected(config)).toBe(withoutOverlay)
    // A malformed overlay is no overlay.
    mkdirSync(dirname(enrichmentOverlayPath(root)), { recursive: true })
    writeFileSync(enrichmentOverlayPath(root), '{"type":"enrichment-overlay","garbage":true}', 'utf8')
    expect(projected(config)).toBe(withoutOverlay)
    // A real overlay changes the projection while enabled, and stops the moment the Registry is disabled.
    const snapshot = discoverRepository({ root, config })
    const document = snapshot.entities.find((entity) => entity.id === 'document:docs/ranking.md') as KnowledgeEntity
    const alias = proposalFor(snapshot, 'add-alias', document.id, { alias: 'scoring guide' }) as never as EnrichmentProposalV1
    writeEnrichmentOverlay(root, overlayFor(snapshot, { accepted: [accepted(alias)] }))
    const enriched = buildDocBridgeIndex({ root, config, write: false }).index.projection
    expect(enriched?.entries.find((entry) => entry.id === document.id)?.aliases).toContain('scoring guide')
    expect(projected(config)).not.toBe(withoutOverlay)
    expect(projected({ ...config, intelligence: { registry: { enabled: false } } })).toBe(withoutOverlay)
    expect(projected({ ...config, intelligence: {} })).toBe(withoutOverlay)
    expect(existsSync(enrichmentOverlayPath(root))).toBe(true)
  })
})
