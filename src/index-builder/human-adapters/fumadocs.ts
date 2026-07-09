import { existsSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'

import { optionString, scanMarkdownDocs, type HumanAdapter } from './core.js'

type FumadocsMeta = {
  readonly pages?: unknown
}

const readMetaPages = (dir: string): string[] | undefined => {
  const file = join(dir, 'meta.json')
  if (!existsSync(file)) return undefined
  try {
    const meta = JSON.parse(readFileSync(file, 'utf8')) as FumadocsMeta
    return Array.isArray(meta.pages) ? meta.pages.filter((page): page is string => typeof page === 'string') : undefined
  } catch {
    return undefined
  }
}

const pageKey = (part: string): string => part.replace(/\.mdx?$/, '')

const isDotFile = (relPath: string): boolean => {
  const file = relPath.split('/').at(-1) ?? ''
  return file.startsWith('.')
}

const isListedByMeta = (contentRoot: string, relPath: string): boolean => {
  if (isDotFile(relPath)) return false

  const parts = relPath.split('/')

  for (let i = 0; i < parts.length; i += 1) {
    const dir = join(contentRoot, ...parts.slice(0, i))
    const pages = readMetaPages(dir)
    if (!pages?.length || pages.includes('...')) continue

    const key = pageKey(parts[i] ?? '')
    if (!pages.includes(key) && !pages.includes(`./${key}`)) return false
  }

  return true
}

export const fumadocsAdapter: HumanAdapter = {
  plugin: 'fumadocs',
  scan: ({ root, config }) => {
    const contentDir = optionString(config.options, ['contentDir', 'root'])
    if (!contentDir) return []
    const contentRoot = join(root, contentDir)
    const excludePrefixes = Array.isArray(config.options?.excludePrefixes)
      ? config.options.excludePrefixes.filter((v): v is string => typeof v === 'string')
      : typeof config.options?.excludePrefix === 'string'
        ? [config.options.excludePrefix]
        : []
    // Nested agent corpora under Fumadocs (e.g. content/docs/for-agents) should not be human docs
    if (!excludePrefixes.includes('for-agents')) excludePrefixes.push('for-agents')

    return scanMarkdownDocs(root, contentDir, {
      includeRelPath: (relPath) => {
        if (excludePrefixes.some((prefix) => relPath === prefix || relPath.startsWith(`${prefix}/`))) {
          return false
        }
        return isListedByMeta(contentRoot, relPath)
      },
      urlPrefix: config.options?.urlPrefix,
      stripGroups: true,
    })
  },
}
