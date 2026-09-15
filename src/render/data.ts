import type { DocBridgeConfigV1 } from '../config/schema.js'
import { FILE_BACKED_KINDS } from '../discovery/incremental.js'
import { handoffForEntity } from '../query/handoff.js'
import type { AgentHandoffV1 } from '../schemas/agent-handoff.js'
import type { DocBridgeIndexV1 } from '../schemas/doc-bridge-index.js'
import type { DiscoverySnapshotV1, KnowledgeEntity, ReconciliationReportV1 } from '../schemas/knowledge.js'
import type { RetrievalEntry } from '../schemas/retrieval-index.js'

/**
 * The view models the templates render.
 *
 * Every value a template can print is computed here, from the canonical artifacts and nothing
 * else: the index and its projection, a reconciliation report, two snapshots, an overlay. Lists
 * are sorted before they reach a template and nothing carries a timestamp, so the same artifacts
 * render to the same bytes. The templates decide how a value looks; this decides what the values
 * are, which is the boundary that keeps rendering deterministic and keeps a template from ever
 * needing to call anything.
 */

export type RenderedPage = {
  /** Where the page belongs, relative to the output directory. */
  readonly path: string
  readonly content: string
}

const MAX_SYMBOLS = 12
const SHORT_HASH = 12

const byPath = <T extends { readonly path: string }>(a: T, b: T): number => a.path.localeCompare(b.path) || 0

/** A file name for a unit: `src/query` becomes `src-query.md`, and nothing escapes the output directory. */
export const pageFileName = (value: string): string => `${value.replace(/[^A-Za-z0-9._-]+/g, '-').replace(/^[-.]+|-+$/g, '') || 'root'}.md`

const shortHash = (hash: string | undefined): string => (hash ? hash.slice(0, SHORT_HASH) : '(none)')

const projectionOf = (index: DocBridgeIndexV1) => {
  if (!index.projection) throw new Error('The index carries no retrieval projection; rebuild it with `ak-docs index` before rendering.')
  return index.projection
}

const checksSourceOf = (handoff: AgentHandoffV1 | undefined): string => {
  const value = handoff?.metadata?.checksSource
  return typeof value === 'string' ? value : ''
}

const safeHandoff = (index: DocBridgeIndexV1, id: string, config: DocBridgeConfigV1, root: string | undefined): AgentHandoffV1 | undefined => {
  try {
    return handoffForEntity(index, id, config, root ? { root } : {})
  } catch {
    // A unit the handoff cannot resolve still gets a page; it just has no derived fields.
    return undefined
  }
}

type RelatedView = { readonly path: string; readonly direction: string; readonly strength: number; readonly evidence: string }

const relatedView = (handoff: AgentHandoffV1 | undefined): RelatedView[] =>
  [...(handoff?.related ?? [])]
    .map((item) => ({ path: item.path, direction: item.direction, strength: item.strength, evidence: item.evidence.join(', ') }))
    .sort((a, b) => a.path.localeCompare(b.path))

// --- area pages

export type AreaPageView = {
  readonly id: string
  readonly path: string
  readonly purpose: string
  readonly ownership: string
  readonly modules: readonly { readonly path: string; readonly symbols: string }[]
  readonly documents: readonly { readonly title: string; readonly path: string; readonly relation: string }[]
  readonly related: readonly RelatedView[]
  readonly checks: readonly string[]
  readonly checksSource: string
  readonly findings: readonly { readonly code: string; readonly severity: string; readonly status: string; readonly message: string; readonly evidence: string }[]
  readonly findingsEmpty: string
}

export type AreaPagesOptions = {
  readonly root?: string
  /** The reconciliation report whose diagnostics become "open findings". Without one the page says so. */
  readonly reconciliation?: ReconciliationReportV1
}

const underPath = (path: string, area: string): boolean => path === area || path.startsWith(`${area}/`)

/** Where a finding points: its first evidence location, and the relation it is about when it names one. */
const findingEvidence = (diagnostic: ReconciliationReportV1['diagnostics'][number]): string => {
  const first = [...diagnostic.evidence].sort((a, b) => `${a.path}:${a.lineStart ?? 0}`.localeCompare(`${b.path}:${b.lineStart ?? 0}`))[0]
  const location = !first ? diagnostic.id : first.lineStart ? `${first.path}:${first.lineStart}` : first.path
  const relation = [...(diagnostic.relationIds ?? [])].sort()[0]
  return relation ? `${location} (${relation})` : location
}

export const areaPagesView = (index: DocBridgeIndexV1, config: DocBridgeConfigV1, options: AreaPagesOptions = {}): AreaPageView[] => {
  const projection = projectionOf(index)
  const entries = new Map(projection.entries.map((entry) => [entry.id, entry]))
  const documentTitle = (id: string): { readonly title: string; readonly path: string } | undefined => {
    const entry = entries.get(id)
    return entry && entry.kind === 'document' ? { title: entry.title, path: entry.path } : undefined
  }
  const areas = projection.entries.filter((entry) => entry.kind === 'area').sort((a, b) => a.id.localeCompare(b.id))

  return areas.map((area) => {
    const modules = projection.entries
      .filter((entry) => entry.kind === 'module' && entry.graph.areaId === area.id)
      .sort(byPath)
    const moduleIds = new Set(modules.map((entry) => entry.id))
    const ownership = area.ownershipId ? index.lookup?.ownership?.[area.ownershipId] : undefined
    const handoff = safeHandoff(index, area.id, config, options.root)

    /*
     * A document belongs on the page when it covers or mentions the area, or a module inside it —
     * the module-level edge is how most documentation reaches an area. The first relation that
     * brought a document in is the one reported, coverage before mention.
     */
    const documents = new Map<string, { readonly title: string; readonly path: string; readonly relation: string }>()
    const add = (documentId: string, relation: string): void => {
      const document = documentTitle(documentId)
      if (document && !documents.has(documentId)) documents.set(documentId, { ...document, relation })
    }
    for (const documentId of [...area.graph.coveredBy].sort()) add(documentId, 'covers this area')
    for (const module of modules) for (const documentId of [...module.graph.coveredBy].sort()) add(documentId, `covers \`${module.path}\``)
    for (const documentId of [...area.graph.mentionedBy].sort()) add(documentId, 'mentions this area')
    for (const module of modules) for (const documentId of [...module.graph.mentionedBy].sort()) add(documentId, `mentions \`${module.path}\``)

    const findings = (options.reconciliation?.diagnostics ?? [])
      .filter((diagnostic) => diagnostic.code !== 'RELATION_CONFIRMED')
      .filter(
        (diagnostic) =>
          diagnostic.entityIds?.some((id) => id === area.id || moduleIds.has(id)) ||
          diagnostic.evidence.some((item) => underPath(item.path, area.path)),
      )
      .sort((a, b) => a.code.localeCompare(b.code) || a.id.localeCompare(b.id))
      .map((diagnostic) => ({ code: diagnostic.code, severity: diagnostic.severity, status: diagnostic.status, message: diagnostic.message, evidence: findingEvidence(diagnostic) }))

    const ownershipParts = ownership
      ? [
          `Ownership record \`${ownership.id}\``,
          ...(ownership.agentDoc ? [`agent document \`${ownership.agentDoc}\``] : []),
          ...(ownership.humanDoc ? [`human guide ${ownership.humanDoc}`] : []),
        ]
      : []

    return {
      id: area.id,
      path: area.path,
      purpose: ownership?.purpose ?? area.summary ?? `Code area grouping ${modules.length} module(s) under \`${area.path}\`.`,
      ownership: ownershipParts.join('; ') + (ownershipParts.length ? '.' : ''),
      modules: modules.map((entry) => {
        const symbols = entry.symbols ?? []
        return { path: entry.path, symbols: symbols.slice(0, MAX_SYMBOLS).map((symbol) => `\`${symbol}\``).join(', ') + (symbols.length > MAX_SYMBOLS ? ` and ${symbols.length - MAX_SYMBOLS} more` : '') }
      }),
      documents: [...documents.values()].sort(byPath),
      related: relatedView(handoff),
      checks: handoff?.checks ?? [],
      checksSource: checksSourceOf(handoff),
      findings,
      findingsEmpty: options.reconciliation ? 'No open finding touches this area.' : 'No reconciliation report was available; run `ak-docs reconcile` to list open findings.',
    }
  })
}

// --- ownership sidecars

export type OwnershipPageView = {
  readonly id: string
  readonly kind: string
  readonly path: string
  readonly humanDoc: string
  readonly purpose: string
  readonly startHere: string
  readonly readBeforeEditing: readonly string[]
  readonly editRoots: readonly string[]
  readonly checks: readonly string[]
  readonly checksSource: string
  readonly related: readonly RelatedView[]
}

export const ownershipPagesView = (index: DocBridgeIndexV1, config: DocBridgeConfigV1, options: { readonly root?: string } = {}): OwnershipPageView[] =>
  Object.values(index.lookup?.ownership ?? {})
    .sort((a, b) => a.id.localeCompare(b.id))
    .map((record) => {
      const handoff = safeHandoff(index, record.id, config, options.root)
      const startHere = handoff?.startHere ?? record.agentDoc ?? config.corpus.agent.index ?? ''
      return {
        id: record.id,
        kind: handoff?.target.type ?? 'package',
        path: record.path,
        humanDoc: record.humanDoc ?? '',
        purpose: record.purpose ?? `Owns \`${record.path}\`.`,
        startHere: startHere || '(no start page)',
        readBeforeEditing: (handoff?.readBeforeEditing ?? []).filter((path) => path !== startHere),
        editRoots: handoff?.editRoots ?? [record.path],
        checks: handoff?.checks ?? record.checks,
        checksSource: checksSourceOf(handoff) || record.checksSource || '',
        related: relatedView(handoff),
      }
    })

// --- change digest

export type SnapshotForDigest = Pick<DiscoverySnapshotV1, 'entities' | 'relations' | 'sourceRevision'>

type FileBacked = { readonly id: string; readonly kind: string; readonly path: string; readonly hash: string }

export type ChangeDigestView = {
  readonly summary: string
  readonly changed: readonly { readonly id: string; readonly kind: string; readonly path: string; readonly previousHash: string; readonly currentHash: string }[]
  readonly added: readonly { readonly id: string; readonly kind: string; readonly path: string; readonly currentHash: string }[]
  readonly removed: readonly { readonly id: string; readonly kind: string; readonly path: string; readonly previousHash: string }[]
  readonly documentsToReview: readonly { readonly path: string; readonly because: string }[]
}

/*
 * The digest is defined over file-backed entities, because those are the ones that carry a hash
 * of their bytes (`docs/spec/incremental-scan-v1.md`). An entity without one — an external
 * package, an area — has nothing to move.
 */
const fileBacked = (snapshot: SnapshotForDigest): Map<string, FileBacked> => {
  const result = new Map<string, FileBacked>()
  for (const entity of snapshot.entities) {
    if (!(FILE_BACKED_KINDS as readonly string[]).includes(entity.kind) || !entity.path) continue
    const hash = entity.evidence[0]?.contentHash
    if (hash) result.set(entity.id, { id: entity.id, kind: entity.kind, path: entity.path, hash })
  }
  return result
}

const DOCUMENT_RELATIONS = new Set(['covers', 'mentions', 'mentions-symbol', 'links-to'])

export const changeDigestView = (previous: SnapshotForDigest, current: SnapshotForDigest): ChangeDigestView => {
  const before = fileBacked(previous)
  const after = fileBacked(current)
  const sortIds = (ids: Iterable<string>, of: Map<string, FileBacked>): string[] =>
    [...ids].sort((a, b) => (of.get(a) as FileBacked).path.localeCompare((of.get(b) as FileBacked).path) || a.localeCompare(b))

  const changed = sortIds([...after.keys()].filter((id) => before.has(id) && (before.get(id) as FileBacked).hash !== (after.get(id) as FileBacked).hash), after)
    .map((id) => ({ id, kind: (after.get(id) as FileBacked).kind, path: (after.get(id) as FileBacked).path, previousHash: shortHash((before.get(id) as FileBacked).hash), currentHash: shortHash((after.get(id) as FileBacked).hash) }))
  const added = sortIds([...after.keys()].filter((id) => !before.has(id)), after)
    .map((id) => ({ id, kind: (after.get(id) as FileBacked).kind, path: (after.get(id) as FileBacked).path, currentHash: shortHash((after.get(id) as FileBacked).hash) }))
  const removed = sortIds([...before.keys()].filter((id) => !after.has(id)), before)
    .map((id) => ({ id, kind: (before.get(id) as FileBacked).kind, path: (before.get(id) as FileBacked).path, previousHash: shortHash((before.get(id) as FileBacked).hash) }))

  /*
   * "Which documentation should this change have touched": every document that covers, mentions
   * or links to something that moved — and did not move itself. A document that changed alongside
   * its subject is in `changed`, not here.
   */
  const moved = new Set([...changed, ...added].map((entity) => entity.id))
  const reasons = new Map<string, Set<string>>()
  for (const relation of current.relations) {
    if (!DOCUMENT_RELATIONS.has(relation.kind) || !moved.has(relation.to) || moved.has(relation.from)) continue
    const document = after.get(relation.from)
    if (!document || document.kind !== 'document') continue
    const target = after.get(relation.to)
    const because = reasons.get(document.path) ?? new Set<string>()
    because.add(`${relation.kind} \`${target?.path ?? relation.to}\``)
    reasons.set(document.path, because)
  }
  const documentsToReview = [...reasons.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([path, because]) => ({ path, because: [...because].sort().join('; ') }))

  return {
    summary: `${changed.length} changed, ${added.length} added, ${removed.length} removed of ${after.size} file-backed entities (previous revision ${previous.sourceRevision.slice(0, SHORT_HASH)}, current ${current.sourceRevision.slice(0, SHORT_HASH)})`,
    changed,
    added,
    removed,
    documentsToReview,
  }
}

// --- overlay review

/**
 * The shape the review page reads from an enrichment overlay. Deliberately loose: the overlay
 * artifact is defined by the enrichment workstream, and the page needs only what a human needs
 * to judge a proposal — what it proposes about which entity, why, how sure the agent was, and
 * where in the repository the evidence is.
 */
export type OverlayReviewInput = {
  readonly pending?: readonly {
    readonly proposalId: string
    readonly kind: string
    readonly entity: string
    readonly reason?: string
    readonly confidence?: number | string
    readonly evidence?: readonly { readonly path: string; readonly lineStart?: number; readonly lineEnd?: number }[]
  }[]
}

export type OverlayReviewView = {
  readonly present: boolean
  readonly summary: string
  readonly pending: readonly {
    readonly proposalId: string
    readonly kind: string
    readonly entity: string
    readonly reason: string
    readonly confidence: string
    readonly evidence: readonly { readonly link: string }[]
  }[]
}

const evidenceLink = (item: { readonly path: string; readonly lineStart?: number; readonly lineEnd?: number }): string => {
  if (!item.lineStart) return `[${item.path}](${item.path})`
  const range = item.lineEnd && item.lineEnd !== item.lineStart ? `${item.lineStart}-${item.lineEnd}` : `${item.lineStart}`
  const anchor = item.lineEnd && item.lineEnd !== item.lineStart ? `L${item.lineStart}-L${item.lineEnd}` : `L${item.lineStart}`
  return `[${item.path}:${range}](${item.path}#${anchor})`
}

export const overlayReviewView = (overlay: OverlayReviewInput | undefined, source?: string): OverlayReviewView => {
  if (!overlay) return { present: false, summary: '', pending: [] }
  const pending = [...(overlay.pending ?? [])]
    .sort((a, b) => a.kind.localeCompare(b.kind) || a.entity.localeCompare(b.entity) || a.proposalId.localeCompare(b.proposalId))
    .map((proposal) => ({
      proposalId: proposal.proposalId,
      kind: proposal.kind,
      entity: proposal.entity,
      reason: proposal.reason ?? '(no reason given)',
      confidence: proposal.confidence === undefined ? 'unknown' : String(proposal.confidence),
      evidence: [...(proposal.evidence ?? [])]
        .sort((a, b) => a.path.localeCompare(b.path) || (a.lineStart ?? 0) - (b.lineStart ?? 0))
        .map((item) => ({ link: evidenceLink(item) })),
    }))
  return {
    present: true,
    summary: `${pending.length} proposal(s) pending review${source ? ` in \`${source}\`` : ''}. Accepting one is a human decision; nothing here is applied automatically.`,
    pending,
  }
}

/** Only for tests and callers that hold a snapshot: the document entities' generated regions, typed. */
export const generatedRegionsOf = (entity: Pick<KnowledgeEntity, 'metadata'> | undefined): { readonly lineStart: number; readonly lineEnd: number; readonly hash?: string }[] => {
  const raw = entity?.metadata?.generatedRegions
  if (!Array.isArray(raw)) return []
  return raw.flatMap((item) => {
    if (!item || typeof item !== 'object') return []
    const region = item as { lineStart?: unknown; lineEnd?: unknown; hash?: unknown }
    if (typeof region.lineStart !== 'number' || typeof region.lineEnd !== 'number') return []
    return [{ lineStart: region.lineStart, lineEnd: region.lineEnd, ...(typeof region.hash === 'string' ? { hash: region.hash } : {}) }]
  })
}

export type { RetrievalEntry }
