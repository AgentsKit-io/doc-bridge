import { basename, extname, relative, resolve, sep } from 'node:path'
import { readFileSync } from 'node:fs'

import type { DocBridgeConfigV1 } from '../config/schema.js'
import { DOCUMENT_EXTENSIONS, SOURCE_EXTENSIONS, safeWalkOptions } from '../discovery/inputs.js'
import { toPosix } from '../lib/paths.js'
import { safeWalkFiles } from '../safety/repository.js'
import type { KnowledgeEntry } from '../schemas/doc-bridge-index.js'
import { sha256NormalizedV1 } from './content-hash.js'

/**
 * The freshness fingerprint of the index.
 *
 * This file used to be retrieval's own scanner: it walked the repository, parsed every module and
 * document a second time, and projected them into index records that shared nothing with the
 * snapshot but a path. That projection is now a function of the snapshot (`src/retrieval/project.ts`),
 * and what remains here is the one thing a query needs on every call: a cheap way to tell whether
 * the index on disk still describes the files on disk. One walk, one hash per file, no parsing.
 */

/**
 * Bumped when what the index derives from its inputs changes shape, so an index built by older
 * code is stale by version even when every file matches.
 */
export const CORPUS_PROJECTION_VERSION = 2 as const

/**
 * Entry types the projection produces into `knowledge[]`. Curated corpus entries are always
 * `agent-doc`, so this is what distinguishes a record retrieval discovered from one a human wrote
 * a sidecar for — which surfaces such as llms.txt need, since a reading order is curated, not
 * enumerated.
 */
export const PROJECTED_ENTRY_TYPES = ['document', 'module'] as const

export const isProjectedEntry = (entry: Pick<KnowledgeEntry, 'type'>): boolean =>
  (PROJECTED_ENTRY_TYPES as readonly string[]).includes(entry.type)

/**
 * Configuration files the index is derived from. Narrow on purpose: any `.json` would make an
 * unrelated data file mark the index stale, and a generated artifact could then invalidate the
 * artifact generated from it.
 */
const CONFIG_INPUT_PATTERN =
  /(?:^|\/)(?:package\.json|pnpm-workspace\.ya?ml|tsconfig(?:\.[\w.-]+)?\.json|jsconfig\.json|meta\.json|doc-bridge\.config\.(?:json|ya?ml|js|ts|mjs|cjs))$/

const INPUT_EXTENSIONS = [...new Set([...SOURCE_EXTENSIONS, ...DOCUMENT_EXTENSIONS, '.json', '.yaml', '.yml'])]

/**
 * Configuration sections the index is derived from.
 *
 * The same files under a different configuration project a different index, so the configuration
 * belongs in the fingerprint — but only the part of it that can change the artifact. Hashing the
 * whole configuration would report a stale index when an unrelated section changed (a gate
 * preset, a report option), which is a false alarm that teaches people to ignore the check.
 */
const INDEX_CONFIGURATION_KEYS = ['project', 'corpus', 'index', 'routing', 'safety', 'retrieval', 'analysis'] as const

export const indexConfigurationHash = (config: DocBridgeConfigV1 | undefined): string =>
  sha256NormalizedV1(
    Object.fromEntries(
      INDEX_CONFIGURATION_KEYS.filter((key) => config?.[key] !== undefined).map((key) => [key, config?.[key]]),
    ),
  )

export type RepositoryInputsV1 = {
  /** Hash of every input path and its content. Equal hashes mean an equal projection. */
  readonly hash: string
  readonly fileCount: number
  readonly projectionVersion: number
  /** True when a safety limit stopped the walk, so the file set is not the whole repository. */
  readonly incomplete?: boolean
}

const isInput = (path: string, name: string): boolean => {
  const extension = extname(name)
  if ((DOCUMENT_EXTENSIONS as readonly string[]).includes(extension)) return true
  if ((SOURCE_EXTENSIONS as readonly string[]).includes(extension)) return true
  return CONFIG_INPUT_PATTERN.test(path)
}

/**
 * Walk the repository once and hash every input the index derives from: sources, documents and
 * the configuration files that decide how they resolve.
 */
export const repositoryInputs = (root: string, config: DocBridgeConfigV1 | undefined): RepositoryInputsV1 => {
  const projectRoot = resolve(root)
  const walk = safeWalkFiles(projectRoot, { extensions: INPUT_EXTENSIONS, ...safeWalkOptions(config) })
  const fingerprints: [string, string][] = []

  for (const absPath of walk.files) {
    const path = toPosix(relative(projectRoot, absPath).split(sep).join('/'))
    if (!isInput(path, basename(absPath))) continue
    try {
      fingerprints.push([path, sha256NormalizedV1(readFileSync(absPath, 'utf8'))])
    } catch {
      // An unreadable input cannot be projected, and must not silently change the hash either.
      fingerprints.push([path, 'unreadable'])
    }
  }

  return {
    hash: sha256NormalizedV1({
      projectionVersion: CORPUS_PROJECTION_VERSION,
      configurationHash: indexConfigurationHash(config),
      files: fingerprints,
    }),
    fileCount: fingerprints.length,
    projectionVersion: CORPUS_PROJECTION_VERSION,
    ...(walk.incomplete ? { incomplete: true } : {}),
  }
}
