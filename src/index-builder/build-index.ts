import { createOperation, type OperationOptions, type RunMetrics } from '../storage/operation.js'
import { StorageFault } from '../storage/local.js'
import { restrictServiceRead } from '../execution/repository.js'
import { redactValue, redactSecrets } from '../safety/repository.js'
import { denyServiceOperation, withExecutionProfile, executionContext, isServiceProfile, bindServiceCapability, serviceCoverage, type ExecutionProfile } from '../execution/profile.js'
import { serviceConfig } from '../execution/config.js'
import { readRepositoryFiles, repositoryText, repositoryBoundedText, INDEX_READ_PATTERNS, type RepositoryFiles, type AvailabilityLimitation, type SnapshotReadBinding } from './repository-io.js'
import { readJsonArtifact, writeJsonArtifact } from './artifact-io.js'
import { samePartition, StorageFailureCodeSchema, type ArtifactIOV1, type RepositoryReadV1, type StorageRequest, type StorageFailure, type ContentRef } from '../storage/contract.js'
import { repositoryInputsFromFiles } from './project-corpus.js'
export type { SnapshotReadBinding } from './repository-io.js'
import { parseEnrichmentOverlay } from '../enrich/overlay.js'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, posix } from 'node:path'

import type { DocBridgeConfigV1 } from '../config/schema.js'
import { applyDocumentationDeclarations } from '../discovery/documentation.js'
import { discoverRepositoryForIndex } from '../discovery/repository.js'
import { readBoundedText, type TextReadBudget } from '../lib/bounded-text.js'
import { toPosix } from '../lib/paths.js'
import { DocBridgeIndexV1Schema, type DocBridgeIndexV1, type KnowledgeEntry } from '../schemas/doc-bridge-index.js'
import { RETRIEVAL_MAX_ENTRIES } from '../schemas/retrieval-index.js'
import type { DiscoverySnapshotV1 } from '../schemas/knowledge.js'
import type { RetrievalIndexV1 } from '../schemas/retrieval-index.js'
import { buildLookup, collectPackages } from './build-handoffs.js'
import { renderCapabilitiesJson } from './capabilities.js'
import { contentHashForIndex, contentHashForVersionedArtifact, SEMANTIC_HASH_ALGORITHM, LEGACY_HASH_ALGORITHM, type HashAlgorithm } from './content-hash.js'
import { renderLlmsTxt } from './llms-txt.js'
import { scanHumanDocs } from './human-adapters/index.js'
import { discoverNxProjects } from './plugins/nx.js'
import { discoverPnpmPackages } from './plugins/pnpm-monorepo.js'
import { repositoryInputs } from './project-corpus.js'
import { scanAgentCorpus } from './scan-corpus.js'
import { SEARCH_LEXICON_VERSION } from '../query/text.js'
import { projectRetrievalIndex, toKnowledgeEntry } from '../retrieval/project.js'
import { resolveSearchParams, resolveSearchWeights } from '../retrieval/weights.js'
import { projectEnrichmentOverlay, readEnrichmentOverlay } from '../enrich/overlay.js'
import type { EnrichmentOverlayV1 } from '../schemas/enrichment.js'
import { ingestMemoryCandidates } from '../memory/ingest.js'
import { linkMemoryToEntities } from '../memory/pipeline.js'
import { extractKnowledgeEntities } from '../entities/extract.js'
import type { KnowledgeEntitiesV1 } from '../schemas/knowledge-entity.js'
import { withoutDisabledKnowledgeEntities } from '../config/defaults.js'

export type BuildIndexOptions = {
  readonly profile?: ExecutionProfile
  readonly root?: string
  readonly config: DocBridgeConfigV1
  readonly write?: boolean
  /** Rebuild using the stored algorithm; ordinary regeneration selects the current algorithm. */
  readonly hashAlgorithm?: HashAlgorithm
  /**
   * A snapshot to project instead of scanning. The build scans when none is given; a caller that
   * already holds the snapshot — a workflow stage, a test — passes it so the index and the
   * artifacts it sits next to describe the same observation.
   */
  readonly snapshot?: DiscoverySnapshotV1
  /**
   * Which enrichment overlay the projection reads.
   *
   * Omitted, the builder reads the one on disk while the Registry is enabled — the normal path.
   * `'ignore'` builds the deterministic baseline even then, and an overlay object projects that
   * one instead. Both exist so the retrieval delta can measure the same snapshot twice, with the
   * overlay and without it, rather than comparing two different repositories.
   */
  readonly overlay?: EnrichmentOverlayV1 | 'ignore'
}

export type BuildIndexResult = {
  readonly index: DocBridgeIndexV1
  readonly indexPath: string
  readonly llmsTxtPath?: string
  readonly capabilitiesPath?: string
}

const projectName = (root: string, config: DocBridgeConfigV1, files?: RepositoryFiles): string => {
  if (config.project?.name) return config.project.name
  try {
    const pkg = JSON.parse(files ? repositoryText(files, root, join(root, 'package.json')) : readFileSync(join(root, 'package.json'), 'utf8')) as { name?: string }
    if (pkg.name) return pkg.name
  } catch {
    // ignore
  }
  return toPosix(root.split('/').pop() ?? 'project')
}

/**
 * Observe, declare, project.
 *
 * The snapshot is the observation; documentation declarations (`covers`, frontmatter relations)
 * are applied on top of it so a document's declared coverage ranks and routes like an observed
 * edge; the projection is computed from the result. Document bodies are read once, bounded, and
 * handed to both steps by path.
 */
const projectFromSnapshot = (
  root: string,
  config: DocBridgeConfigV1,
  given: DiscoverySnapshotV1 | undefined,
  lookup: ReturnType<typeof buildLookup>['lookup'],
  curated: readonly KnowledgeEntry[],
  requested: BuildIndexOptions['overlay'],
  hashAlgorithm: HashAlgorithm,
  files?: RepositoryFiles,
): { readonly projection: RetrievalIndexV1; readonly knowledgeEntities?: KnowledgeEntitiesV1 } => {
  const scanned = given ?? discoverRepositoryForIndex({ root, config })
  const selected = { ...scanned, contentHashAlgo: hashAlgorithm }
  const observed = { ...selected, contentHash: contentHashForVersionedArtifact(selected) }
  const budget: TextReadBudget = { used: 0 }
  const contents = new Map<string, string>()
  for (const entity of observed.entities) {
    if (entity.kind !== 'document' || !entity.path) continue
    try {
      contents.set(entity.path, files ? repositoryBoundedText(files, root, join(root, entity.path), budget) : readBoundedText(join(root, entity.path), budget))
    } catch {
      // Unreadable now: the entity still projects from what the snapshot recorded about it.
    }
  }
  if (executionContext().profile === 'service') for (const [path, content] of contents) contents.set(path, redactSecrets(content))
  const declared = applyDocumentationDeclarations(
    observed,
    [...contents.entries()].map(([path, content]) => ({ path, content })),
    { agentRoot: config.corpus.agent.root },
  ).snapshot
  /*
   * The accepted enrichment overlay is consulted only while the Registry is enabled: switching it
   * off restores the deterministic baseline exactly. The read never writes, and an entry whose
   * target moved since it was accepted is expired here rather than ranked.
   */
  const accepted = requested === 'ignore'
    ? undefined
    : (requested ?? (config.intelligence?.registry?.enabled ? readEnrichmentOverlay(root) : undefined))
  const overlay = accepted ? projectEnrichmentOverlay(accepted, declared) : undefined
  const projection = projectRetrievalIndex({
    snapshot: declared,
    config,
    routes: lookup,
    curated: curated.map((entry) => ({ id: entry.id, path: entry.path, title: entry.title, ...(entry.description ? { description: entry.description } : {}) })),
    ...(overlay ? { overlay } : {}),
    readDocument: (path) => contents.get(path),
  })
  if (!config.index?.knowledgeEntities?.enabled) return { projection }
  const knowledgeEntities = extractKnowledgeEntities({ snapshot: declared, documents: contents, ...(!files ? { gitRoot: root } : {}), window: config.index.knowledgeEntities })
  if (files || isServiceProfile(config)) {
    knowledgeEntities.coverage.push({ analyzer: 'memory-entities', analyzerVersion: '1.0.0', scope: 'memory', status: 'not-analyzed', reason: 'Captured inputs do not supply a memory source; local memory was not read.' })
  } else {
    const candidates = ingestMemoryCandidates(root, config.intelligence)
    const memoryRelations = linkMemoryToEntities(candidates, knowledgeEntities)
    if (memoryRelations.length) knowledgeEntities.memoryRelations = memoryRelations
  }
  return { projection, knowledgeEntities }
}

const existingGeneratedAt = (indexPath: string, contentHash: string): string | undefined => {
  try {
    const index = JSON.parse(readFileSync(indexPath, 'utf8')) as {
      contentHash?: unknown
      generatedAt?: unknown
    }
    return index.contentHash === contentHash && typeof index.generatedAt === 'string'
      ? index.generatedAt
      : undefined
  } catch {
    return undefined
  }
}

export const buildDocBridgeIndex = (opts: BuildIndexOptions): BuildIndexResult => withExecutionProfile(opts.profile, () => { denyServiceOperation('legacy index', opts.config); return buildIndex(opts) })

const buildIndex = (opts: BuildIndexOptions, files?: RepositoryFiles, fallbackProjectName?: string, contentRefs?: ReadonlyMap<string, ContentRef>, byteSizes?: ReadonlyMap<string, number>): BuildIndexResult => {
  const root = opts.root ?? process.cwd()
  const config = withoutDisabledKnowledgeEntities(opts.config)
  if (config.index?.knowledgeEntities?.enabled && opts.hashAlgorithm === LEGACY_HASH_ALGORITHM) throw new Error('Knowledge entities require sha256-semantic-v1; disable entities for legacy index readers.')
  const write = opts.write ?? true
  if (write && opts.hashAlgorithm === LEGACY_HASH_ALGORITHM) throw new Error('Legacy index emission is migration-only. Generate a sha256-semantic-v1 index instead.')
  const outFile = config.index?.outFile ?? '.doc-bridge/index.json'
  const indexPath = join(root, outFile)

  if (write && (opts.hashAlgorithm ?? SEMANTIC_HASH_ALGORITHM) !== LEGACY_HASH_ALGORITHM) {
    let prior: DocBridgeIndexV1 | undefined
    try { prior = DocBridgeIndexV1Schema.parse(JSON.parse(readFileSync(indexPath, 'utf8'))) } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
    }
    if (prior?.contentHashAlgo === LEGACY_HASH_ALGORITHM) {
      const expected = buildDocBridgeIndex({ ...opts, write: false, hashAlgorithm: prior.contentHashAlgo }).index
      const drift = prior.contentHash !== contentHashForIndex(prior) || prior.contentHash !== expected.contentHash
      console.warn(`Replaced index ${drift ? 'drift detected' : 'verified'} under ${prior.contentHashAlgo}; explicit regeneration migrates to ${SEMANTIC_HASH_ALGORITHM}. New readers are required.`)
    }
  }

  const corpus = scanAgentCorpus(root, config, files)
  const curated = corpus.map(({ absPath: _a, relPath: _r, frontmatter: _f, ...entry }) => entry)
  const retrieval = {
    lexiconVersion: SEARCH_LEXICON_VERSION,
    weights: resolveSearchWeights(config.retrieval?.weights),
    params: resolveSearchParams(config.retrieval?.params),
  }

  const shouldDiscover =
    config.routing?.plugin === 'pnpm-monorepo' ||
    Boolean(config.routing?.options?.packages?.length) ||
    config.routing?.plugin === 'npm-workspaces' ||
    config.routing?.plugin === 'yarn-workspaces'

  const discovered =
    config.routing?.plugin === 'nx'
      ? discoverNxProjects(root, config, files, fallbackProjectName)
      : shouldDiscover
        ? discoverPnpmPackages(root, config, files)
        : []
  const packages = collectPackages(config, discovered, corpus)
  const humanDocs = scanHumanDocs(root, config, files)

  const { lookup, handoffs } = buildLookup(config, packages, corpus, outFile, humanDocs, root, files)

  /*
   * Retrieval reads this index, so whatever is missing here is invisible to an agent however well
   * it is ranked. The projection puts every entity the snapshot observed in it — documents,
   * modules, areas, packages — next to the routes the configuration declares. It is a function of
   * the snapshot: the index has no scanner of its own, so a record retrieval can find is an entity
   * discovery observed, with the same id and the same content hash.
   */
  const projected = config.retrieval?.corpus?.enabled === false && !config.index?.knowledgeEntities?.enabled ? undefined : projectFromSnapshot(root, config, opts.snapshot, lookup, curated, opts.overlay, opts.hashAlgorithm ?? SEMANTIC_HASH_ALGORITHM, files)
  const projection = config.retrieval?.corpus?.enabled === false ? undefined : projected?.projection
  const inputs = projected ? files ? repositoryInputsFromFiles(files, config, opts.hashAlgorithm ?? SEMANTIC_HASH_ALGORITHM, contentRefs, byteSizes) : repositoryInputs(root, config, opts.hashAlgorithm ?? SEMANTIC_HASH_ALGORITHM) : undefined
  const curatedPaths = new Set(curated.map((entry) => entry.path))
  /*
   * `knowledge[]` keeps every reader that predates the projection working: the curated sidecars
   * first, in reading order, then every projected document and module. Body text lives once, in
   * the projection, so a projected index carries no bodies here.
   */
  const knowledge: KnowledgeEntry[] = projection
    ? [
        ...curated.map(({ body: _body, ...entry }) => entry),
        ...projection.entries
          .filter((entry) => (entry.kind === 'document' || entry.kind === 'module') && !curatedPaths.has(entry.path))
          .map(toKnowledgeEntry),
      ]
    : curated

  let index: DocBridgeIndexV1 = {
    schemaVersion: 1,
    contentHash: '0'.repeat(64),
    contentHashAlgo: opts.hashAlgorithm ?? SEMANTIC_HASH_ALGORITHM,
    generatedAt: new Date().toISOString(),
    project: { name: files && !files.has('package.json') && !config.project?.name ? fallbackProjectName ?? 'project' : projectName(root, config, files), root: '.' },
    knowledge,
    handoffs,
    lookup,
    ...(inputs ? { inputs } : {}),
    retrieval,
    ...(projection ? { projection } : {}),
    ...(projected?.knowledgeEntities ? { knowledgeEntities: projected.knowledgeEntities } : {}),
  }

  if (executionContext().profile === 'service') index = DocBridgeIndexV1Schema.parse(redactValue(index))
  index.contentHash = contentHashForIndex(index)
  if (executionContext().profile === 'service') bindServiceCapability(index)
  index.generatedAt = (files ? undefined : existingGeneratedAt(indexPath, index.contentHash)) ?? index.generatedAt

  /*
   * An artifact its own parser refuses is not an artifact. The bound on `knowledge[]` used to be
   * lower than the bound on the projection it mirrors, so a large repository got an index that
   * `index` reported writing and every reader — `doctor`, `search`, the MCP server — then rejected,
   * with a schema dump naming an array instead of a corpus. The bounds are one constant now; this
   * says so at the point of production, where the numbers and the remedy are both known.
   */
  if (knowledge.length > RETRIEVAL_MAX_ENTRIES) {
    throw new Error(
      `The index would carry ${knowledge.length} knowledge entries, above the ${RETRIEVAL_MAX_ENTRIES} an index may hold. ` +
        'Narrow the corpus with `corpus.*.include` or `corpus.*.exclude`, or split the repository into more than one index.',
    )
  }

  if (write) {
    mkdirSync(dirname(indexPath), { recursive: true })
    writeFileSync(indexPath, `${JSON.stringify(index, null, 2)}\n`, 'utf8')
  }

  let llmsTxtPath: string | undefined
  let llmsTxtRelPath: string | undefined
  if (config.index?.llmsTxt?.enabled !== false) {
    const llmsOut = config.index?.llmsTxt?.outFile ?? 'llms.txt'
    llmsTxtRelPath = toPosix(llmsOut)
    llmsTxtPath = join(root, llmsOut)
    if (write) {
      writeFileSync(
        llmsTxtPath,
        renderLlmsTxt(config, knowledge, index.project?.name ?? 'project', { root }),
        'utf8',
      )
    }
  }

  let capabilitiesPath: string | undefined
  if (config.index?.capabilities?.enabled !== false) {
    const capabilitiesOut = config.index?.capabilities?.outFile ?? '.doc-bridge/capabilities.json'
    capabilitiesPath = join(root, capabilitiesOut)
    if (write) {
      mkdirSync(dirname(capabilitiesPath), { recursive: true })
      writeFileSync(
        capabilitiesPath,
        renderCapabilitiesJson(config, index, {
          index: toPosix(outFile),
          ...(llmsTxtRelPath ? { llmsTxt: llmsTxtRelPath } : {}),
        }),
        'utf8',
      )
    }
  }

  return {
    index,
    indexPath: toPosix(indexPath),
    ...(llmsTxtPath ? { llmsTxtPath: toPosix(llmsTxtPath) } : {}),
    ...(capabilitiesPath ? { capabilitiesPath: toPosix(capabilitiesPath) } : {}),
  }
}


export type BuildStoredIndexOptions = StorageRequest & OperationOptions & {
  readonly profile?: ExecutionProfile
  readonly repository: RepositoryReadV1
  readonly artifacts: ArtifactIOV1
  readonly config: DocBridgeConfigV1
  readonly snapshot: DiscoverySnapshotV1
  /** Trusted caller receipt from the same verified capture; absent means full verification. */
  readonly snapshotBinding?: SnapshotReadBinding
  readonly overlay?: EnrichmentOverlayV1 | 'ignore'
  readonly hashAlgorithm?: HashAlgorithm
  readonly write?: boolean
}

/** Exact-partition build. Local export files and Git migration belong to the sync facade. */
export const buildStoredDocBridgeIndex = async (options: BuildStoredIndexOptions): Promise<{ status: 'ok'; value: { index: DocBridgeIndexV1; limitations: readonly AvailabilityLimitation[]; coverage?: DiscoverySnapshotV1['coverage']; byteHash?: string; metrics?: RunMetrics } } | (StorageFailure & { limitations?: readonly AvailabilityLimitation[]; coverage?: DiscoverySnapshotV1['coverage']; metrics?: RunMetrics })> => withExecutionProfile(isServiceProfile(options.config) || isServiceProfile(options.snapshot) ? 'service' : options.profile, async () => {
  if (executionContext().profile === 'service') { const config = serviceConfig(options.config).config; const { snapshotBinding: _binding, ...rest } = options; options = { ...rest, config, repository: restrictServiceRead(options.repository, config), overlay: 'ignore' } }
  const operation = createOperation(options.repository, options)
  options = { ...options, repository: operation.read, signal: operation.signal }
  try {
    operation.boundary('index-acquisition')
    if (options.write !== false && options.hashAlgorithm === LEGACY_HASH_ALGORITHM) return { status: 'denied', code: 'INVALID_CONTRACT', ...(options.collectMetrics ? { metrics: operation.finish() } : {}) }
    const incomplete = options.snapshot.coverage.find(entry => entry.status === 'partial' && entry.scope.startsWith('limits:'))
    if (incomplete) {
      const parsed = StorageFailureCodeSchema.safeParse(incomplete.reason)
      const code = parsed.success ? parsed.data : 'FILE_LIMIT'
      return { status: code === 'ABORTED' ? 'cancelled' : 'limit', code, coverage: [incomplete], ...(options.collectMetrics ? { metrics: operation.finish() } : {}) }
    }
    const coverage = executionContext().profile === 'service' ? serviceCoverage(serviceConfig(options.config).diagnostics) : undefined
    const profileResult = coverage ? { coverage } : {}
    const request = { partition: options.partition, signal: options.signal }
    if (!samePartition(options.repository.partition, options.partition) || !samePartition(options.artifacts.partition, options.partition)) return { status: 'denied', code: 'PARTITION_MISMATCH', ...(options.collectMetrics ? { metrics: operation.finish() } : {}) }
    const expected = new Map<string, string>()
    for (const entity of options.snapshot.entities) {
      if (entity.kind !== 'document' || !entity.path) continue
      const hash = entity.evidence.find(evidence => evidence.path === entity.path)?.contentHash ?? entity.evidence[0]?.contentHash
      if (!hash) return { status: 'denied', code: 'INVALID_CONTRACT', ...(options.collectMetrics ? { metrics: operation.finish() } : {}) }
      expected.set(entity.path, hash)
    }
    const consumedPaths = new Set(['doc-bridge.config.ts', 'doc-bridge.config.mts', 'doc-bridge.config.js', 'doc-bridge.config.mjs', 'doc-bridge.config.cjs'])
    const human = options.config.corpus.human
    for (const config of human ? Array.isArray(human) ? human : [human] : []) {
      if (typeof config.options?.sidebarsFile === 'string') consumedPaths.add(posix.normalize(toPosix(config.options.sidebarsFile)))
    }
    const sourceCapture = options.snapshotBinding && options.config.safety?.maxBytes === undefined && options.limits?.maxBytes === undefined && options.limits?.maxFileBytes === undefined ? { snapshot: options.snapshot, binding: options.snapshotBinding, consumedPaths } : undefined
    const { files, contentRefs, byteSizes, limitations } = await readRepositoryFiles(options.repository, request, INDEX_READ_PATTERNS, expected, sourceCapture)
    const stopped = limitations.find(limitation => limitation.status === 'limit' || limitation.status === 'cancelled')
    if (stopped) return { ...stopped, limitations, coverage: operation.coverage(stopped), ...(options.collectMetrics ? { metrics: operation.finish() } : {}) }
    if (limitations.some(limitation => limitation.path === '.')) return { status: limitations[0]!.status, code: limitations[0]!.code, limitations, ...(options.collectMetrics ? { metrics: operation.finish() } : {}) }
    const key = { kind: 'index', name: 'index' } as const
    const prior = await readJsonArtifact(options.artifacts, request, key, 'DocBridgeIndexV1', value => DocBridgeIndexV1Schema.parse(value))
    if (prior.status !== 'ok' && prior.status !== 'missing') return { ...prior, ...(options.collectMetrics ? { metrics: operation.finish() } : {}), coverage: operation.coverage(prior) }
    let overlay = options.overlay
    if (overlay === undefined && options.config.intelligence?.registry?.enabled) {
      const stored = await readJsonArtifact(options.artifacts, request, { kind: 'overlay', name: 'overlay' }, 'EnrichmentOverlayV1', value => {
        const parsed = parseEnrichmentOverlay(value)
        if (!parsed) throw new Error('Invalid overlay')
        return parsed
      })
      if (stored.status === 'ok') overlay = stored.value.value
      else if (stored.status !== 'missing') return { ...stored, ...(options.collectMetrics ? { metrics: operation.finish() } : {}), coverage: operation.coverage(stored) }
    }
    operation.boundary('index-projection')
    const index = buildIndex({ root: '/repository', config: options.config, write: false, snapshot: options.snapshot, overlay: overlay ?? 'ignore', ...(options.hashAlgorithm ? { hashAlgorithm: options.hashAlgorithm } : {}) }, files, options.snapshot.project.name, contentRefs, byteSizes).index
    if (prior.status === 'ok' && prior.value.value.contentHash === index.contentHash) index.generatedAt = prior.value.value.generatedAt
    operation.boundary('index-publication')
    if (options.write === false) return { status: 'ok', value: { index, limitations, ...profileResult, ...(options.collectMetrics ? { metrics: operation.finish() } : {}) } }
    const saved = await writeJsonArtifact(options.artifacts, request, key, 'DocBridgeIndexV1', index, prior.status === 'ok' ? prior.value.byteHash : null)
    return saved.status === 'ok' ? { status: 'ok', value: { index, limitations, ...profileResult, ...(options.collectMetrics ? { metrics: operation.finish() } : {}), byteHash: saved.value.byteHash } } : { ...saved, coverage: operation.coverage(saved), ...(options.collectMetrics ? { metrics: operation.finish() } : {}) }
  } catch (error) {
    if (!(error instanceof StorageFault)) throw error
    return { ...error.failure, coverage: operation.coverage(error.failure), ...(options.collectMetrics ? { metrics: operation.finish() } : {}) }
  }
})
