import { realpathSync } from 'node:fs'
import { isAbsolute, relative, resolve, sep } from 'node:path'

import type { HumanCorpusConfig } from '../../config/schema.js'
import { slugFromPath } from '../../lib/markdown.js'
import { readBoundedText } from '../../lib/bounded-text.js'
import { containedProjectPath, toPosix } from '../../lib/paths.js'
import { walkFiles } from '../../lib/walk.js'

export type HumanDocRecord = {
  readonly id: string
  readonly url: string
  readonly path: string
}

export type HumanDocMap = Record<string, string>

export type HumanAdapterContext = {
  readonly root: string
  readonly config: HumanCorpusConfig
}

export type HumanAdapter = {
  readonly plugin: HumanCorpusConfig['plugin']
  readonly scan: (ctx: HumanAdapterContext) => HumanDocRecord[]
}

export const optionString = (
  options: Record<string, unknown> | undefined,
  keys: readonly string[],
): string | undefined => {
  for (const key of keys) {
    const value = options?.[key]
    if (typeof value === 'string' && value) return value
  }
  return undefined
}

export const parseFrontmatter = (raw: string): Record<string, string> => {
  // Windows-authored (or git autocrlf-checked-out) Markdown commonly uses CRLF;
  // normalize before matching so frontmatter isn't silently dropped there.
  const normalized = raw.includes('\r\n') ? raw.replace(/\r\n/g, '\n') : raw
  if (!normalized.startsWith('---\n')) return {}
  const end = normalized.indexOf('\n---', 4)
  if (end === -1) return {}

  const out: Record<string, string> = {}
  for (const line of normalized.slice(4, end).split('\n')) {
    const match = /^([A-Za-z0-9_-]+):\s*(.+?)\s*$/.exec(line)
    if (match?.[1] && match[2]) out[match[1]] = match[2].replace(/^['"]|['"]$/g, '')
  }
  return out
}

export const docId = (relToHumanRoot: string, raw: string): string => {
  const meta = parseFrontmatter(raw)
  return meta.package ?? meta.module ?? meta.id ?? slugFromPath(relToHumanRoot)
}

export const routeSlug = (relToHumanRoot: string, opts?: { stripGroups?: boolean }): string =>
  relToHumanRoot
    .split('/')
    .filter((part) => !opts?.stripGroups || !/^\(.+\)$/.test(part))
    .join('/')
    .replace(/(?:^|\/)index\.mdx?$/, '')
    .replace(/\.mdx?$/, '')

export const humanUrl = (slug: string, urlPrefix: unknown): string => {
  if (typeof urlPrefix !== 'string' || !urlPrefix) return slug
  const prefix = urlPrefix.replace(/\/$/, '')
  return slug ? `${prefix}/${slug.replace(/^\//, '')}` : prefix
}

export const scanMarkdownDocs = (
  root: string,
  humanRoot: string,
  options?: {
    readonly includeRelPath?: (relToHumanRoot: string, raw: string) => boolean
    readonly idForDoc?: (relToHumanRoot: string, raw: string) => string
    readonly slugForDoc?: (relToHumanRoot: string, raw: string) => string
    readonly urlPrefix?: unknown
    readonly stripGroups?: boolean
  },
): HumanDocRecord[] => {
  const out: HumanDocRecord[] = []
  const projectRoot = realpathSync.native(resolve(root))
  const absRoot = containedProjectPath(root, humanRoot)
  if (!absRoot) return out
  const budget = { used: 0 }

  for (const abs of walkFiles(absRoot, { extensions: ['.md', '.mdx'] })) {
    const canonical = realpathSync.native(abs)
    const fileRelative = relative(projectRoot, canonical)
    if (isAbsolute(fileRelative) || fileRelative === '..' || fileRelative.startsWith(`..${sep}`)) continue
    // Both sides must be toPosix'd before stripping the prefix: `abs` is native-separator
    // (backslashes on Windows), so comparing it raw against a toPosix'd `absRoot` never
    // matches there, silently leaving relToHumanRoot as the full absolute path.
    const relToHumanRoot = toPosix(abs).replace(`${toPosix(absRoot)}/`, '')
    const raw = readBoundedText(abs, budget)
    if (options?.includeRelPath && !options.includeRelPath(relToHumanRoot, raw)) continue
    out.push({
      id: options?.idForDoc?.(relToHumanRoot, raw) ?? docId(relToHumanRoot, raw),
      url: humanUrl(
        options?.slugForDoc?.(relToHumanRoot, raw) ??
          routeSlug(relToHumanRoot, options?.stripGroups ? { stripGroups: true } : undefined),
        options?.urlPrefix,
      ),
      path: abs,
    })
  }

  return out
}
