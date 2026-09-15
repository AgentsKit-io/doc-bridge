import { sha256NormalizedV1 } from '../index-builder/content-hash.js'
import type { DiscoverySnapshotV1, Coverage, KnowledgeEntity, KnowledgeRelation } from '../schemas/knowledge.js'

/**
 * Reusing what has not changed.
 *
 * `EvidenceSchema.contentHash` has always existed and discovery never filled it, so every cache
 * and every overlay could only be keyed on "the whole repository changed" — true between any two
 * commits, and therefore useless. With a hash per file-backed entity, a second scan can tell which
 * files it has already read and skip the expensive part: the TypeScript parse and the Markdown
 * parse, which is where nearly all of discovery's time goes.
 *
 * Reuse is only sound when the answer cannot have changed, and two different things can change it:
 *
 * - An entity's own fields depend on its own bytes alone, so a hash match is enough to reuse it.
 * - A relation depends on what else exists. A module importing `./new.js` resolved to nothing
 *   before that file was added and resolves to a module after; a document mentioning `src/new.ts`
 *   gains an edge the moment the module appears. So relation reuse also requires that the universe
 *   the references resolve against is identical, which is what the fingerprints below capture.
 *
 * The consequence is that a fast run and a cold run produce the same snapshot, byte for byte, or
 * the fast run does not happen. A cache that is only usually right is worse than no cache.
 */

export const fileContentHash = (text: string): string => sha256NormalizedV1(text)

/** Kinds whose entity is one file, and therefore hashable. */
export const FILE_BACKED_KINDS = ['module', 'document', 'package'] as const

export type PriorFile = {
  readonly entity: KnowledgeEntity
  readonly contentHash: string
  /** Relations this entity is the source of. */
  readonly outgoing: readonly KnowledgeRelation[]
  /** Coverage entries scoped to this file. */
  readonly coverage: readonly Coverage[]
}

/** What a caller may hand back from a previous scan. */
export type PreviousSnapshot = Pick<DiscoverySnapshotV1, 'entities' | 'relations' | 'coverage'> &
  Partial<Pick<DiscoverySnapshotV1, 'pipelineVersion' | 'analyzerVersions' | 'configurationHash'>>

/**
 * Whether a previous snapshot may be reused at all, and why not when it may not.
 *
 * A hash says a file has not changed; it says nothing about whether *this* code would still read
 * it the same way. An analyzer that learned to record a document's headings produces different
 * entities from identical bytes, and a configuration change moves area boundaries and
 * runtime-wiring detection. So the snapshot has to have been produced by this pipeline, these
 * analyzers and this configuration — and a snapshot that does not say which is not trusted, since
 * the alternative is trusting a caller's hand-assembled input with a repository scan.
 */
export const reuseRefusal = (
  previous: PreviousSnapshot,
  current: Pick<DiscoverySnapshotV1, 'pipelineVersion' | 'analyzerVersions' | 'configurationHash'>,
): string | undefined => {
  if (!previous.pipelineVersion || !previous.analyzerVersions || !previous.configurationHash) {
    return 'the previous snapshot does not declare the pipeline, analyzers and configuration it was produced by'
  }
  if (previous.pipelineVersion !== current.pipelineVersion) {
    return `the previous snapshot was produced by pipeline ${previous.pipelineVersion}, not ${current.pipelineVersion}`
  }
  if (sha256NormalizedV1(previous.analyzerVersions) !== sha256NormalizedV1(current.analyzerVersions)) {
    return 'an analyzer version changed, so identical bytes would not produce identical entities'
  }
  if (previous.configurationHash !== current.configurationHash) return 'the configuration changed'
  return undefined
}

export type PriorSnapshot = {
  readonly modules: ReadonlyMap<string, PriorFile>
  readonly documents: ReadonlyMap<string, PriorFile>
  readonly moduleUniverse: string
  readonly resolution: string
  /** Every entity by id, for re-adding an endpoint a reused relation still points at. */
  readonly entities: ReadonlyMap<string, KnowledgeEntity>
}

const hashOf = (entity: KnowledgeEntity): string | undefined => entity.evidence[0]?.contentHash

/** Coverage scopes that belong to a single module, by the topic they start with. */
const MODULE_COVERAGE_PREFIXES = ['dynamic-imports:', 'runtime-wiring:'] as const
/** Coverage scopes that belong to a single document. */
const DOCUMENT_COVERAGE_PREFIXES = ['relations:', 'mentions-symbol:'] as const

const stringList = (value: unknown): readonly string[] =>
  Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : []

/**
 * Which names a module declares itself, as opposed to forwarding from somewhere else.
 *
 * The distinction decides where a documented symbol resolves to, and it is only visible in the
 * syntax tree — so a module that skipped its parse has to read it back from what the previous scan
 * recorded. `exports` minus `reexports` is that record.
 */
export const declaredExportsOf = (entity: KnowledgeEntity): readonly string[] => {
  const exports = stringList(entity.metadata?.exports)
  const reexports = new Set(stringList(entity.metadata?.reexports))
  return exports.filter((name) => !reexports.has(name))
}

export const exportsOf = (entity: KnowledgeEntity): readonly string[] => stringList(entity.metadata?.exports)

/**
 * What a module's references resolve against: the module paths, the packages, and the compiler
 * options that decide how a specifier becomes a path. A change to any of them can turn an
 * unresolved import into a relation, so it invalidates relation reuse for every module.
 */
export const moduleUniverseFingerprint = (input: {
  readonly modulePaths: readonly string[]
  readonly packages: readonly { readonly id: string; readonly path: string; readonly name?: string }[]
  readonly compilerOptions: unknown
}): string =>
  sha256NormalizedV1({
    modules: [...input.modulePaths].sort(),
    packages: [...input.packages].map(({ id, path, name }) => ({ id, path, ...(name ? { name } : {}) })).sort((a, b) => a.id.localeCompare(b.id)),
    compilerOptions: input.compilerOptions,
  })

/**
 * What a document's references resolve against: everything a module resolves against, plus the
 * documents, the areas, the package names and which module declares each exported symbol.
 */
export const resolutionFingerprint = (input: {
  readonly moduleUniverse: string
  readonly documentPaths: readonly string[]
  readonly areaPaths: readonly string[]
  readonly symbols: ReadonlyMap<string, readonly string[]>
}): string =>
  sha256NormalizedV1({
    moduleUniverse: input.moduleUniverse,
    documents: [...input.documentPaths].sort(),
    areas: [...input.areaPaths].sort(),
    symbols: [...input.symbols.entries()].map(([name, owners]) => [name, [...owners].sort()]).sort(([a], [b]) => String(a).localeCompare(String(b))),
  })

/**
 * Index a previous snapshot for reuse, and recompute the fingerprints it was built under.
 *
 * The fingerprints are derived rather than stored: everything they cover is in the snapshot
 * already, and a stored fingerprint is one more thing that can be stale or forged.
 */
export const indexPriorSnapshot = (previous: PreviousSnapshot, compilerOptions: unknown): PriorSnapshot => {
  const outgoing = new Map<string, KnowledgeRelation[]>()
  for (const relation of previous.relations) {
    const list = outgoing.get(relation.from)
    if (list) list.push(relation)
    else outgoing.set(relation.from, [relation])
  }

  const collect = (kind: string, prefixes: readonly string[]): Map<string, PriorFile> => {
    const paths = new Map<string, KnowledgeEntity>()
    for (const entity of previous.entities) {
      if (entity.kind !== kind || !entity.path) continue
      if (hashOf(entity)) paths.set(entity.path, entity)
    }

    /*
     * Per-file coverage, matched back to its file.
     *
     * The scope is `<topic>:<path>` or `<topic>:<path>:<detail>`, and a detail can itself contain
     * a colon, so the path is recovered by trimming from the right until a file is recognised
     * rather than by splitting on the first one.
     */
    const coverage = new Map<string, Coverage[]>()
    for (const entry of previous.coverage) {
      const prefix = prefixes.find((candidate) => entry.scope.startsWith(candidate))
      if (!prefix) continue
      let remainder = entry.scope.slice(prefix.length)
      while (remainder && !paths.has(remainder)) {
        const cut = remainder.lastIndexOf(':')
        remainder = cut < 0 ? '' : remainder.slice(0, cut)
      }
      if (!remainder) continue
      const list = coverage.get(remainder)
      if (list) list.push(entry)
      else coverage.set(remainder, [entry])
    }

    const result = new Map<string, PriorFile>()
    for (const [path, entity] of paths) {
      result.set(path, {
        entity,
        contentHash: hashOf(entity) as string,
        outgoing: outgoing.get(entity.id) ?? [],
        coverage: coverage.get(path) ?? [],
      })
    }
    return result
  }

  const modules = collect('module', MODULE_COVERAGE_PREFIXES)
  const documents = collect('document', DOCUMENT_COVERAGE_PREFIXES)
  const packages = previous.entities
    .filter((entity) => entity.kind === 'package')
    .map((entity) => ({ id: entity.id, path: entity.path ?? '.', ...(entity.name ? { name: entity.name } : {}) }))

  const symbols = new Map<string, readonly string[]>()
  const declaring = new Map<string, string[]>()
  const forwarding = new Map<string, string[]>()
  for (const [, file] of modules) {
    const declared = new Set(declaredExportsOf(file.entity))
    for (const name of exportsOf(file.entity)) {
      if (name === '*' || name === 'default') continue
      const target = declared.has(name) ? declaring : forwarding
      const list = target.get(name)
      if (list) list.push(file.entity.id)
      else target.set(name, [file.entity.id])
    }
  }
  for (const [name, owners] of declaring) symbols.set(name, owners)
  for (const [name, owners] of forwarding) if (!symbols.has(name)) symbols.set(name, owners)

  const moduleUniverse = moduleUniverseFingerprint({
    modulePaths: [...modules.keys()],
    packages,
    compilerOptions,
  })

  return {
    modules,
    documents,
    moduleUniverse,
    resolution: resolutionFingerprint({
      moduleUniverse,
      documentPaths: [...documents.keys()],
      areaPaths: previous.entities.filter((entity) => entity.kind === 'area').map((entity) => entity.path ?? ''),
      symbols,
    }),
    entities: new Map(previous.entities.map((entity) => [entity.id, entity])),
  }
}

export type ReuseLedger = {
  /** Entities taken from the previous snapshot instead of recomputed. */
  reusedEntities: number
  /** Files whose syntax tree or Markdown tree had to be built. */
  parsedFiles: string[]
  /** Files whose parse was skipped entirely. */
  skippedFiles: string[]
  /** Why relation reuse was refused, when it was. */
  invalidated: string[]
}

export const emptyLedger = (): ReuseLedger => ({ reusedEntities: 0, parsedFiles: [], skippedFiles: [], invalidated: [] })

/** How many file paths a coverage reason lists before it stops being readable. */
const LISTED_PATHS = 8

/**
 * The reuse, as coverage.
 *
 * A run that is ten times faster than the last one has to be able to say why, or nobody can tell
 * a working cache from a broken scan.
 */
export const reuseCoverage = (ledger: ReuseLedger): Coverage => {
  const total = ledger.skippedFiles.length + ledger.parsedFiles.length
  if (!ledger.skippedFiles.length && !ledger.invalidated.length) {
    return {
      analyzer: 'repository',
      scope: 'reused-entities',
      status: 'not-applicable',
      reason: `No previous snapshot was reused; parsed ${total} file(s).`,
    }
  }
  const listed = [...ledger.parsedFiles].sort().slice(0, LISTED_PATHS)
  const remainder = ledger.parsedFiles.length - listed.length
  return {
    analyzer: 'repository',
    scope: 'reused-entities',
    status: ledger.invalidated.length ? 'partial' : 'complete',
    reason: [
      `Reused ${ledger.reusedEntities} entit${ledger.reusedEntities === 1 ? 'y' : 'ies'} and skipped ${ledger.skippedFiles.length} of ${total} parse(s).`,
      ledger.parsedFiles.length
        ? `Re-parsed: ${listed.join(', ')}${remainder > 0 ? ` and ${remainder} more` : ''}.`
        : 'Nothing needed re-parsing.',
      ...ledger.invalidated.map((reason) => `Reuse refused: ${reason}.`),
    ].join(' '),
  }
}

/**
 * Replay a reused entity's outgoing relations against the entity set that exists now.
 *
 * A relation whose internal target is gone is dropped rather than carried: the file it pointed at
 * was renamed or deleted, and a graph that keeps the edge is lying about the repository. An
 * external endpoint is re-added instead, because an external entity only exists in the snapshot
 * because something referenced it, and the thing that referenced it is exactly what was reused.
 */
export const replayableRelations = (
  outgoing: readonly KnowledgeRelation[],
  existing: (id: string) => boolean,
): {
  readonly relations: readonly KnowledgeRelation[]
  readonly missingEndpoints: readonly string[]
  readonly dropped: readonly KnowledgeRelation[]
} => {
  const relations: KnowledgeRelation[] = []
  const missingEndpoints: string[] = []
  const dropped: KnowledgeRelation[] = []
  for (const relation of outgoing) {
    if (existing(relation.to)) {
      relations.push(relation)
      continue
    }
    if (relation.to.startsWith('external:') || relation.to.startsWith('unresolved:')) {
      missingEndpoints.push(relation.to)
      relations.push(relation)
      continue
    }
    dropped.push(relation)
  }
  return { relations, missingEndpoints, dropped }
}
