import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'

import type { DocBridgeConfigV1 } from '../config/schema.js'
import { applyDocumentationDeclarations } from '../discovery/documentation.js'
import { discoverRepository } from '../discovery/repository.js'
import { readBoundedText, type TextReadBudget } from '../lib/bounded-text.js'
import { toPosix } from '../lib/paths.js'
import type { DocBridgeIndexV1, KnowledgeEntry } from '../schemas/doc-bridge-index.js'
import type { DiscoverySnapshotV1 } from '../schemas/knowledge.js'
import type { RetrievalIndexV1 } from '../schemas/retrieval-index.js'
import { buildLookup, collectPackages } from './build-handoffs.js'
import { renderCapabilitiesJson } from './capabilities.js'
import { sha256NormalizedV1 } from './content-hash.js'
import { renderLlmsTxt } from './llms-txt.js'
import { scanHumanDocs } from './human-adapters/index.js'
import { discoverNxProjects } from './plugins/nx.js'
import { discoverPnpmPackages } from './plugins/pnpm-monorepo.js'
import { repositoryInputs } from './project-corpus.js'
import { scanAgentCorpus } from './scan-corpus.js'
import { SEARCH_LEXICON_VERSION } from '../query/text.js'
import { projectRetrievalIndex, toKnowledgeEntry } from '../retrieval/project.js'
import { resolveSearchParams, resolveSearchWeights } from '../retrieval/weights.js'

export type BuildIndexOptions = {
  readonly root?: string
  readonly config: DocBridgeConfigV1
  readonly write?: boolean
  /**
   * A snapshot to project instead of scanning. The build scans when none is given; a caller that
   * already holds the snapshot — a workflow stage, a test — passes it so the index and the
   * artifacts it sits next to describe the same observation.
   */
  readonly snapshot?: DiscoverySnapshotV1
}

export type BuildIndexResult = {
  readonly index: DocBridgeIndexV1
  readonly indexPath: string
  readonly llmsTxtPath?: string
  readonly capabilitiesPath?: string
}

const projectName = (root: string, config: DocBridgeConfigV1): string => {
  if (config.project?.name) return config.project.name
  try {
    const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')) as { name?: string }
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
): { readonly projection: RetrievalIndexV1 } => {
  const observed = given ?? discoverRepository({ root, config })
  const budget: TextReadBudget = { used: 0 }
  const contents = new Map<string, string>()
  for (const entity of observed.entities) {
    if (entity.kind !== 'document' || !entity.path) continue
    try {
      contents.set(entity.path, readBoundedText(join(root, entity.path), budget))
    } catch {
      // Unreadable now: the entity still projects from what the snapshot recorded about it.
    }
  }
  const declared = applyDocumentationDeclarations(
    observed,
    [...contents.entries()].map(([path, content]) => ({ path, content })),
    { agentRoot: config.corpus.agent.root },
  ).snapshot
  const projection = projectRetrievalIndex({
    snapshot: declared,
    config,
    routes: lookup,
    curated: curated.map((entry) => ({ id: entry.id, path: entry.path, title: entry.title, ...(entry.description ? { description: entry.description } : {}) })),
    readDocument: (path) => contents.get(path),
  })
  return { projection }
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

export const buildDocBridgeIndex = (opts: BuildIndexOptions): BuildIndexResult => {
  const root = opts.root ?? process.cwd()
  const config = opts.config
  const write = opts.write ?? true
  const outFile = config.index?.outFile ?? '.doc-bridge/index.json'
  const indexPath = join(root, outFile)

  const corpus = scanAgentCorpus(root, config)
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
      ? discoverNxProjects(root, config)
      : shouldDiscover
        ? discoverPnpmPackages(root, config)
        : []
  const packages = collectPackages(config, discovered, corpus)
  const humanDocs = scanHumanDocs(root, config)

  const { lookup, handoffs } = buildLookup(config, packages, corpus, outFile, humanDocs, root)

  /*
   * Retrieval reads this index, so whatever is missing here is invisible to an agent however well
   * it is ranked. The projection puts every entity the snapshot observed in it — documents,
   * modules, areas, packages — next to the routes the configuration declares. It is a function of
   * the snapshot: the index has no scanner of its own, so a record retrieval can find is an entity
   * discovery observed, with the same id and the same content hash.
   */
  const projected = config.retrieval?.corpus?.enabled === false ? undefined : projectFromSnapshot(root, config, opts.snapshot, lookup, curated)
  const projection = projected?.projection
  const inputs = projected ? repositoryInputs(root, config) : undefined
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

  const hashPayload = {
    schemaVersion: 1,
    knowledge,
    handoffs,
    lookup,
    retrieval,
    ...(inputs ? { inputs } : {}),
    ...(projection ? { projection: projection.contentHash } : {}),
  }

  const contentHash = sha256NormalizedV1(hashPayload)
  const index: DocBridgeIndexV1 = {
    schemaVersion: 1,
    contentHash,
    contentHashAlgo: 'sha256-normalized-v1',
    generatedAt: existingGeneratedAt(indexPath, contentHash) ?? new Date().toISOString(),
    project: { name: projectName(root, config), root: '.' },
    knowledge,
    handoffs,
    lookup,
    ...(inputs ? { inputs } : {}),
    retrieval,
    ...(projection ? { projection } : {}),
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
