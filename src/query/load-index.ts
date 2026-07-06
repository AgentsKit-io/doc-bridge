import { existsSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'

import type { DocBridgeConfigV1 } from '../config/schema.js'
import type { DocBridgeIndexV1 } from '../schemas/doc-bridge-index.js'
import { parseDocBridgeIndex } from '../validate.js'

export class IndexNotFoundError extends Error {
  constructor(readonly path: string) {
    super(`Missing index at ${path}. Run: ak-docs index`)
    this.name = 'IndexNotFoundError'
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

export const resolveRoot = (cwd?: string): string => resolve(cwd ?? process.cwd())