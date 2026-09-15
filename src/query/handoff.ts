import type { DocBridgeConfigV1 } from '../config/schema.js'
import { defaultChecksForTarget } from '../lib/package-manager.js'
import { normalizeAgentHandoff, type AgentHandoffV1, type HandoffRelated } from '../schemas/agent-handoff.js'
import type { DocBridgeIndexV1 } from '../schemas/doc-bridge-index.js'
import type { RetrievalEntry, RetrievalIndexV1 } from '../schemas/retrieval-index.js'

/**
 * A handoff for any entity the projection knows.
 *
 * `handoffForPackage` could answer for an ownership record and nothing else: an agent asking
 * about a module, an area or a document got "unknown package". Now the answer is derived from
 * the graph — which documents cover the target, which mention it, what its code depends on — and
 * every field says which relations produced it, so a handoff that points somewhere odd is a
 * finding about the repository rather than a mystery about the tool.
 */

export type HandoffOptions = {
  /** The project root, for the package-script fallback when nothing declares checks. */
  readonly root?: string
}

type OwnershipRecord = NonNullable<NonNullable<DocBridgeIndexV1['lookup']>['ownership']>[string]

const MAX_RELATED = 3
const MAX_READ_BEFORE = 2
const MAX_RELATED_EVIDENCE = 3

const dirname = (path: string): string => path.split('/').slice(0, -1).join('/') || '.'

const isHttp = (value: string): boolean => /^https?:\/\//.test(value)

const bridgeFor = (config: DocBridgeConfigV1, id: string, humanDoc: string | undefined): AgentHandoffV1['bridge'] | undefined =>
  humanDoc
    ? { humanDoc: isHttp(humanDoc) ? 'external' : 'linked' }
    : config.corpus.human
      ? { humanDoc: 'missing', action: 'ak-docs bootstrap agent-docs', bootstrap: `docs/for-agents/human/${id}.md` }
      : undefined

/**
 * The handoff for an index built before the projection existed: an ownership record, or nothing.
 */
const legacyHandoff = (index: DocBridgeIndexV1, id: string, config: DocBridgeConfigV1): AgentHandoffV1 => {
  const fromIndex = index.handoffs?.[id]
  if (fromIndex) return normalizeAgentHandoff(fromIndex)

  const owner = index.lookup?.ownership?.[id]
  if (!owner) throw new Error(`Unknown package/ownership id "${id}". Try: ak-docs list packages`)
  const bridge = bridgeFor(config, id, owner.humanDoc)

  return normalizeAgentHandoff({
    type: 'agent-handoff',
    source: config.index?.outFile ?? '.doc-bridge/index.json',
    target: {
      type: 'package',
      id,
      path: owner.path,
      ...(owner.group ? { group: owner.group } : {}),
      ...(owner.layer ? { layer: owner.layer } : {}),
    },
    startHere: owner.agentDoc ?? config.corpus.agent.index ?? '',
    readBeforeEditing: [owner.agentDoc, 'AGENTS.md'].filter(Boolean),
    editRoots: [owner.path],
    checks: [...owner.checks],
    ...(owner.humanDoc ? { humanDoc: owner.humanDoc } : {}),
    ...(bridge ? { bridge } : {}),
    notes: [
      ...(owner.purpose ? [owner.purpose] : []),
      ...(!owner.humanDoc && config.corpus.human ? [`Human guide missing for ${id}. Run: ak-docs bootstrap agent-docs`] : []),
    ],
  })
}

/**
 * Which entry an identifier names: an entity id, an ownership id, an alias, or a path.
 *
 * Ownership ids win over aliases because they are what a routing command has always accepted;
 * a path is accepted last, since `src/query` is a directory before it is a name.
 */
export const resolveHandoffEntry = (projection: RetrievalIndexV1, id: string): RetrievalEntry | undefined => {
  const trimmed = id.replace(/\/$/, '')
  return (
    projection.entries.find((entry) => entry.id === trimmed) ??
    projection.entries.find((entry) => entry.ownershipId === trimmed) ??
    projection.entries.find((entry) => entry.aliases.includes(trimmed)) ??
    projection.entries.find((entry) => entry.path === trimmed && (entry.kind === 'area' || entry.kind === 'package')) ??
    projection.entries.find((entry) => entry.path === trimmed)
  )
}

type DocumentPick = { readonly path: string; readonly reason: string }

/**
 * Where to start reading, and why.
 *
 * Order of authority: a document that declares it covers the target; one that mentions it; one
 * that links to those; and, failing all of that, the most canonical document the unit's
 * ownership names. Within each tier the more canonical page comes first, so the entry point
 * other pages point at beats the leaf note that happens to mention the target too.
 */
const documentsFor = (
  projection: RetrievalIndexV1,
  byId: ReadonlyMap<string, RetrievalEntry>,
  target: RetrievalEntry,
  ownership: OwnershipRecord | undefined,
): DocumentPick[] => {
  const picks: DocumentPick[] = []
  const seen = new Set<string>()
  const add = (entry: RetrievalEntry | undefined, reason: string): void => {
    if (!entry || entry.kind !== 'document' || seen.has(entry.path)) return
    seen.add(entry.path)
    picks.push({ path: entry.path, reason })
  }
  const byRank = (ids: readonly string[]): RetrievalEntry[] =>
    ids
      .map((id) => byId.get(id))
      .filter((entry): entry is RetrievalEntry => Boolean(entry))
      .sort((a, b) => b.graph.pagerank - a.graph.pagerank || a.id.localeCompare(b.id))

  if (ownership?.agentDoc) add(projection.entries.find((entry) => entry.path === ownership.agentDoc), `ownership ${ownership.id} names it as the agent document`)
  for (const entry of byRank(target.graph.coveredBy)) add(entry, `covers ${target.id}`)
  for (const entry of byRank(target.graph.mentionedBy)) add(entry, `mentions ${target.id}`)
  if (target.kind === 'document') {
    add(target, 'the target itself')
    for (const edge of target.graph.outbound.filter((item) => item.kind === 'links-to')) add(byId.get(edge.id), `${target.id} links to it`)
  }

  // One links-to hop from what covers or mentions the target: the page that introduces the page.
  for (const near of [...picks]) {
    const document = projection.entries.find((entry) => entry.path === near.path)
    for (const edge of document?.graph.inbound.filter((item) => item.kind === 'links-to') ?? []) add(byId.get(edge.id), `links to ${document?.id}`)
  }

  return picks
}

/** The strongest import relationships between this unit and the other areas, both directions. */
const relatedAreas = (projection: RetrievalIndexV1, byId: ReadonlyMap<string, RetrievalEntry>, target: RetrievalEntry): HandoffRelated[] => {
  const unitOf = (entry: RetrievalEntry): string | undefined =>
    target.kind === 'package' ? entry.graph.packageId : (entry.graph.areaId ?? entry.graph.packageId)
  const mine = target.kind === 'module' ? unitOf(target) : target.id
  if (!mine) return []

  const crossings = new Map<string, { direction: HandoffRelated['direction']; count: number; examples: string[] }>()
  const note = (unit: string, direction: HandoffRelated['direction'], example: string): void => {
    const key = `${direction}:${unit}`
    const existing = crossings.get(key)
    if (existing) {
      existing.count += 1
      if (existing.examples.length < MAX_RELATED_EVIDENCE) existing.examples.push(example)
    } else crossings.set(key, { direction, count: 1, examples: [example] })
  }

  for (const module of projection.entries) {
    if (module.kind !== 'module') continue
    const from = unitOf(module)
    if (!from) continue
    for (const edge of module.graph.outbound) {
      if (edge.kind !== 'imports' && edge.kind !== 're-exports') continue
      const imported = byId.get(edge.id)
      const to = imported ? unitOf(imported) : undefined
      if (!to || to === from) continue
      if (from === mine) note(to, 'imports', `${module.path} → ${imported?.path ?? edge.id}`)
      else if (to === mine) note(from, 'imported-by', `${module.path} → ${imported?.path ?? edge.id}`)
    }
  }

  const rows = [...crossings.entries()]
    .map(([key, value]) => ({ unit: key.slice(key.indexOf(':') + 1), ...value }))
    .sort((a, b) => b.count - a.count || a.unit.localeCompare(b.unit))
  const pick = (direction: HandoffRelated['direction']): HandoffRelated[] =>
    rows
      .filter((row) => row.direction === direction)
      .slice(0, MAX_RELATED)
      .map((row) => ({
        id: row.unit,
        path: byId.get(row.unit)?.path ?? row.unit,
        direction,
        strength: row.count,
        evidence: row.examples,
      }))
  return [...pick('imports'), ...pick('imported-by')]
}

type Checks = { readonly checks: readonly string[]; readonly source: string; readonly reason: string }

/**
 * Which checks to run, and where that answer came from.
 *
 * An ownership override wins; then whatever the index recorded when it merged frontmatter,
 * package scripts and defaults (it recorded the source at the time); then the package-manager
 * default for the unit's package, which needs the project root to read package.json.
 */
const checksFor = (
  index: DocBridgeIndexV1,
  config: DocBridgeConfigV1,
  target: RetrievalEntry,
  ownership: OwnershipRecord | undefined,
  unitPath: string,
  packageEntry: RetrievalEntry | undefined,
  options: HandoffOptions,
): Checks => {
  const override = ownership ? config.routing?.options?.ownership?.[ownership.id]?.checks : undefined
  if (override?.length) return { checks: override, source: 'ownership', reason: `routing.options.ownership.${ownership?.id}.checks` }
  if (ownership?.checks.length) {
    const source = ownership.checksSource ?? 'default'
    return { checks: ownership.checks, source, reason: `ownership ${ownership.id} recorded its checks from ${source}` }
  }
  // A module or area inside an owned package inherits that package's checks.
  const owningRecord = packageEntry?.ownershipId ? index.lookup?.ownership?.[packageEntry.ownershipId] : undefined
  if (owningRecord?.checks.length) {
    const source = owningRecord.checksSource ?? 'default'
    return { checks: owningRecord.checks, source, reason: `inherited from ownership ${owningRecord.id} (${source})` }
  }
  if (options.root) {
    const strict = (config.gates?.preset ?? 'minimal') !== 'minimal'
    const packageName = packageEntry?.aliases.find((alias) => alias.includes('/')) ?? packageEntry?.title
    const checks = defaultChecksForTarget(options.root, {
      packageId: packageEntry?.id ?? target.id,
      packagePath: packageEntry?.path ?? unitPath,
      ...(packageName ? { packageName } : {}),
      strict,
    })
    return { checks, source: 'default', reason: 'package-manager default for the unit\'s package' }
  }
  return { checks: [], source: 'default', reason: 'nothing declares checks and no project root was given to read package scripts' }
}

const targetType = (kind: RetrievalEntry['kind']): AgentHandoffV1['target']['type'] =>
  kind === 'area' ? 'area' : kind === 'document' ? 'document' : kind === 'module' ? 'module' : 'package'

/**
 * Build the handoff for a package, an area, a module or a document.
 *
 * `editRoots` is the unit an agent may write in: the area or package itself, a module's area,
 * a document's own path. `startHere` and `readBeforeEditing` come from the documentation graph.
 * `related` names the areas this unit's code depends on and that depend on it, with the import
 * that proves each. `explain` says which relation produced each field.
 */
export const handoffForEntity = (index: DocBridgeIndexV1, id: string, config: DocBridgeConfigV1, options: HandoffOptions = {}): AgentHandoffV1 => {
  const projection = index.projection
  if (!projection) return legacyHandoff(index, id, config)

  const target = resolveHandoffEntry(projection, id)
  if (!target) {
    const fallback = index.lookup?.ownership?.[id] ? legacyHandoff(index, id, config) : undefined
    if (fallback) return fallback
    throw new Error(`Unknown entity "${id}". Try: ak-docs list packages, or ak-docs search "${id}"`)
  }
  if (target.kind === 'intent' || target.kind === 'change') {
    throw new Error(`"${id}" is a ${target.kind} route. Try: ak-docs query ${target.kind} ${target.id} --agent`)
  }

  const byId = new Map(projection.entries.map((entry) => [entry.id, entry]))
  const ownership = target.ownershipId ? index.lookup?.ownership?.[target.ownershipId] : undefined
  const area = target.graph.areaId ? byId.get(target.graph.areaId) : undefined
  const packageEntry = target.graph.packageId ? byId.get(target.graph.packageId) : target.kind === 'package' ? target : undefined
  const explain: Record<string, string[]> = {}

  // The unit an agent may write in.
  const unit =
    target.kind === 'module'
      ? area
        ? { path: area.path, reason: `contained by area ${area.id}` }
        : packageEntry
          ? { path: packageEntry.path, reason: `contained by package ${packageEntry.id}` }
          : { path: dirname(target.path), reason: 'the directory of the module; no area or package contains it' }
      : { path: ownership?.path ?? target.path, reason: ownership ? `ownership ${ownership.id} path` : `the ${target.kind} itself` }
  explain.editRoots = [unit.reason]

  const documents = documentsFor(projection, byId, target, ownership)
  const startHere = documents[0]?.path ?? config.corpus.agent.index ?? target.path
  explain.startHere = [documents[0] ? documents[0].reason : 'no document covers, mentions or links to the target; the corpus index is the fallback']
  const readBefore = documents.slice(1, 1 + MAX_READ_BEFORE)
  explain.readBeforeEditing = readBefore.map((pick) => `${pick.path}: ${pick.reason}`)

  const checks = checksFor(index, config, target, ownership, unit.path, packageEntry, options)
  explain.checks = [checks.reason]

  const related = target.kind === 'document' ? [] : relatedAreas(projection, byId, target)
  if (related.length) explain.related = related.map((row) => `${row.direction} ${row.id}: ${row.strength} import(s), e.g. ${row.evidence[0] ?? ''}`.trim())

  const humanDoc = ownership?.humanDoc
  const bridge = bridgeFor(config, ownership?.id ?? target.id, humanDoc)
  const evidence: NonNullable<AgentHandoffV1['evidence']> = [
    {
      source: target.kind === 'module' ? 'code' : target.kind === 'document' ? 'documentation' : 'derived',
      path: target.path,
      contentHash: target.contentHash,
      context: `${target.kind} ${target.id}`,
    },
    ...documents.slice(0, 1 + MAX_READ_BEFORE).map((pick) => ({ source: 'documentation' as const, path: pick.path, context: pick.reason })),
  ]

  return normalizeAgentHandoff({
    type: 'agent-handoff',
    source: config.index?.outFile ?? '.doc-bridge/index.json',
    target: {
      type: targetType(target.kind),
      id: ownership?.id ?? target.id,
      path: target.path,
      ...(ownership?.group ? { group: ownership.group } : {}),
      ...(ownership?.layer ? { layer: ownership.layer } : {}),
    },
    startHere,
    readBeforeEditing: [...new Set([...readBefore.map((pick) => pick.path), 'AGENTS.md'])],
    editRoots: [unit.path],
    checks: [...checks.checks],
    ...(humanDoc ? { humanDoc } : {}),
    ...(bridge ? { bridge } : {}),
    notes: [
      ...(target.summary ? [target.summary] : []),
      ...(!humanDoc && config.corpus.human && ownership ? [`Human guide missing for ${ownership.id}. Run: ak-docs bootstrap agent-docs`] : []),
    ],
    ...(related.length ? { related } : {}),
    explain,
    evidence,
    metadata: {
      entityId: target.id,
      kind: target.kind,
      checksSource: checks.source,
      confidence: target.confidence,
      ...(area ? { areaId: area.id } : {}),
      ...(packageEntry ? { packageId: packageEntry.id } : {}),
    },
  })
}
