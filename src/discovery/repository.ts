import { restrictServiceRead } from '../execution/repository.js'
import { redactValue } from '../safety/repository.js'
import { denyServiceOperation, withExecutionProfile, executionContext, isServiceProfile, bindServiceCapability, serviceCoverage, type ExecutionProfile } from '../execution/profile.js'
import { serviceConfig } from '../execution/config.js'
import { FACT_EXTRACTORS, factAnalyzerVersions, runFactExtractors } from './facts/index.js'
import { execFileSync } from 'node:child_process'
import { basename, relative, resolve } from 'node:path'

import type { DocBridgeConfigV1 } from '../config/schema.js'
import { toPosix } from '../lib/paths.js'
import { contentHashForVersionedArtifact, SEMANTIC_HASH_ALGORITHM, sha256NormalizedV1 } from '../index-builder/content-hash.js'
import { extractionGraph, createReplayRelations } from './plugins/built-in.js'
import { createJsTsPluginV2, createJsTsExtraction } from './plugins/js-ts.js'
import { createMarkdownPluginV2, createMarkdownExtraction } from './plugins/markdown.js'
import { preloadScan } from './preload.js'
import { createDiscoveryRegistryV2, type DiscoveryPluginV2, type ExtractionV2 } from '../plugins/contract.js'
import { surfaceFactToEntity, packageFactToEntity } from '../storage/facts.js'
import type { RepositoryReadV1, Partition } from '../storage/contract.js'
import { createLocalScanIO, type ScanIO } from './scan-io.js'
import { GRAPH_ANALYZER_VERSION, areaSuggestionCoverage } from '../graph/build.js'
import { deriveAreas, type AreaModule } from './areas.js'
import { entityId } from './identity.js'
import { reuseCoverage, factResolutionUniverse, type PreviousSnapshot } from './incremental.js'
import { MARKDOWN_ANALYZER_VERSION, type MarkdownFact } from './markdown.js'
import { DEFAULT_MAX_FILES, safeWalkOptions } from './inputs.js'
import {
  DiscoverySnapshotV1Schema,
  type DiscoverySnapshotV1,
  type KnowledgeEntity,
  type KnowledgeRelation,
} from '../schemas/knowledge.js'

const EMPTY_HASH = '0'.repeat(64)

type DiscoveryOptions = {
  readonly profile?: ExecutionProfile
  readonly root?: string
  readonly config?: DocBridgeConfigV1
  readonly maxFiles?: number
  readonly maxBytes?: number
  /**
   * A snapshot from a previous scan.
   *
   * Entities whose file hash is unchanged are taken from it instead of parsed again. Supplying one
   * cannot change the result: a reused run either produces the same snapshot a cold run would, or
   * the reuse is refused. Omit it to scan from scratch.
   */
  readonly previous?: PreviousSnapshot
}

const sourceRevision = (root: string, files: readonly string[], readText: (path: string) => string): { readonly value: string; readonly kind: 'git' | 'content' } => {
  const contentRevision = (): { readonly value: string; readonly kind: 'content' } => ({
    value: sha256NormalizedV1(
      files.map((path) => ({
        path: toPosix(relative(root, path)) || '.',
        contentHash: sha256NormalizedV1(readText(path)),
      })),
    ),
    kind: 'content',
  })

  if (isServiceProfile()) return contentRevision()
  try {
    const status = execFileSync('git', ['status', '--porcelain', '--untracked-files=all'], {
      cwd: root,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim()
    if (status) return contentRevision()
    const value = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim()
    if (value) return { value, kind: 'git' }
  } catch {
    // Not a Git checkout.
  }
  return contentRevision()
}

export const PIPELINE_VERSION = '1.5.0'
export const ANALYZER_VERSIONS: Readonly<Record<string, string>> = { repository: '1.3.0', 'js-ts': '1.4.0', markdown: MARKDOWN_ANALYZER_VERSION, graph: GRAPH_ANALYZER_VERSION, ...factAnalyzerVersions() }
const configurationHashOf = (config: DocBridgeConfigV1 | undefined): string => sha256NormalizedV1(config ?? {})

const artifact = (root: string, config: DocBridgeConfigV1 | undefined, files: readonly string[], entities: readonly KnowledgeEntity[], relations: readonly KnowledgeRelation[], coverage: DiscoverySnapshotV1['coverage'], suppliedRevision: { readonly value: string; readonly kind: 'git' | 'content' }): DiscoverySnapshotV1 => {
  const revision = suppliedRevision
  const base = {
    type: 'discovery-snapshot' as const,
    schemaVersion: 1 as const,
    contentHash: EMPTY_HASH,
    contentHashAlgo: SEMANTIC_HASH_ALGORITHM,
    project: { name: (entities.find((entity) => entity.kind === 'package' && entity.path === '.')?.name ?? basename(root)), root: '.' },
    sourceRevision: revision.value,
    sourceRevisionKind: revision.kind,
    configurationHash: configurationHashOf(config),
    pipelineVersion: PIPELINE_VERSION,
    analyzerVersions: ANALYZER_VERSIONS,
    entities: [...entities].sort((a, b) => a.id.localeCompare(b.id)),
    relations: [...relations].sort((a, b) => a.id.localeCompare(b.id)),
    coverage: coverage.map((entry) => ({ ...entry, analyzerVersion: entry.analyzerVersion ?? (ANALYZER_VERSIONS[entry.analyzer] ?? '1.0.0') })),
  }
  return DiscoverySnapshotV1Schema.parse({ ...base, contentHash: contentHashForVersionedArtifact(base) })
}

const addAreas = ({ entities, relations, addEntity, addRelation }: ReturnType<typeof extractionGraph>, areaModules: readonly AreaModule[], opts: DiscoveryOptions) => {
  /*
   * Areas: the directory level between a package and a file.
   *
   * Derived from convention and from what an ownership record already names, then attached to the
   * graph with `contains` — package to area, area to its nested areas, area to module. Each
   * module belongs to exactly one area, the most specific one, so an aggregation at area scope
   * has one answer per module.
   */
  const areas = deriveAreas({
    modules: areaModules,
    ownership: Object.entries(opts.config?.routing?.options?.ownership ?? {}).map(([id, record]) => ({ id, path: record.path })),
    ...(opts.config?.analysis?.areas?.depth !== undefined ? { depth: opts.config.analysis.areas.depth } : {}),
    ...(opts.config?.analysis?.areas?.roots !== undefined ? { roots: opts.config.analysis.areas.roots } : {}),
    ...(opts.config?.analysis?.areas?.exclude !== undefined ? { exclude: opts.config.analysis.areas.exclude } : {}),
  })
  const areasById = new Map(areas.map((area) => [area.id, area]))
  const areasByPath = new Map(areas.map((area) => [area.path, area.id]))

  for (const area of areas) {
    addEntity({
      id: area.id,
      kind: 'area',
      name: area.name,
      path: area.path,
      provenance: 'observed',
      evidence: [
        {
          source: 'derived',
          path: area.path,
          context: `Directory groups ${area.moduleIds.length} module(s).`,
        },
      ],
      metadata: {
        moduleCount: area.moduleIds.length,
        ...(area.ownershipId ? { ownershipId: area.ownershipId } : {}),
      },
    })

    const parent = area.parentId && areasById.has(area.parentId) ? area.parentId : area.packageId
    addRelation({
      id: entityId('relation', `${parent}:contains:${area.id}`),
      kind: 'contains',
      from: parent,
      to: area.id,
      provenance: 'observed',
      evidence: [{ source: 'derived', path: area.path }],
    })
    for (const moduleId of area.moduleIds) {
      addRelation({
        id: entityId('relation', `${area.id}:contains:${moduleId}`),
        kind: 'contains',
        from: area.id,
        to: moduleId,
        provenance: 'observed',
        evidence: [{ source: 'derived', path: area.path }],
      })
    }
  }

  return { areas, areasByPath }
}

export const createDiscoveryScan = (io: ScanIO, retainFactTrees = true) => {
  const jsTs = createJsTsExtraction(io, retainFactTrees)
  const markdown = createMarkdownExtraction(io)
  const { relativePath } = jsTs
  return (opts: DiscoveryOptions = {}, documents = true): DiscoverySnapshotV1 => {
  const root = resolve(opts.root ?? process.cwd())
  const safeOptions = safeWalkOptions(opts.config, {
    maxFiles: opts.maxFiles ?? opts.config?.safety?.maxFiles ?? DEFAULT_MAX_FILES,
    ...(opts.maxBytes !== undefined ? { maxBytes: opts.maxBytes } : {}),
  })
  const { packageResult, sourceWalk, configWalk, sourcePaths, inputFiles, rootManifest } = jsTs.inputs(root, opts, safeOptions)
  const documentWalk = io.walk(markdown.documentExtensions, safeOptions)
  const documentPaths = documentWalk.files
  const allFiles = [...new Set([...inputFiles, ...documentPaths].filter(io.exists))].sort()

  const { entities, relations, addEntity, addRelation } = extractionGraph()

  const source = jsTs.prepare({ root, opts, sourcePaths, packageResult, entities, relations, addEntity, addRelation })
  const { compiler, ledger, prior, moduleUniverse, modules, modulesByPath, areaModules } = source

  const { areas, areasByPath } = addAreas({ entities, relations, addEntity, addRelation }, areaModules, opts)

  const coverage = jsTs.initialCoverage(root, rootManifest, packageResult, compiler, [sourceWalk, documentWalk, configWalk])

  const facts = new Map<string, MarkdownFact[]>()
  const extracted = runFactExtractors({ root, io, modules, parsedTrees: source.sourceFiles, retainTrees: retainFactTrees, packages: packageResult.packages, walkOptions: safeOptions, ...(prior && opts.previous ? { previous: opts.previous } : {}) })
  for (const fact of extracted.facts) {
    addEntity(surfaceFactToEntity(fact))
    facts.set(fact.name, [...(facts.get(fact.name) ?? []), fact])
  }
  coverage.push(...extracted.coverage)
  const packageVersions = jsTs.extractPackages(root, packageResult.packages)
  coverage.push(...packageVersions.coverage)
  for (const pkg of packageVersions.packages) {
    entities.set(pkg.id, packageFactToEntity(pkg, entities.get(pkg.id)))
    facts.set(pkg.purl, [{ kind: 'package', name: pkg.purl, ownerId: pkg.id }])
  }

  /*
   * What the documentation says, as edges.
   *
   * A link to another document, a path in inline code, an exported name in backticks: each is a
   * claim the repository makes about itself, with a line number to check it against. Package
   * names resolve by their manifest name and, when unambiguous, by their directory name.
   */
  const { replayRelations } = documents ? markdown.extract({ root, opts, documentPaths, packageResult, entities, relations, addEntity, addRelation, coverage, ...source, areas, areasByPath, ...(FACT_EXTRACTORS.length ? { facts, moduleUniverse: factResolutionUniverse(moduleUniverse, [...facts.values()].flat()) } : {}) }) : { replayRelations: createReplayRelations({ entities, relations, addEntity, addRelation }, new Set([...modulesByPath.values(), ...documentPaths.map(path => entityId('document', relativePath(root, path)))])) }

  jsTs.finish({ root, opts, packageResult, entities, relations, addEntity, addRelation, coverage, ...source, replayRelations })

  /*
   * Community suggestions, last, because they need the finished import graph.
   *
   * A cluster of modules that move together is a hypothesis about where an area boundary might
   * be. It is reported as coverage — status `not-analyzed`, because whether the cluster is an area
   * is a question nobody has answered — and never as an area entity. A clustering algorithm does
   * not get to name the architecture.
   */
  coverage.push(
    ...areaSuggestionCoverage({ entities: [...entities.values()], relations: [...relations.values()] }),
  )

  /*
   * What this run reused, last, because only now is it known.
   *
   * A run that finishes in a tenth of the time has to be able to say why. This entry is the one
   * part of the snapshot that describes the run rather than the repository — the entities, the
   * relations and every other coverage entry are identical to what a cold scan would produce.
   */
  coverage.push(reuseCoverage(ledger))

  const revisionFiles = [...new Set([...allFiles, ...extracted.coverage.flatMap(entry => (entry.evidence ?? []).map(item => resolve(root, item.path))).filter(path => io.host.fileExists(path))])].sort()
  const snapshot = artifact(root, opts.config, revisionFiles, [...entities.values()], [...relations.values()], coverage, io.revision ?? sourceRevision(root, revisionFiles, io.readText))
  extracted.remember(snapshot)
  return snapshot
}

}

export const discoverRepository = (opts: DiscoveryOptions = {}): DiscoverySnapshotV1 => withExecutionProfile(opts.profile, () => { denyServiceOperation('legacy discovery', opts.config); return createDiscoveryScan(createLocalScanIO(resolve(opts.root ?? process.cwd()), opts))(opts) })

/** Index-owned snapshots do not need to retain syntax trees for incremental reuse. */
export const discoverRepositoryForIndex = (opts: DiscoveryOptions): DiscoverySnapshotV1 => withExecutionProfile(opts.profile, () => { denyServiceOperation('legacy discovery', opts.config); return createDiscoveryScan(createLocalScanIO(resolve(opts.root ?? process.cwd()), opts), false)(opts) })

export type DiscoveryReadOptions = DiscoveryOptions & {
  readonly signal?: AbortSignal
  readonly sourceRevisionKind?: 'git' | 'content'
  readonly plugins?: readonly DiscoveryPluginV2[]
  readonly replaceSourcePlugins?: boolean
}

export type DiscoveryReadResult = Readonly<{
  snapshot: DiscoverySnapshotV1
  binding: Readonly<{ partition: Partition; snapshotHash: string; visibilityPolicyHash: string }>
}>

/** Caller binds exact source provenance; acquisition cannot infer another revision. */
export const discoverRepositoryWithRead = async (read: RepositoryReadV1, opts: DiscoveryReadOptions = {}): Promise<DiscoveryReadResult> => withExecutionProfile(isServiceProfile(opts.config) ? 'service' : opts.profile, async () => {
  const filtered = executionContext().profile === 'service' ? serviceConfig(opts.config ?? { schemaVersion: 1, corpus: { agent: { root: 'docs/agent' } } }) : undefined
  if (filtered) { opts = { ...opts, config: filtered.config }; read = restrictServiceRead(read, filtered.config) }
  const root = resolve(opts.root ?? 'repository')
  const partition = Object.freeze({ ...read.partition })
  const signal = opts.signal ?? new AbortController().signal
  const ceilings = createMarkdownPluginV2().manifest.resourceLimits
  for (const key of Object.keys(ceilings) as (keyof typeof ceilings)[]) if (read.limits[key] > ceilings[key]) throw new Error('INCOMPATIBLE_RESOURCE_LIMITS')
  const io = await preloadScan(read, signal, root).catch(error => {
    if (filtered) throw new Error('not-analyzed: service repository acquisition ' + (error instanceof Error ? error.message : 'failed'))
    throw error
  })
  const bound = (snapshot: DiscoverySnapshotV1): DiscoveryReadResult => {
    if (filtered) {
      const value = DiscoverySnapshotV1Schema.parse(redactValue({ ...snapshot, coverage: [...snapshot.coverage, ...serviceCoverage([...filtered.diagnostics, ...(filtered.config.safety?.exclude ?? []).map(path => `safety.exclude: ${path}`), ...(filtered.config.audit?.documentation?.generatedPaths ?? []).map(path => `audit.documentation.generatedPaths: ${path}`), ...(filtered.config.audit?.documentation?.exclude ?? []).map(path => `audit.documentation.exclude: ${path}`)])] }))
      snapshot = bindServiceCapability(DiscoverySnapshotV1Schema.parse({ ...value, contentHash: contentHashForVersionedArtifact(value) }))
    }
    return { snapshot, binding: { partition, snapshotHash: snapshot.contentHash, visibilityPolicyHash: io.visibilityPolicyHash! } }
  }
  const provenance = { value: partition.revision, kind: opts.sourceRevisionKind ?? 'content' as const }
  const scan = createDiscoveryScan({ ...io, revision: provenance })
  // The compatibility fast path runs the identical built-in stages as the synchronous facade.
  if (!opts.plugins?.length && !opts.replaceSourcePlugins) return bound(scan({ ...opts, root }))
  const source = createJsTsPluginV2()
  const documents = createMarkdownPluginV2([source, ...(opts.plugins ?? [])])
  const registry = createDiscoveryRegistryV2({ builtIns: [
    { plugin: source, analyzerVersions: { 'js-ts': source.manifest.version, ...factAnalyzerVersions() } },
    { plugin: documents, analyzerVersions: { markdown: documents.manifest.version } },
  ] })
  if (!opts.replaceSourcePlugins) registry.register(source)
  registry.register(documents)
  for (const plugin of opts.plugins ?? []) registry.register(plugin)
  const graph = extractionGraph()
  const coverage: DiscoverySnapshotV1['coverage'] = []
  const packageOwners = new Set<string>()
  const merge = (output: ExtractionV2): void => {
    for (const entity of output.entities) {
      if (graph.entities.has(entity.id)) throw new Error('DUPLICATE_OWNER')
      graph.addEntity(entity)
    }
    for (const relation of output.relations) {
      if (graph.relations.has(relation.id)) throw new Error('DUPLICATE_OUTPUT')
      graph.addRelation(relation)
    }
    for (const fact of output.facts) {
      if (graph.entities.has(fact.id)) throw new Error('DUPLICATE_OWNER')
      graph.addEntity(surfaceFactToEntity(fact))
    }
    for (const pkg of output.packages) {
      if (packageOwners.has(pkg.id)) throw new Error('DUPLICATE_OWNER')
      packageOwners.add(pkg.id)
      const existing = graph.entities.get(pkg.id)
      graph.entities.set(pkg.id, packageFactToEntity(pkg, existing))
    }
    coverage.push(...output.coverage)
  }
  const configured = [...(opts.plugins ?? [])].sort((a,b) => a.manifest.id.localeCompare(b.manifest.id))
  const execute = async (plugin: DiscoveryPluginV2): Promise<void> => {
    const output = await registry.discover(plugin.manifest.id, { read, signal, configuration: opts.config ?? {}, resolution: { entities: [...graph.entities.values()], relations: [...graph.relations.values()] } })
    merge(output)
  }
  const sourcePlugins = [...(opts.replaceSourcePlugins ? [] : [source]), ...configured.filter(plugin => !plugin.manifest.capabilities.includes('markdown'))].sort((a,b) => a.manifest.id.localeCompare(b.manifest.id))
  for (const plugin of sourcePlugins) {
    if (plugin !== source) { await execute(plugin); continue }
    const initial = scan({ ...opts, root }, false)
    merge({ entities: initial.entities, relations: initial.relations, facts: [], packages: [], diagnostics: [], coverage: initial.coverage.filter(entry => entry.scope !== 'incremental-reuse') })
  }
  const packages = [...graph.entities.values()].filter(entity => entity.kind === 'package' && entity.path)
  const areaModules = [...graph.entities.values()].filter(entity => entity.kind === 'module' && entity.path).flatMap(entity => {
    const owner = packages.filter(pkg => pkg.path === '.' || entity.path!.startsWith(`${pkg.path}/`)).sort((a,b) => b.path!.length - a.path!.length)[0]
    return owner ? [{ moduleId: entity.id, path: entity.path!, packageId: owner.id, packagePath: owner.path! }] : []
  })
  addAreas(graph, areaModules, opts)
  for (const plugin of [documents, ...configured.filter(plugin => plugin.manifest.capabilities.includes('markdown'))].sort((a,b) => a.manifest.id.localeCompare(b.manifest.id))) await execute(plugin)
  const mergedCoverage = coverage.filter(entry => entry.analyzer !== 'graph')
  mergedCoverage.push(...areaSuggestionCoverage({ entities: [...graph.entities.values()], relations: [...graph.relations.values()] }))
  const sealed = artifact(root, opts.config, [], [...graph.entities.values()], [...graph.relations.values()], mergedCoverage, provenance)
  const semantic = {
    ...sealed,
    configurationHash: sha256NormalizedV1({ configuration: opts.config ?? {}, replaceSourcePlugins: opts.replaceSourcePlugins ?? false, plugins: configured.map(plugin => plugin.manifest) }),
    analyzerVersions: { ...(opts.replaceSourcePlugins ? { markdown: documents.manifest.version, graph: GRAPH_ANALYZER_VERSION } : ANALYZER_VERSIONS), ...Object.fromEntries(configured.map(plugin => [plugin.manifest.id, plugin.manifest.version])) },
  }
  return bound(DiscoverySnapshotV1Schema.parse({ ...semantic, contentHash: contentHashForVersionedArtifact(semantic) }))
})

export type { DiscoveryOptions }
