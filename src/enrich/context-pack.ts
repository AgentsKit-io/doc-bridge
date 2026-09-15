import { readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'

import type { DocBridgeConfigV1 } from '../config/schema.js'
import { sha256NormalizedV1 } from '../index-builder/content-hash.js'
import { redactSecrets, redactValue } from '../safety/repository.js'
import type { DiscoverySnapshotV1, Evidence, KnowledgeDiagnostic, KnowledgeEntity, ReconciliationReportV1 } from '../schemas/knowledge.js'
import { entityContentHash } from './validate.js'

/**
 * Context packs: what an agent receives instead of the snapshot.
 *
 * `ak-docs suggest` sent the whole redacted snapshot — 740 KB on this repository — in one call,
 * for every question. A pack is one entity, its depth-one neighbours, the open diagnostics that
 * touch it and a bounded excerpt of its own file, built in a fixed order and truncated in a fixed
 * order under a byte budget. Cost becomes proportional to what changed, because the pack hash
 * covers exactly the content hashes the pack is built from, and a pack whose hash has not moved
 * is a pack the cache already answered.
 */

export const CONTEXT_PACK_VERSION = 1 as const
export const DEFAULT_PACK_BYTES = 64 * 1024
export const MAX_PACK_NEIGHBOURS = 32
const MAX_PACK_DIAGNOSTICS = 16
const MAX_EXCERPT_BYTES = 12 * 1024
const MAX_MESSAGE = 512
const MAX_METADATA_STRING = 512

export type EnrichmentTask = 'curate' | 'review' | 'adjudicate'

export type PackNeighbour = {
  readonly id: string
  readonly kind: string
  readonly name: string
  readonly path?: string
  readonly contentHash: string
  readonly relation: string
  readonly direction: 'out' | 'in'
}

export type PackDiagnostic = Pick<KnowledgeDiagnostic, 'id' | 'code' | 'status' | 'severity'> & { readonly message: string }

export type PackEvidence = {
  readonly path: string
  readonly contentHash: string
  /** Redacted, bounded, possibly truncated — `truncated` says so. */
  readonly excerpt: string
  readonly truncated: boolean
}

export type ContextPack = {
  readonly type: 'context-pack'
  readonly schemaVersion: typeof CONTEXT_PACK_VERSION
  /** Over the target's and every neighbour's content hash: the pack's identity for the cache. */
  readonly packHash: string
  readonly baseSnapshotHash: string
  readonly areaId: string
  readonly target: {
    readonly id: string
    readonly kind: string
    readonly name: string
    readonly path?: string
    readonly contentHash: string
    readonly aliases: readonly string[]
    /** The entity's own evidence items: what a proposal about it may cite, verbatim. */
    readonly evidence: readonly Pick<Evidence, 'source' | 'path' | 'lineStart' | 'lineEnd'>[]
    readonly metadata: Readonly<Record<string, unknown>>
  }
  readonly neighbours: readonly PackNeighbour[]
  readonly diagnostics: readonly PackDiagnostic[]
  readonly evidence: readonly PackEvidence[]
  /**
   * `bytes` is the serialised size measured with this field at its widest (`maxBytes`), so the
   * value written is never smaller than the pack it describes and never exceeds the budget.
   */
  readonly budget: { readonly maxBytes: number; readonly bytes: number; readonly dropped: readonly string[] }
}

export type BuildContextPacksOptions = {
  readonly snapshot: Pick<DiscoverySnapshotV1, 'contentHash' | 'entities' | 'relations'>
  readonly report?: Pick<ReconciliationReportV1, 'diagnostics'>
  readonly config?: DocBridgeConfigV1
  /** Which entity kinds to build packs for. Defaults to documents. */
  readonly kinds?: readonly string[]
  /** Only these entity ids. Unset means every entity of the selected kinds. */
  readonly targets?: ReadonlySet<string>
  /** File contents by repository-relative path. Defaults to reading under `root`. */
  readonly readFile?: (path: string) => string | undefined
  readonly root?: string
}

export const packByteBudget = (config: DocBridgeConfigV1 | undefined): number => config?.intelligence?.registry?.maxPackBytes ?? DEFAULT_PACK_BYTES

const bytes = (value: unknown): number => Buffer.byteLength(JSON.stringify(value), 'utf8')

const boundedMetadata = (metadata: Record<string, unknown> | undefined): Record<string, unknown> => {
  const out: Record<string, unknown> = {}
  for (const key of Object.keys(metadata ?? {}).sort()) {
    const value = metadata?.[key]
    if (typeof value === 'string') out[key] = redactSecrets(value).slice(0, MAX_METADATA_STRING)
    else if (typeof value === 'number' || typeof value === 'boolean') out[key] = value
    else if (Array.isArray(value)) out[key] = redactValue(value.slice(0, 64))
    else if (value && typeof value === 'object') out[key] = redactValue(value)
  }
  return out
}

const defaultReader = (root: string | undefined) => (path: string): string | undefined => {
  if (!root) return undefined
  try {
    return readFileSync(join(resolve(root), path), 'utf8')
  } catch {
    return undefined
  }
}

/** The area a path belongs to: the most specific area entity whose path prefixes it. */
const areaFor = (path: string | undefined, areas: readonly KnowledgeEntity[]): string => {
  if (!path) return 'root'
  let best: KnowledgeEntity | undefined
  for (const area of areas) {
    const areaPath = area.path?.replace(/\/$/, '')
    if (!areaPath) continue
    if (path === areaPath || path.startsWith(`${areaPath}/`)) {
      if (!best || areaPath.length > (best.path?.length ?? 0)) best = area
    }
  }
  return best?.id ?? 'root'
}

/**
 * Fit a pack under its budget by dropping in a declared order: excerpt bytes first (halved
 * until it fits, then dropped), then diagnostics from the end, then neighbours from the end.
 * The target itself is never dropped — a pack with no target is not a pack.
 *
 * This mirrors `compileBudget` from `@agentskit/core` with a byte counter and the
 * `drop-oldest` strategy over sections ordered least-important-first; a test cross-checks the
 * two so the mirror cannot drift, and the mirror is what runs, because a pack must be the same
 * pack whether or not an optional peer is installed.
 */
export const fitContextPack = (pack: ContextPack, maxBytes: number): ContextPack => {
  let current: ContextPack = { ...pack, budget: { maxBytes, bytes: maxBytes, dropped: [] } }
  const dropped: string[] = []
  const measure = (): number => bytes({ ...current, budget: { maxBytes, bytes: maxBytes, dropped } })
  let size = measure()
  while (size > maxBytes && current.evidence.some((item) => item.excerpt.length > 0)) {
    current = {
      ...current,
      evidence: current.evidence.map((item) => {
        if (!item.excerpt.length) return item
        const next = item.excerpt.length > 256 ? item.excerpt.slice(0, Math.floor(item.excerpt.length / 2)) : ''
        return { ...item, excerpt: next, truncated: true }
      }),
    }
    if (!dropped.includes('evidence.excerpt')) dropped.push('evidence.excerpt')
    size = measure()
  }
  while (size > maxBytes && current.diagnostics.length) {
    current = { ...current, diagnostics: current.diagnostics.slice(0, -1) }
    if (!dropped.includes('diagnostics')) dropped.push('diagnostics')
    size = measure()
  }
  while (size > maxBytes && current.neighbours.length) {
    current = { ...current, neighbours: current.neighbours.slice(0, -1) }
    if (!dropped.includes('neighbours')) dropped.push('neighbours')
    size = measure()
  }
  return { ...current, budget: { maxBytes, bytes: measure(), dropped } }
}

/** The pack hash: the target and its neighbours by content hash, nothing else. */
export const contextPackHash = (target: { readonly id: string; readonly contentHash: string }, neighbours: readonly Pick<PackNeighbour, 'id' | 'contentHash'>[]): string =>
  sha256NormalizedV1({
    version: CONTEXT_PACK_VERSION,
    target: { id: target.id, contentHash: target.contentHash },
    neighbours: [...neighbours].map((item) => ({ id: item.id, contentHash: item.contentHash })).sort((left, right) => left.id.localeCompare(right.id)),
  })

/**
 * Build one pack per target entity, in id order.
 *
 * Neighbours are the other ends of every relation touching the target, sorted by kind then id
 * and capped; diagnostics are the open ones naming the target or citing its file; the excerpt is
 * the target's own file, read only if its bytes still hash to what the snapshot recorded.
 */
export const buildContextPacks = (options: BuildContextPacksOptions): ContextPack[] => {
  const { snapshot } = options
  const kinds = new Set(options.kinds ?? ['document'])
  const readFile = options.readFile ?? defaultReader(options.root)
  const maxBytes = packByteBudget(options.config)
  const entities = new Map(snapshot.entities.map((entity) => [entity.id, entity]))
  const areas = snapshot.entities.filter((entity) => entity.kind === 'area')
  const touching = new Map<string, { readonly other: string; readonly relation: string; readonly direction: 'out' | 'in' }[]>()
  const push = (id: string, item: { other: string; relation: string; direction: 'out' | 'in' }): void => {
    const list = touching.get(id)
    if (list) list.push(item)
    else touching.set(id, [item])
  }
  for (const relation of snapshot.relations) {
    push(relation.from, { other: relation.to, relation: relation.kind, direction: 'out' })
    push(relation.to, { other: relation.from, relation: relation.kind, direction: 'in' })
  }
  const open = (options.report?.diagnostics ?? []).filter((diagnostic) => diagnostic.status !== 'confirmed')

  const packs: ContextPack[] = []
  for (const entity of [...snapshot.entities].sort((left, right) => left.id.localeCompare(right.id))) {
    if (!kinds.has(entity.kind)) continue
    if (options.targets && !options.targets.has(entity.id)) continue
    const contentHash = entityContentHash(entity)
    const neighbours: PackNeighbour[] = (touching.get(entity.id) ?? [])
      .flatMap((item) => {
        const other = entities.get(item.other)
        return other
          ? [{ id: other.id, kind: other.kind, name: other.name, ...(other.path ? { path: other.path } : {}), contentHash: entityContentHash(other), relation: item.relation, direction: item.direction }]
          : []
      })
      .sort((left, right) => left.kind.localeCompare(right.kind) || left.id.localeCompare(right.id) || left.relation.localeCompare(right.relation))
      .filter((item, index, all) => index === 0 || item.id !== all[index - 1]?.id || item.relation !== all[index - 1]?.relation)
      .slice(0, MAX_PACK_NEIGHBOURS)
    const diagnostics: PackDiagnostic[] = open
      .filter((diagnostic) => diagnostic.entityIds?.includes(entity.id) || (entity.path !== undefined && diagnostic.evidence.some((item) => item.path === entity.path)))
      .sort((left, right) => left.id.localeCompare(right.id))
      .slice(0, MAX_PACK_DIAGNOSTICS)
      .map((diagnostic) => ({ id: diagnostic.id, code: diagnostic.code, status: diagnostic.status, severity: diagnostic.severity, message: redactSecrets(diagnostic.message).slice(0, MAX_MESSAGE) }))
    const evidence: PackEvidence[] = []
    if (entity.path && entity.evidence[0]?.contentHash) {
      const raw = readFile(entity.path)
      // A file that no longer hashes to the entity is not the entity's file: the pack describes the snapshot.
      if (raw !== undefined && sha256NormalizedV1(raw.replace(/^﻿/, '')) === entity.evidence[0].contentHash) {
        const redacted = redactSecrets(raw)
        const truncated = Buffer.byteLength(redacted, 'utf8') > MAX_EXCERPT_BYTES
        evidence.push({ path: entity.path, contentHash: entity.evidence[0].contentHash, excerpt: truncated ? redacted.slice(0, MAX_EXCERPT_BYTES) : redacted, truncated })
      }
    }
    const draft: ContextPack = {
      type: 'context-pack',
      schemaVersion: CONTEXT_PACK_VERSION,
      packHash: contextPackHash({ id: entity.id, contentHash }, neighbours),
      baseSnapshotHash: snapshot.contentHash,
      areaId: entity.kind === 'area' ? entity.id : areaFor(entity.path, areas),
      target: {
        id: entity.id,
        kind: entity.kind,
        name: redactSecrets(entity.name),
        ...(entity.path ? { path: entity.path } : {}),
        contentHash,
        aliases: [...(entity.aliases ?? [])].map(redactSecrets).sort(),
        evidence: entity.evidence.slice(0, 8).map((item) => ({ source: item.source, path: item.path, ...(item.lineStart !== undefined ? { lineStart: item.lineStart } : {}), ...(item.lineEnd !== undefined ? { lineEnd: item.lineEnd } : {}) })),
        metadata: boundedMetadata(entity.metadata),
      },
      neighbours,
      diagnostics,
      evidence,
      budget: { maxBytes, bytes: 0, dropped: [] },
    }
    packs.push(fitContextPack(draft, maxBytes))
  }
  return packs
}

/** Packs grouped by area, areas in id order, packs in id order within each: one batch per call. */
export const batchContextPacks = (packs: readonly ContextPack[]): readonly { readonly areaId: string; readonly packs: readonly ContextPack[] }[] => {
  const groups = new Map<string, ContextPack[]>()
  for (const pack of packs) {
    const list = groups.get(pack.areaId)
    if (list) list.push(pack)
    else groups.set(pack.areaId, [pack])
  }
  return [...groups.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([areaId, list]) => ({ areaId, packs: [...list].sort((left, right) => left.target.id.localeCompare(right.target.id)) }))
}
