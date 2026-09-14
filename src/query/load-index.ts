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
  const path = indexFilePath(root, config)
  if (!existsSync(path)) throw new IndexNotFoundError(path)
  const raw = JSON.parse(readFileSync(path, 'utf8')) as unknown
  return parseDocBridgeIndex(raw)
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
    const inputs = repositoryInputs(root, config)
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

  const expected = buildDocBridgeIndex({ root, config, write: false }).index
  if (index.contentHash !== expected.contentHash) {
    throw new IndexStaleError(indexFilePath(root, config), index.contentHash, expected.contentHash)
  }
  return index
}

export const resolveRoot = (cwd?: string): string => resolve(cwd ?? process.cwd())
