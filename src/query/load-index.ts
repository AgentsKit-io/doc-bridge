import { restrictServiceRead } from '../execution/repository.js'
import { serviceConfig } from '../execution/config.js'
import { denyServiceOperation, withExecutionProfile, isServiceProfile } from '../execution/profile.js'
import { readJsonArtifact } from '../index-builder/artifact-io.js'
import { readRepositoryFiles, INDEX_READ_PATTERNS } from '../index-builder/repository-io.js'
import { repositoryInputsFromFiles } from '../index-builder/project-corpus.js'
import type { ArtifactIOV1, RepositoryReadV1, StorageRequest, StorageResult } from '../storage/contract.js'
import { contentHashForIndex, sameHashIdentity } from '../index-builder/content-hash.js'
import { existsSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'

import type { DocBridgeConfigV1 } from '../config/schema.js'
import type { DocBridgeIndexV1 } from '../schemas/doc-bridge-index.js'
import { parseDocBridgeIndex } from '../validate.js'
import { buildDocBridgeIndex } from '../index-builder/build-index.js'
import { repositoryInputs } from '../index-builder/project-corpus.js'
import { GRAPH_ANALYZER_VERSION } from '../graph/build.js'
import { SEARCH_LEXICON_VERSION } from './text.js'

export class IndexNotFoundError extends Error {
  constructor(readonly path: string) {
    super(`Missing index at ${path}. Run: ak-docs index`)
    this.name = 'IndexNotFoundError'
  }
}

export class IndexStaleError extends Error {
  constructor(readonly path: string, readonly actual: string, readonly expected: string) {
    super(`Index is stale at ${path}. Run: ak-docs index`)
    this.name = 'IndexStaleError'
  }
}

export const indexFilePath = (root: string, config: DocBridgeConfigV1): string =>
  join(root, config.index?.outFile ?? '.doc-bridge/index.json')

export const loadDocBridgeIndex = (root: string, config: DocBridgeConfigV1): DocBridgeIndexV1 => {
  denyServiceOperation('legacy index read', config)
  const path = indexFilePath(root, config)
  if (!existsSync(path)) throw new IndexNotFoundError(path)
  const raw = JSON.parse(readFileSync(path, 'utf8')) as unknown
  return validateIndex(raw)
}

const validateIndex = (raw: unknown): DocBridgeIndexV1 => {
  const index = parseDocBridgeIndex(raw)
  if (index.projection && index.projection.contentHashAlgo !== index.contentHashAlgo) {
    throw new Error('Index and retrieval projection hash algorithms differ. Explicitly regenerate with ak-docs index.')
  }
  if (index.contentHash !== contentHashForIndex(index)) {
    throw new Error('Invalid index content hash under ' + index.contentHashAlgo + '. Run: ak-docs index')
  }
  return index
}

/**
 * Load only an index whose content matches the current repository inputs.
 *
 * Every query goes through here, so the check has to be cheap. An index that records its inputs
 * is verified by re-hashing those inputs — one walk — instead of rebuilding the whole index,
 * which on a repository of any size meant projecting and parsing the corpus on every search. The
 * hash covers the input files and the configuration, and the recorded lexicon version is checked
 * too, because a changed stopword list changes ranking without changing a single file.
 *
 * An index built before inputs were recorded falls back to the full rebuild, so an older artifact
 * is still validated rather than trusted.
 */
export const loadFreshDocBridgeIndex = (root: string, config: DocBridgeConfigV1): DocBridgeIndexV1 => {
  const index = loadDocBridgeIndex(root, config)

  if (index.inputs && index.retrieval) {
    const inputs = repositoryInputs(root, config, index.contentHashAlgo)
    /*
     * The projection is a function of the snapshot, the overlay and the configuration under a
     * given lexicon and graph-metrics version; a change to either version changes ranking without
     * changing a file, so both are checked next to the inputs.
     */
    const projectionFresh =
      !index.projection ||
      (index.projection.lexiconVersion === SEARCH_LEXICON_VERSION && index.projection.graphMetricsVersion === GRAPH_ANALYZER_VERSION)
    const fresh =
      index.inputs.hash === inputs.hash &&
      index.inputs.projectionVersion === inputs.projectionVersion &&
      index.retrieval.lexiconVersion === SEARCH_LEXICON_VERSION &&
      projectionFresh
    if (!fresh) throw new IndexStaleError(indexFilePath(root, config), index.inputs.hash, inputs.hash)
    return index
  }

  const expected = buildDocBridgeIndex({ root, config, write: false, hashAlgorithm: index.contentHashAlgo }).index
  if (!sameHashIdentity(index, expected)) {
    throw new IndexStaleError(indexFilePath(root, config), index.contentHash, expected.contentHash)
  }
  return index
}

export const resolveRoot = (cwd?: string): string => resolve(cwd ?? process.cwd())

/** Load the exact partition only; never consult the legacy local index. */
export const loadStoredDocBridgeIndex = async (io: ArtifactIOV1, request: StorageRequest): Promise<StorageResult<{ index: DocBridgeIndexV1; byteHash: string }>> => {
  const result = await readJsonArtifact(io, request, { kind: 'index', name: 'index' }, 'DocBridgeIndexV1', validateIndex)
  return result.status === 'ok' ? { status: 'ok', value: { index: result.value.value, byteHash: result.value.byteHash } } : result
}

/** Freshness is checked with verified bytes from the same exact partition. */
export const loadFreshStoredDocBridgeIndex = async (io: ArtifactIOV1, reader: RepositoryReadV1, request: StorageRequest, config: DocBridgeConfigV1): Promise<StorageResult<{ index: DocBridgeIndexV1; byteHash: string }>> => withExecutionProfile(isServiceProfile(config) ? 'service' : request.profile, async () => {
  if (request.profile === 'service' || isServiceProfile(config)) { config = serviceConfig(config).config; reader = restrictServiceRead(reader, config) }
  request = { partition: request.partition, signal: request.signal }
  const loaded = await loadStoredDocBridgeIndex(io, request)
  if (loaded.status !== 'ok') return loaded
  const index = loaded.value.index
  if (!index.inputs || !index.retrieval) return { status: 'denied', code: 'INVALID_CONTRACT' }
  const { files, contentRefs, byteSizes, limitations } = await readRepositoryFiles(reader, request, INDEX_READ_PATTERNS)
  if (limitations.length) return { status: limitations[0]!.status, code: limitations[0]!.code }
  const inputs = repositoryInputsFromFiles(files, config, index.contentHashAlgo, contentRefs, byteSizes)
  const fresh = index.inputs.hash === inputs.hash && index.inputs.projectionVersion === inputs.projectionVersion && index.retrieval.lexiconVersion === SEARCH_LEXICON_VERSION && (!index.projection || (index.projection.lexiconVersion === SEARCH_LEXICON_VERSION && index.projection.graphMetricsVersion === GRAPH_ANALYZER_VERSION))
  return fresh ? loaded : { status: 'mismatch', code: 'CONTENT_MISMATCH' }
})
