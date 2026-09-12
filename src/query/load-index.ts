import { existsSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'

import type { DocBridgeConfigV1 } from '../config/schema.js'
import type { DocBridgeIndexV1 } from '../schemas/doc-bridge-index.js'
import { parseDocBridgeIndex } from '../validate.js'
import { buildDocBridgeIndex } from '../index-builder/build-index.js'

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

/** Load only an index whose content matches the current repository inputs. */
export const loadFreshDocBridgeIndex = (root: string, config: DocBridgeConfigV1): DocBridgeIndexV1 => {
  const index = loadDocBridgeIndex(root, config)
  const expected = buildDocBridgeIndex({ root, config, write: false }).index
  if (index.contentHash !== expected.contentHash) {
    throw new IndexStaleError(indexFilePath(root, config), index.contentHash, expected.contentHash)
  }
  return index
}

export const resolveRoot = (cwd?: string): string => resolve(cwd ?? process.cwd())
