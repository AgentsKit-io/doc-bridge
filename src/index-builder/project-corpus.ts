import { readFileSync } from 'node:fs'
import { basename, extname, relative, resolve, sep } from 'node:path'
import * as ts from 'typescript'

import type { DocBridgeConfigV1 } from '../config/schema.js'
import { entityId } from '../discovery/identity.js'
import {
  DOCUMENT_EXTENSIONS,
  SOURCE_EXTENSIONS,
  documentClassification,
  exportedNames,
  safeWalkOptions,
  scriptKind,
} from '../discovery/inputs.js'
import { readBoundedText, type TextReadBudget } from '../lib/bounded-text.js'
import {
  extractSearchBody,
  firstHeading,
  firstParagraph,
  frontmatterString,
  frontmatterStringList,
  parseFrontmatter,
} from '../lib/markdown.js'
import { toPosix } from '../lib/paths.js'
import { safeWalkFiles } from '../safety/repository.js'
import type { KnowledgeEntry } from '../schemas/doc-bridge-index.js'
import { sha256NormalizedV1 } from './content-hash.js'

/**
 * Projects the repository into the index that retrieval actually reads.
 *
 * Before this, `index.knowledge` held only the agent sidecars — eleven entries — while the
 * discovery snapshot held hundreds of modules and documents that search could never see. An
 * exported-symbol query therefore returned nothing, however well it was ranked. The projection
 * closes that gap: every documentation file and every source module becomes a retrievable entry
 * carrying its own content hash, its tags, and (for a module) its exported symbols.
 *
 * The same walk produces the entries and the inputs hash, so the hash can never describe a
 * different file set than the one that was projected.
 */

export const CORPUS_PROJECTION_VERSION = 1 as const

/**
 * Entry types the projection produces. Curated corpus entries are always `agent-doc`, so this is
 * what distinguishes a record retrieval discovered from one a human wrote a sidecar for — which
 * surfaces such as llms.txt need, since a reading order is curated, not enumerated.
 */
export const PROJECTED_ENTRY_TYPES = ['document', 'module'] as const

export const isProjectedEntry = (entry: Pick<KnowledgeEntry, 'type'>): boolean =>
  (PROJECTED_ENTRY_TYPES as readonly string[]).includes(entry.type)

/** Documentation body kept for search. Long enough to answer a question, short enough to ship. */
export const DOCUMENT_BODY_LIMIT = 4_000
const MAX_SYMBOLS = 256
const MAX_TAGS = 16
const MAX_DESCRIPTION = 400

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
const INDEX_CONFIGURATION_KEYS = ['project', 'corpus', 'index', 'routing', 'safety', 'retrieval'] as const

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

export type RepositoryCorpus = {
  readonly entries: readonly KnowledgeEntry[]
  readonly inputs: RepositoryInputsV1
  readonly reason?: string
}

export type ProjectCorpusOptions = {
  /** Paths already present in the index. A projected entry never shadows a curated one. */
  readonly skipPaths?: Iterable<string>
  /** Set false to hash the inputs without building entries (the freshness check needs no entries). */
  readonly entries?: boolean
}

type InputFile = {
  readonly absPath: string
  readonly path: string
  readonly kind: 'document' | 'module' | 'configuration'
}

const classifyInput = (path: string, name: string): InputFile['kind'] | undefined => {
  const extension = extname(name)
  if ((DOCUMENT_EXTENSIONS as readonly string[]).includes(extension)) return 'document'
  if ((SOURCE_EXTENSIONS as readonly string[]).includes(extension)) {
    return CONFIG_INPUT_PATTERN.test(path) ? 'configuration' : 'module'
  }
  return CONFIG_INPUT_PATTERN.test(path) ? 'configuration' : undefined
}

const TEST_MODULE_PATTERN = /(?:\.test|\.spec|__tests__)/

const tagList = (values: readonly (string | undefined)[]): string[] =>
  [...new Set(values.filter((value): value is string => Boolean(value)).map((value) => value.slice(0, 64)))].slice(0, MAX_TAGS)

const documentEntry = (file: InputFile, raw: string, contentHash: string): KnowledgeEntry => {
  const { data: frontmatter } = parseFrontmatter(raw)
  const title = frontmatterString(frontmatter, 'title') ?? firstHeading(raw) ?? basename(file.path)
  const description =
    frontmatterString(frontmatter, 'description') ??
    frontmatterString(frontmatter, 'purpose') ??
    firstParagraph(raw, MAX_DESCRIPTION)
  const body = extractSearchBody(raw, DOCUMENT_BODY_LIMIT)
  return {
    id: entityId('document', file.path),
    type: 'document',
    title: title.slice(0, 256),
    path: file.path,
    ...(description ? { description: description.slice(0, 2_048) } : {}),
    ...(body ? { body } : {}),
    tags: tagList([
      'document',
      documentClassification(file.path),
      ...(frontmatterStringList(frontmatter, 'tags') ?? []),
      frontmatterString(frontmatter, 'type'),
    ]),
    contentHash,
  }
}

const moduleEntry = (file: InputFile, raw: string, contentHash: string): KnowledgeEntry => {
  const sourceFile = ts.createSourceFile(file.absPath, raw, ts.ScriptTarget.Latest, true, scriptKind(file.absPath))
  const symbols = exportedNames(sourceFile)
    .filter((name) => name !== '*')
    .map((name) => name.slice(0, 128))
    .slice(0, MAX_SYMBOLS)
  const area = file.path.split('/').slice(0, -1).pop()
  return {
    id: entityId('module', file.path),
    type: 'module',
    title: basename(file.path),
    path: file.path,
    ...(symbols.length ? { symbols } : {}),
    tags: tagList([
      'module',
      extname(file.path).replace('.', '') || undefined,
      TEST_MODULE_PATTERN.test(file.path) ? 'test' : undefined,
      area,
    ]),
    contentHash,
  }
}

/**
 * Walk the repository once, hash every input, and (unless `entries` is false) project the
 * documents and modules into index entries.
 */
export const projectRepositoryCorpus = (
  root: string,
  config: DocBridgeConfigV1 | undefined,
  options: ProjectCorpusOptions = {},
): RepositoryCorpus => {
  const projectRoot = resolve(root)
  const walk = safeWalkFiles(projectRoot, { extensions: INPUT_EXTENSIONS, ...safeWalkOptions(config) })
  const skip = new Set(options.skipPaths ?? [])
  const wantEntries = options.entries ?? true

  const files: InputFile[] = []
  for (const absPath of walk.files) {
    const path = toPosix(relative(projectRoot, absPath).split(sep).join('/'))
    const kind = classifyInput(path, basename(absPath))
    if (!kind) continue
    files.push({ absPath, path, kind })
  }

  const fingerprints: [string, string][] = []
  const entries: KnowledgeEntry[] = []
  const budget: TextReadBudget = { used: 0 }

  for (const file of files) {
    let raw: string
    try {
      raw = file.kind === 'document' ? readBoundedText(file.absPath, budget) : readFileSync(file.absPath, 'utf8')
    } catch {
      // An unreadable input cannot be projected, and must not silently change the hash either.
      fingerprints.push([file.path, 'unreadable'])
      continue
    }
    const contentHash = sha256NormalizedV1(raw)
    fingerprints.push([file.path, contentHash])
    if (!wantEntries || file.kind === 'configuration' || skip.has(file.path)) continue
    entries.push(file.kind === 'document' ? documentEntry(file, raw, contentHash) : moduleEntry(file, raw, contentHash))
  }

  return {
    entries: entries.sort((a, b) => a.id.localeCompare(b.id)),
    inputs: {
      hash: sha256NormalizedV1({
        projectionVersion: CORPUS_PROJECTION_VERSION,
        configurationHash: indexConfigurationHash(config),
        files: fingerprints,
      }),
      fileCount: fingerprints.length,
      projectionVersion: CORPUS_PROJECTION_VERSION,
      ...(walk.incomplete ? { incomplete: true } : {}),
    },
    ...(walk.reason ? { reason: walk.reason } : {}),
  }
}

/** The freshness half of the projection: the same hash, without paying for entry construction. */
export const repositoryInputs = (root: string, config: DocBridgeConfigV1 | undefined): RepositoryInputsV1 =>
  projectRepositoryCorpus(root, config, { entries: false }).inputs
